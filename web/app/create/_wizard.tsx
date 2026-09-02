"use client";

/**
 * Market-creation wizard — calls `MarketFactory` via `@kaido/sdk`.
 */
import { Kaido, type KaidoConfig, distributionMarket } from "@kaido/sdk";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";

import { AdvancedBlock } from "@/components/app/advanced-block";
import { Panel, SectionLabel } from "@/components/app/kaido-ui";
import { BeliefChart } from "@/components/forecast/belief-chart";
import { SnappySlider } from "@/components/ui/snappy-slider";
import { useWallet } from "@/components/wallet/provider";
import { clampSigma, fromWad, sigmaFloor, toWad } from "@/lib/curve";
import {
  convictionFromSigma,
  convictionHint,
  convictionLabel,
  formatOutcome,
} from "@/lib/market-display";
import { cn } from "@/lib/utils";
import { saveMarketQuestion } from "@/lib/market-metadata";

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
  {
    tier: ResolverTier.Reflector,
    key: "reflector" as const,
    label: "Oracle feed",
    short: "Oracle",
    detail: "Settles from an on-chain price feed (e.g. BTC/USD). Best for asset close markets.",
  },
  {
    tier: ResolverTier.Attested,
    key: "attested" as const,
    label: "Attested",
    short: "Attested",
    detail: "A trusted signer posts the final number. Good for custom data sources.",
  },
  {
    tier: ResolverTier.Optimistic,
    key: "optimistic" as const,
    label: "Optimistic",
    short: "Optimistic",
    detail: "Anyone can propose an outcome; disputers can challenge within a window.",
  },
  {
    tier: ResolverTier.Designated,
    key: "designated" as const,
    label: "Designated",
    short: "Designated",
    detail: "A named resolver contract decides. Use when you control settlement logic.",
  },
];

const STEPS = ["Question", "Market type", "Schedule", "Starting crowd", "Settlement"];

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
  const [question, setQuestion] = useState("");
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

  const sigmaMin = sigmaMinWad != null ? Math.max(1e-12, fromWad(sigmaMinWad)) : null;
  const muReal = useMemo(() => {
    const w = safeWad(mu0);
    return w != null ? fromWad(w) : null;
  }, [mu0]);
  const sigmaReal = useMemo(() => {
    const w = safeWad(sigma0);
    return w != null ? fromWad(w) : null;
  }, [sigma0]);

  const convictionRange = useMemo(() => {
    if (sigmaMin == null) return null;
    const anchor = muReal ?? 100_000;
    const span = Math.max(anchor * 0.2, sigmaMin * 8);
    const sigmaMax = Math.max(span / 2, sigmaMin * 16);
    return { sigmaMin, sigmaMax };
  }, [sigmaMin, muReal]);

  useEffect(() => {
    if (convictionRange == null || sigma0.trim() !== "") return;
    const mid = convictionRange.sigmaMin + (convictionRange.sigmaMax - convictionRange.sigmaMin) * 0.5;
    setSigma0(String(mid));
  }, [convictionRange, sigma0]);

  const conviction = useMemo(() => {
    if (convictionRange == null || sigmaReal == null) return null;
    return convictionFromSigma(sigmaReal, convictionRange.sigmaMin, convictionRange.sigmaMax);
  }, [convictionRange, sigmaReal]);

  const convictionSnapValues = useMemo(() => {
    if (convictionRange == null) return [];
    const { sigmaMin: sm, sigmaMax } = convictionRange;
    const span = sigmaMax - sm;
    const toUi = (sigma: number) => sigmaMax - sigma + sm;
    return [toUi(sigmaMax), toUi(sm + 0.75 * span), toUi(sm + 0.5 * span), toUi(sm + 0.25 * span), toUi(sm)];
  }, [convictionRange]);

  const convictionUi =
    convictionRange != null && sigmaReal != null
      ? convictionRange.sigmaMax - sigmaReal + convictionRange.sigmaMin
      : null;

  const onPickTier = (i: number) => {
    setTierIdx(i);
    setResolverAddr(resolvers[TIERS[i].key]);
  };

  const onConvictionChange = (ui: number) => {
    if (convictionRange == null) return;
    const { sigmaMin: sm, sigmaMax } = convictionRange;
    const sigma = sigmaMax - ui + sm;
    setSigma0(String(sigma));
  };

  const submit = async () => {
    if (!wallet) return;
    setSubmitting(true);
    setError(null);
    setCreatedId(null);
    try {
      const q = question.trim();
      if (!q) throw new Error("enter the market question traders will see");
      if (q.length > 280) throw new Error("question must be 280 characters or fewer");
      const kw = required(kWad, "liquidity (k)");
      const bw = required(bWad, "max payout (b)");
      if (bw <= 0n) throw new Error("max payout must be > 0");
      const fee = Number(feeBps);
      if (!Number.isInteger(fee) || fee < 0 || fee > 10_000) throw new Error("fee must be 0…10000 bps");
      const wo = toUnix(windowOpen);
      const wl = toUnix(windowLock);
      const wr = toUnix(windowResolve);
      if (!(wo < wl && wl < wr)) throw new Error("schedule must satisfy open < close < settle");
      if (!resolverAddr.trim()) throw new Error("resolver address required");
      const tier = TIERS[tierIdx].tier;

      let id: string;
      if (mode === "scalar") {
        const m = required(safeWad(mu0), "crowd target");
        const s = required(safeWad(sigma0), "starting conviction");
        if (s <= 0n) throw new Error("starting conviction must be > 0");
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
          if (cps[i] <= cps[i - 1]) throw new Error("checkpoints must be in ascending order");
        }
        if (cps[cps.length - 1] >= wr) throw new Error("last checkpoint must be before settle time");
        const mus0 = checkpoints.map((c, i) => required(safeWad(c.mu0), `checkpoint ${i + 1} crowd target`));
        const sigmas0 = checkpoints.map((c, i) => {
          const v = required(safeWad(c.sigma0), `checkpoint ${i + 1} conviction width`);
          if (v <= 0n) throw new Error(`checkpoint ${i + 1} conviction width must be > 0`);
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
      try {
        await saveMarketQuestion(id, q);
      } catch (e) {
        console.warn("question saved on-chain but metadata write failed:", e);
      }
      setCreatedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to launch market");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-px bg-white/10">
      <Panel className="px-6 py-5 sm:px-8">
        <ol className="flex flex-wrap gap-x-6 gap-y-2">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-2 text-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#d8c69a]/40 font-mono text-[10px] text-[#d8c69a]">
                {i + 1}
              </span>
              <span className="text-white/55">{step}</span>
            </li>
          ))}
        </ol>
      </Panel>

      {/* 1 — Question */}
      <WizardSection step={1} label="What's the question?">
        <p className="text-sm leading-relaxed text-white/55">
          Write it like a trader would read it on the board — clear, specific, and about one number
          (or a path of numbers).
        </p>
        <div className="mt-4 space-y-2">
          <Field label="Market question" hint="Shown on the markets list and trading page">
            <Textarea
              value={question}
              onChange={setQuestion}
              placeholder="Where will BTC close on Dec 31?"
              rows={3}
            />
          </Field>
          {question.trim() && (
            <p className="rounded border border-white/10 bg-[#080809] px-4 py-3 font-serif text-lg leading-snug text-[#f3efe6]">
              {question.trim()}
            </p>
          )}
        </div>
      </WizardSection>

      {/* 2 — Market type */}
      <WizardSection step={2} label="What are traders calling?">
        <p className="text-sm leading-relaxed text-white/55">
          Most markets resolve to a single number — a price close, a score, a count. Path markets track
          multiple checkpoints over time (power-user mode).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ChoiceButton active={mode === "scalar"} onClick={() => setMode("scalar")}>
            One number
          </ChoiceButton>
          <ChoiceButton active={mode === "trajectory"} onClick={() => setMode("trajectory")}>
            Path market
          </ChoiceButton>
        </div>
        {mode === "trajectory" && (
          <p className="mt-3 text-xs leading-relaxed text-white/40">
            Traders share one pool across checkpoints. Each checkpoint gets its own crowd target and
            conviction width.
          </p>
        )}
      </WizardSection>

      {/* 3 — Schedule */}
      <WizardSection step={3} label="When can people trade?">
        <p className="text-sm leading-relaxed text-white/55">
          Trading opens, then locks before settlement. After lock, positions are frozen until the
          outcome is posted.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Trading opens" hint="First moment beliefs can be placed">
            <Input type="datetime-local" value={windowOpen} onChange={setWindowOpen} />
          </Field>
          <Field label="Trading closes" hint="No new positions after this">
            <Input type="datetime-local" value={windowLock} onChange={setWindowLock} />
          </Field>
          <Field label="Settles" hint="Outcome is finalized">
            <Input type="datetime-local" value={windowResolve} onChange={setWindowResolve} />
          </Field>
        </div>
      </WizardSection>

      {/* 4 — Starting crowd */}
      <WizardSection step={4} label="Seed the starting crowd">
        <p className="text-sm leading-relaxed text-white/55">
          Where does the crowd lean on day one? This becomes the baseline traders fade or follow.
          You can leave defaults and let the first trades move it.
        </p>

        {mode === "scalar" ? (
          <div className="mt-5 space-y-5">
            <Field label="Crowd target" hint="The number the crowd starts near">
              <Input value={mu0} onChange={setMu0} placeholder="e.g. 105000" />
            </Field>
            {muReal != null && Number.isFinite(muReal) && (
              <p className="-mt-2 text-center font-serif text-2xl tabular-nums text-[#f3efe6]">
                {formatOutcome(muReal)}
              </p>
            )}

            {convictionRange != null && convictionSnapValues.length > 0 ? (
              <div className="space-y-1">
                <SnappySlider
                  label="Starting conviction"
                  tone="kaido"
                  values={convictionSnapValues}
                  defaultValue={convictionUi ?? convictionRange.sigmaMax}
                  value={convictionUi ?? undefined}
                  onChange={onConvictionChange}
                  min={convictionRange.sigmaMin}
                  max={convictionRange.sigmaMax}
                  step={(convictionRange.sigmaMax - convictionRange.sigmaMin) / 100}
                  snapping
                  config={{
                    snappingThreshold: (convictionRange.sigmaMax - convictionRange.sigmaMin) * 0.04,
                    labelFormatter: (ui) =>
                      convictionLabel(
                        convictionFromSigma(
                          convictionRange.sigmaMax - ui + convictionRange.sigmaMin,
                          convictionRange.sigmaMin,
                          convictionRange.sigmaMax,
                        ),
                      ),
                  }}
                />
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
                  <span>Wide</span>
                  <span>Tight</span>
                </div>
                {conviction != null && (
                  <p className="text-[11px] text-white/40">{convictionHint(conviction)}</p>
                )}
                <p className="text-[11px] text-white/35">
                  Tighter starting crowd = sharper consensus. Wider = more room for disagreement early on.
                </p>
              </div>
            ) : (
              <Field
                label="Starting conviction (width)"
                hint="Set liquidity params in advanced settings to use the conviction slider"
              >
                <Input
                  value={sigma0}
                  onChange={setSigma0}
                  placeholder={sigmaMin != null ? `≥ ${sigmaMin.toPrecision(4)}` : "e.g. 2500"}
                />
              </Field>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-2 sm:grid">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">When</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Crowd target</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Width</span>
              <span />
            </div>
            {checkpoints.map((c, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <Field label={i === 0 ? "When" : undefined}>
                  <Input type="datetime-local" value={c.at} onChange={(v) => updateCp(setCheckpoints, i, { at: v })} />
                </Field>
                <Field label={i === 0 ? "Crowd target" : undefined}>
                  <Input value={c.mu0} onChange={(v) => updateCp(setCheckpoints, i, { mu0: v })} placeholder="105000" />
                </Field>
                <Field label={i === 0 ? "Width" : undefined}>
                  <Input value={c.sigma0} onChange={(v) => updateCp(setCheckpoints, i, { sigma0: v })} placeholder="2500" />
                </Field>
                <div className="flex items-end">
                  <IconButton
                    onClick={() => setCheckpoints((cs) => cs.filter((_, j) => j !== i))}
                    disabled={checkpoints.length <= 1}
                    label="Remove checkpoint"
                  >
                    ✕
                  </IconButton>
                </div>
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
            <SectionLabel>Starting payoff zone</SectionLabel>
            {mode === "scalar"
              ? (() => {
                  const muW = safeWad(mu0);
                  const sigW = safeWad(sigma0);
                  if (muW == null || sigW == null) {
                    return (
                      <p className="text-xs text-white/40">
                        Enter a crowd target and conviction to preview the starting curve.
                      </p>
                    );
                  }
                  const muR = fromWad(muW);
                  const sigR = Math.max(1e-12, fromWad(sigW));
                  return (
                    <BeliefChart
                      mode="scalar"
                      market={{ kWad, bWad, capped }}
                      range={{ min: muR - 5 * sigR, max: muR + 5 * sigR }}
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

      {/* 5 — Settlement */}
      <WizardSection step={5} label="How does it settle?">
        <p className="text-sm leading-relaxed text-white/55">
          Pick how the final number gets on-chain. Oracle feed is the default for price markets.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIERS.map((t, i) => (
            <ChoiceButton key={t.key} active={tierIdx === i} onClick={() => onPickTier(i)}>
              {t.short}
            </ChoiceButton>
          ))}
        </div>
        <p className="mt-3 text-sm text-[#f3efe6]">{TIERS[tierIdx].label}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/45">{TIERS[tierIdx].detail}</p>
      </WizardSection>

      {/* Advanced economics + resolver contract */}
      <AdvancedBlock title="Advanced — liquidity, fees & resolver contract">
        <div className="space-y-6">
          <div>
            <p className="mb-4 text-xs leading-relaxed text-white/45">
              These on-chain parameters control pool depth, max payout, and trading fees. Defaults work
              for testnet launches.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Liquidity (k)"><Input value={k} onChange={setK} /></Field>
              <Field label="Max payout (b)"><Input value={b} onChange={setB} /></Field>
              <Field label="Fee (bps)"><Input value={feeBps} onChange={setFeeBps} /></Field>
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              Min conviction width:{" "}
              <span className="text-[#d8c69a]">
                {sigmaMinWad != null ? fromWad(sigmaMinWad).toPrecision(6) : "—"}
              </span>
              {capped ? " · capped mode allows tighter beliefs" : " · beliefs below this are rejected"}
            </p>
            <label className="mt-5 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={capped}
                onChange={(e) => setCapped(e.target.checked)}
                className="mt-0.5 size-4 rounded border-white/20 bg-transparent accent-[#d8c69a]"
              />
              <span className="text-sm text-white/65">
                <span className="text-[#f3efe6]">Capped beliefs</span> — allow conviction tighter than
                the minimum; payout density capped at max payout
              </span>
            </label>
          </div>

          <div className="border-t border-white/10 pt-6">
            <Field label="Resolver contract address">
              <Input value={resolverAddr} onChange={setResolverAddr} mono />
            </Field>
            <p className="mt-2 text-xs text-white/40">
              Pre-filled with the deployed default for {TIERS[tierIdx].short.toLowerCase()}. Override
              only if you deployed a custom resolver.
            </p>
          </div>
        </div>
      </AdvancedBlock>

      {/* Submit */}
      <Panel className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {!wallet ? (
            <p className="text-sm text-white/50">
              {connecting ? "Connecting wallet…" : "Connect Freighter to launch the market."}
            </p>
          ) : createdId ? (
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300/80">
                Market is live
              </p>
              <p className="text-sm text-white/65">
                Traders can start placing beliefs.{" "}
                <Link className="font-mono text-[#d8c69a] underline underline-offset-4" href={`/markets/${createdId}`}>
                  Open market →
                </Link>
              </p>
            </div>
          ) : (
            <p className="text-sm text-white/50">
              Launches on <span className="font-mono text-[#d8c69a]">{config.network}</span>. You sign
              one transaction — no hidden steps.
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
            {submitting ? "Launching…" : "Launch market"}
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

function WizardSection({
  step,
  label,
  children,
}: {
  step: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-[#d8c69a]/35 font-mono text-[11px] text-[#d8c69a]">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-xl tracking-[-0.02em] text-[#f3efe6]">{label}</h2>
          <div className="mt-4">{children}</div>
        </div>
      </div>
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
      className={cn(
        "rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
        active
          ? "border-[#d8c69a]/50 bg-[#d8c69a]/15 text-[#f3efe6]"
          : "border-white/15 text-white/45 hover:border-white/30 hover:text-white/70",
      )}
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

function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</span>
      )}
      {children}
      {hint && <span className="text-[11px] text-white/35">{hint}</span>}
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
      className={cn(
        "w-full border border-white/15 bg-[#0b0b0c] px-3 py-2.5 text-sm text-[#f3efe6] outline-none transition-colors placeholder:text-white/25 focus-visible:border-[#d8c69a]/40 focus-visible:ring-1 focus-visible:ring-[#d8c69a]/30",
        mono && "font-mono text-xs",
      )}
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-y border border-white/15 bg-[#0b0b0c] px-3 py-2.5 text-sm leading-relaxed text-[#f3efe6] outline-none transition-colors placeholder:text-white/25 focus-visible:border-[#d8c69a]/40 focus-visible:ring-1 focus-visible:ring-[#d8c69a]/30"
    />
  );
}
