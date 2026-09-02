"use client";

/**
 * Market-creation wizard — calls `MarketFactory` via `@kaido/sdk`.
 */
import { Kaido, type KaidoConfig, distributionMarket } from "@kaido/sdk";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Panel, SectionLabel } from "@/components/app/kaido-ui";
import { BeliefChart } from "@/components/forecast/belief-chart";
import { useWallet } from "@/components/wallet/provider";
import { clampSigma, fromWad, sigmaFloor, toWad } from "@/lib/curve";

const { ResolverTier } = distributionMarket;

export interface DefaultResolvers {
  reflector: string;
  attested: string;
  optimistic: string;
  designated: string;
}

type Mode = "scalar" | "trajectory";

interface CheckpointRow {
  at: string;
  mu0: string;
  sigma0: string;
}

const TIERS = [
  { tier: ResolverTier.Reflector, key: "reflector" as const, label: "T0 · Reflector", short: "T0" },
  { tier: ResolverTier.Attested, key: "attested" as const, label: "T1 · Attested", short: "T1" },
  { tier: ResolverTier.Optimistic, key: "optimistic" as const, label: "T2 · Optimistic", short: "T2" },
  { tier: ResolverTier.Designated, key: "designated" as const, label: "T3 · Designated", short: "T3" },
];

function toUnix(dtLocal: string): bigint {
  const ms = new Date(dtLocal).getTime();
  if (!Number.isFinite(ms)) throw new Error(`invalid date: ${dtLocal}`);
  return BigInt(Math.floor(ms / 1000));
}

function nowPlus(mins: number): string {
  const d = new Date(Date.now() + mins * 60_000);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function CreateMarketWizard({
  config,
  resolvers,
}: {
  config: KaidoConfig;
  resolvers: DefaultResolvers;
}) {
  const { wallet, connecting } = useWallet();
  const kaido = useMemo(() => new Kaido(config), [config]);

  const [mode, setMode] = useState<Mode>("scalar");
  const [k, setK] = useState("1");
  const [b, setB] = useState("1");
  const [feeBps, setFeeBps] = useState("30");
  const [capped, setCapped] = useState(false);
  const [tierIdx, setTierIdx] = useState(0);
  const [resolverAddr, setResolverAddr] = useState(resolvers.reflector);
  const [windowOpen, setWindowOpen] = useState(() => nowPlus(2));
  const [windowLock, setWindowLock] = useState(() => nowPlus(12));
  const [windowResolve, setWindowResolve] = useState(() => nowPlus(15));
  const [mu0, setMu0] = useState("");
  const [sigma0, setSigma0] = useState("");
  const [checkpoints, setCheckpoints] = useState<CheckpointRow[]>([
    { at: nowPlus(13), mu0: "", sigma0: "" },
    { at: nowPlus(14), mu0: "", sigma0: "" },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const kWad = useMemo(() => safeWad(k), [k]);
  const bWad = useMemo(() => safeWad(b), [b]);
  const sigmaMinWad = useMemo(() => {
    if (kWad == null || bWad == null || bWad <= 0n || kWad < 0n) return null;
    try {
      return sigmaFloor(kWad, bWad);
    } catch {
      return null;
    }
  }, [kWad, bWad]);

  const onPickTier = (i: number) => {
    setTierIdx(i);
    setResolverAddr(resolvers[TIERS[i].key]);
  };

  const submit = async () => {
    if (!wallet) return;
    setSubmitting(true);
    setError(null);
    setCreatedId(null);
    try {
      const kw = required(kWad, "k");
      const bw = required(bWad, "b");
      if (bw <= 0n) throw new Error("b must be > 0");
      const fee = Number(feeBps);
      if (!Number.isInteger(fee) || fee < 0 || fee > 10_000) throw new Error("fee bps must be 0…10000");
      const wo = toUnix(windowOpen);
      const wl = toUnix(windowLock);
      const wr = toUnix(windowResolve);
      if (!(wo < wl && wl < wr)) throw new Error("window must satisfy open < lock < resolve");
      if (!resolverAddr.trim()) throw new Error("resolver address required");
      const tier = TIERS[tierIdx].tier;

      let id: string;
      if (mode === "scalar") {
        const m = required(safeWad(mu0), "initial μ");
        const s = required(safeWad(sigma0), "initial σ");
        if (s <= 0n) throw new Error("initial σ must be > 0");
        id = await kaido.createMarket(
          {
            k: kw, b: bw, feeBps: fee, resolver: resolverAddr.trim(), tier,
            windowOpen: wo, windowLock: wl, windowResolve: wr, mu0: m, sigma0: s,
            capped,
          },
          wallet.signer,
        );
      } else {
        if (checkpoints.length < 1) throw new Error("add at least one checkpoint");
        const cps = checkpoints.map((c) => toUnix(c.at));
        for (let i = 1; i < cps.length; i++) {
          if (cps[i] <= cps[i - 1]) throw new Error("checkpoints must be strictly ascending");
        }
        if (cps[cps.length - 1] >= wr) throw new Error("last checkpoint must be before resolve");
        const mus0 = checkpoints.map((c, i) => required(safeWad(c.mu0), `checkpoint ${i + 1} μ`));
        const sigmas0 = checkpoints.map((c, i) => {
          const v = required(safeWad(c.sigma0), `checkpoint ${i + 1} σ`);
          if (v <= 0n) throw new Error(`checkpoint ${i + 1} σ must be > 0`);
          return v;
        });
        id = await kaido.createTrajectoryMarket(
          {
            k: kw, b: bw, feeBps: fee, resolver: resolverAddr.trim(), tier,
            checkpoints: cps, windowOpen: wo, windowLock: wl, windowResolve: wr, mus0, sigmas0,
          },
          wallet.signer,
        );
      }
      setCreatedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create market");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-px bg-white/10">
      {/* Outcome space */}
      <WizardSection label="Outcome space">
        <p className="text-sm leading-relaxed text-white/55">
          Scalar — one resolved number (a price, a margin, a count). Trajectory markets share one collateral pool across checkpoints.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ChoiceButton active={mode === "scalar"} onClick={() => setMode("scalar")}>
            Scalar
          </ChoiceButton>
          <ChoiceButton
            active={mode === "trajectory"}
            onClick={() => setMode("trajectory")}
          >
            Trajectory
          </ChoiceButton>
        </div>
        {mode === "trajectory" && (
          <p className="mt-3 text-xs text-white/40">
            Technical μ/σ per checkpoint — simplified trajectory UX ships later.
          </p>
        )}
      </WizardSection>

      {/* Economics */}
      <WizardSection label="Market economics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="k — liquidity (L²-norm)"><Input value={k} onChange={setK} /></Field>
          <Field label="b — max payout"><Input value={b} onChange={setB} /></Field>
          <Field label="Fee (bps)"><Input value={feeBps} onChange={setFeeBps} /></Field>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          σ-floor:{" "}
          <span className="text-[#d8c69a]">
            {sigmaMinWad != null ? fromWad(sigmaMinWad).toPrecision(6) : "—"}
          </span>
          {capped ? " · capped mode allows sharp beliefs" : " · beliefs below this are rejected"}
        </p>

        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={capped}
            onChange={(e) => setCapped(e.target.checked)}
            className="mt-0.5 size-4 rounded border-white/20 bg-transparent accent-[#d8c69a]"
          />
          <span className="text-sm text-white/65">
            <span className="text-[#f3efe6]">Capped Gaussian</span> — allow σ below σ<sub>min</sub>; payout density capped at b
          </span>
        </label>
      </WizardSection>

      {/* Resolver */}
      <WizardSection label="Resolver">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIERS.map((t, i) => (
            <ChoiceButton key={t.key} active={tierIdx === i} onClick={() => onPickTier(i)}>
              {t.short}
            </ChoiceButton>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/45">{TIERS[tierIdx].label}</p>
        <div className="mt-4">
          <Field label="Resolver contract">
            <Input value={resolverAddr} onChange={setResolverAddr} mono />
          </Field>
          <p className="mt-2 text-xs text-white/40">
            Pre-filled with the deployed default. Paste any resolver — its declared tier is the badge users see.
          </p>
        </div>
      </WizardSection>

      {/* Window */}
      <WizardSection label="Trading window">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Open"><Input type="datetime-local" value={windowOpen} onChange={setWindowOpen} /></Field>
          <Field label="Lock trades"><Input type="datetime-local" value={windowLock} onChange={setWindowLock} /></Field>
          <Field label="Resolve"><Input type="datetime-local" value={windowResolve} onChange={setWindowResolve} /></Field>
        </div>
      </WizardSection>

      {/* Initial belief */}
      <WizardSection label="Initial consensus belief">
        {mode === "scalar" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="μ — center"><Input value={mu0} onChange={setMu0} placeholder="e.g. 65000" /></Field>
            <Field label="σ — width">
              <Input
                value={sigma0}
                onChange={setSigma0}
                placeholder={`≥ ${sigmaMinWad != null ? fromWad(sigmaMinWad).toPrecision(4) : "σ_min"}`}
              />
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            {checkpoints.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Input type="datetime-local" value={c.at} onChange={(v) => updateCp(setCheckpoints, i, { at: v })} />
                <Input value={c.mu0} onChange={(v) => updateCp(setCheckpoints, i, { mu0: v })} placeholder="μ" />
                <Input value={c.sigma0} onChange={(v) => updateCp(setCheckpoints, i, { sigma0: v })} placeholder="σ" />
                <IconButton
                  onClick={() => setCheckpoints((cs) => cs.filter((_, j) => j !== i))}
                  disabled={checkpoints.length <= 1}
                  label="Remove checkpoint"
                >
                  ✕
                </IconButton>
              </div>
            ))}
            <ChoiceButton
              active={false}
              onClick={() => setCheckpoints((cs) => [...cs, { at: nowPlus(13 + cs.length), mu0: "", sigma0: "" }])}
            >
              + Add checkpoint
            </ChoiceButton>
          </div>
        )}

        {kWad != null && bWad != null && bWad > 0n && (
          <div className="mt-6 space-y-2">
            <SectionLabel>Curve preview</SectionLabel>
            {mode === "scalar"
              ? (() => {
                  const muW = safeWad(mu0);
                  const sigW = safeWad(sigma0);
                  if (muW == null || sigW == null) {
                    return <p className="text-xs text-white/40">Enter μ and σ to preview the curve.</p>;
                  }
                  const muReal = fromWad(muW);
                  const sigReal = Math.max(1e-12, fromWad(sigW));
                  return (
                    <BeliefChart
                      mode="scalar"
                      market={{ kWad, bWad, capped }}
                      range={{ min: muReal - 5 * sigReal, max: muReal + 5 * sigReal }}
                      consensus={{ muWad: muW, sigmaWad: capped ? sigW : clampSigma(sigW, { kWad, bWad }) }}
                    />
                  );
                })()
              : (() => {
                  const cps = checkpoints.map((c) => {
                    const ms = new Date(c.at).getTime();
                    return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
                  });
                  const musW = checkpoints.map((c) => safeWad(c.mu0));
                  const sigsW = checkpoints.map((c) => safeWad(c.sigma0));
                  if (cps.some((x) => !Number.isFinite(x)) || musW.some((v) => v == null) || sigsW.some((v) => v == null)) {
                    return <p className="text-xs text-white/40">Fill every checkpoint to preview the path.</p>;
                  }
                  return (
                    <BeliefChart
                      mode="trajectory"
                      market={{ kWad }}
                      checkpoints={cps}
                      consensusMus={[]}
                      youMus={musW.map((v) => fromWad(v as bigint))}
                      youSigmas={sigsW.map((v) => fromWad(clampSigma(v as bigint, { kWad, bWad })))}
                    />
                  );
                })()}
          </div>
        )}
      </WizardSection>

      {/* Submit */}
      <Panel className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {!wallet ? (
            <p className="text-sm text-white/50">
              {connecting ? "Connecting wallet…" : "Connect Freighter to deploy the market."}
            </p>
          ) : createdId ? (
            <p className="text-sm text-white/65">
              Market deployed.{" "}
              <Link className="font-mono text-[#d8c69a] underline underline-offset-4" href={`/markets/${createdId}`}>
                {createdId.slice(0, 10)}…
              </Link>
            </p>
          ) : (
            <p className="text-sm text-white/50">
              Submits via <span className="font-mono text-white/65">MarketFactory</span> on{" "}
              <span className="font-mono text-[#d8c69a]">{config.network}</span>
            </p>
          )}
        </div>

        {wallet && !createdId && (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-full bg-[#f3efe6] px-8 py-3.5 text-[12px] font-medium uppercase tracking-[0.18em] text-[#0b0b0c] transition-all hover:bg-white disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create market"}
          </button>
        )}
      </Panel>

      {error && (
        <Panel className="border-red-500/30 bg-red-500/5 px-6 py-4">
          <p className="text-sm text-red-300">{error}</p>
        </Panel>
      )}
    </div>
  );
}

// --- helpers ----------------------------------------------------------------

function WizardSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Panel className="p-6 sm:p-8">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-4">{children}</div>
    </Panel>
  );
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
        active
          ? "border-[#d8c69a]/50 bg-[#d8c69a]/15 text-[#f3efe6]"
          : "border-white/15 text-white/45 hover:border-white/30 hover:text-white/70"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/45 transition-colors hover:border-white/30 hover:text-white/70 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function safeWad(s: string): bigint | null {
  const t = s.trim();
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  try {
    return toWad(n);
  } catch {
    return null;
  }
}

function required(v: bigint | null, name: string): bigint {
  if (v == null) throw new Error(`${name}: enter a valid number`);
  return v;
}

function updateCp(
  set: React.Dispatch<React.SetStateAction<CheckpointRow[]>>,
  i: number,
  patch: Partial<CheckpointRow>,
) {
  set((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full border border-white/15 bg-[#0b0b0c] px-3 py-2.5 text-sm text-[#f3efe6] outline-none transition-colors placeholder:text-white/25 focus-visible:border-[#d8c69a]/40 focus-visible:ring-1 focus-visible:ring-[#d8c69a]/30 ${mono ? "font-mono text-xs" : ""}`}
    />
  );
}
