"use client";

/**
 * Market-creation wizard (build.md E3) — calls `MarketFactory` via `@kaido/sdk`.
 *
 * Pick a scalar or trajectory outcome space, set `k`/`b`/fee, choose a resolver
 * tier (the deployed default resolver for that tier is pre-filled; you can paste
 * any resolver address — its declared tier is what the badge will show), set the
 * open/lock/resolve window, and give the initial consensus belief. The wizard
 * previews `σ_min(k,b)` so you can't ship a belief the contract's solvency
 * re-check would reject. Numbers are entered in human units; everything is
 * converted to WAD (1e18) on the way in (`web/lib/curve` `toWad`, the same
 * scale `kaido-math` uses).
 */
import { Kaido, type KaidoConfig, distributionMarket } from "@kaido/sdk";
import Link from "next/link";
import { useMemo, useState } from "react";

import { BeliefChart } from "@/components/forecast/belief-chart";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/provider";
import { clampSigma, fromWad, sigmaFloor, toWad } from "@/lib/curve";

const { ResolverTier } = distributionMarket;

/** The deployed default resolver address for each tier, from `config/networks.*.json`. */
export interface DefaultResolvers {
  reflector: string;
  attested: string;
  optimistic: string;
  designated: string;
}

type Mode = "scalar" | "trajectory";

interface CheckpointRow {
  /** datetime-local string. */
  at: string;
  mu0: string;
  sigma0: string;
}

const TIERS = [
  { tier: ResolverTier.Reflector, key: "reflector" as const, label: "T0 · Reflector oracle" },
  { tier: ResolverTier.Attested, key: "attested" as const, label: "T1 · Attested" },
  { tier: ResolverTier.Optimistic, key: "optimistic" as const, label: "T2 · Optimistic" },
  { tier: ResolverTier.Designated, key: "designated" as const, label: "T3 · Designated" },
];

function toUnix(dtLocal: string): bigint {
  const ms = new Date(dtLocal).getTime();
  if (!Number.isFinite(ms)) throw new Error(`invalid date: ${dtLocal}`);
  return BigInt(Math.floor(ms / 1000));
}

function nowPlus(mins: number): string {
  const d = new Date(Date.now() + mins * 60_000);
  // datetime-local wants local time without the Z.
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [k, setK] = useState("1");
  const [b, setB] = useState("1");
  const [feeBps, setFeeBps] = useState("30");
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Create a market</h1>
        <p className="text-sm text-muted-foreground">
          Permissionless. This calls <code className="font-mono">MarketFactory</code> on{" "}
          <span className="font-mono">{config.network}</span> via your connected wallet.
        </p>
      </header>

      <Field label="Outcome space">
        <p className="text-sm text-muted-foreground">
          Scalar — one resolved value (e.g. a price at a time, an election margin).
        </p>
        <details
          className="mt-2 rounded-md border px-3 py-2"
          open={showAdvanced}
          onToggle={(e) => {
            const open = (e.target as HTMLDetailsElement).open;
            setShowAdvanced(open);
            if (!open) setMode("scalar");
          }}
        >
          <summary className="cursor-pointer text-sm font-medium">Advanced — trajectory markets</summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Multiple checkpoints sharing one collateral pool. Technical μ/σ per checkpoint — simplified UX later.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "scalar" ? "default" : "outline"}
              onClick={() => setMode("scalar")}
            >
              Scalar
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "trajectory" ? "default" : "outline"}
              onClick={() => setMode("trajectory")}
            >
              Trajectory
            </Button>
          </div>
        </details>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="k (liquidity, L²-norm)"><Input value={k} onChange={setK} /></Field>
        <Field label="b (max payout per outcome)"><Input value={b} onChange={setB} /></Field>
        <Field label="fee (bps)"><Input value={feeBps} onChange={setFeeBps} /></Field>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        σ-floor for these k, b:{" "}
        <span className="font-mono">{sigmaMinWad != null ? fromWad(sigmaMinWad).toPrecision(6) : "—"}</span>{" "}
        — every belief σ must be ≥ this or the contract rejects it.
      </p>

      <Field label="Resolver tier">
        <div className="flex flex-wrap gap-2">
          {TIERS.map((t, i) => (
            <Button key={t.key} type="button" size="sm" variant={tierIdx === i ? "default" : "outline"} onClick={() => onPickTier(i)}>
              {t.label}
            </Button>
          ))}
        </div>
      </Field>
      <Field label="Resolver contract address">
        <Input value={resolverAddr} onChange={setResolverAddr} mono />
        <p className="mt-1 text-xs text-muted-foreground">
          Pre-filled with the deployed default for the tier. Paste any resolver — its declared tier is the badge users see.
        </p>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Window — open"><Input type="datetime-local" value={windowOpen} onChange={setWindowOpen} /></Field>
        <Field label="lock (no more trades)"><Input type="datetime-local" value={windowLock} onChange={setWindowLock} /></Field>
        <Field label="resolve"><Input type="datetime-local" value={windowResolve} onChange={setWindowResolve} /></Field>
      </div>

      {mode === "scalar" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="initial consensus μ"><Input value={mu0} onChange={setMu0} placeholder="e.g. 65000" /></Field>
          <Field label="initial consensus σ"><Input value={sigma0} onChange={setSigma0} placeholder={`≥ ${sigmaMinWad != null ? fromWad(sigmaMinWad).toPrecision(4) : "σ_min"}`} /></Field>
        </div>
      ) : (
        <Field label="Checkpoints (time · initial μ · initial σ)">
          <div className="flex flex-col gap-2">
            {checkpoints.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Input type="datetime-local" value={c.at} onChange={(v) => updateCp(setCheckpoints, i, { at: v })} />
                <Input value={c.mu0} onChange={(v) => updateCp(setCheckpoints, i, { mu0: v })} placeholder="μ" />
                <Input value={c.sigma0} onChange={(v) => updateCp(setCheckpoints, i, { sigma0: v })} placeholder="σ" />
                <Button type="button" size="sm" variant="ghost" onClick={() => setCheckpoints((cs) => cs.filter((_, j) => j !== i))} disabled={checkpoints.length <= 1}>
                  ✕
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setCheckpoints((cs) => [...cs, { at: nowPlus(13 + cs.length), mu0: "", sigma0: "" }])}>
              + checkpoint
            </Button>
          </div>
        </Field>
      )}

      {kWad != null && bWad != null && bWad > 0n && (
        <div className="space-y-1">
          <span className="text-sm font-medium">Initial belief preview</span>
          {mode === "scalar"
            ? (() => {
                const muW = safeWad(mu0);
                const sigW = safeWad(sigma0);
                if (muW == null || sigW == null) {
                  return <p className="text-xs text-muted-foreground">enter μ and σ to preview the curve.</p>;
                }
                const muReal = fromWad(muW);
                const sigReal = Math.max(1e-12, fromWad(sigW));
                return (
                  <BeliefChart
                    mode="scalar"
                    market={{ kWad, bWad }}
                    range={{ min: muReal - 5 * sigReal, max: muReal + 5 * sigReal }}
                    consensus={{ muWad: muW, sigmaWad: clampSigma(sigW, { kWad, bWad }) }}
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
                  return <p className="text-xs text-muted-foreground">fill every checkpoint to preview the path.</p>;
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

      <div className="flex items-center gap-3">
        {!wallet ? (
          <span className="text-sm text-muted-foreground">{connecting ? "connecting…" : "connect a wallet to create"}</span>
        ) : (
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Creating…" : "Create market"}
          </Button>
        )}
        {createdId && (
          <span className="text-sm">
            Created <Link className="font-mono underline" href={`/markets/${createdId}`}>{createdId.slice(0, 8)}…</Link>
          </span>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// --- small form helpers ----------------------------------------------------

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
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
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
      className={`rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${mono ? "font-mono text-xs" : ""}`}
    />
  );
}
