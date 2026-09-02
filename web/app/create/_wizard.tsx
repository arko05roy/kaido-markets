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
import { BinaryOddsBar } from "@/components/forecast/binary-odds-bar";
import { CreateReviewModal, CreateSuccessModal } from "@/components/modals/first-visit-modal";
import { SnappySlider } from "@/components/ui/snappy-slider";
import { useWallet } from "@/components/wallet/provider";
import { clampSigma, fromWad, sigmaFloor, toWad } from "@/lib/curve";
import {
  convictionFromSigma,
  convictionHint,
  convictionLabel,
} from "@/lib/market-display";
import { clientSettlementAsset } from "@/lib/settlement-asset";
import { seedMarketLiquidity } from "@/lib/seed-market";
import { saveMarketMetadata } from "@/lib/market-metadata";
import { cn } from "@/lib/utils";
import {
  chartRangeForConfig,
  defaultBinaryConfig,
  defaultKaidoConfig,
  defaultOpeningCall,
  defaultOpeningWidth,
  evenDivisions,
  formatXTick,
  type MarketStyle,
  type OutcomeConfig,
} from "@/lib/outcome-scale";
import { RangeSlider } from "@/components/forecast/range-slider";

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

const STEPS = ["Question", "Market type", "Schedule", "Outcomes", "Opening curve", "Settlement"];

const DIVISION_PRESETS = [3, 4, 5, 6, 8, 10] as const;

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
  const [marketStyle, setMarketStyle] = useState<MarketStyle>("binary");
  const [optionLow, setOptionLow] = useState("No");
  const [optionHigh, setOptionHigh] = useState("Yes");
  const [rangeMin, setRangeMin] = useState("0");
  const [rangeMax, setRangeMax] = useState("100");
  const [divisionCount, setDivisionCount] = useState("5");
  const [divisionValues, setDivisionValues] = useState<string[]>(() =>
    evenDivisions(0, 100, 5).map(String),
  );
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const outcomeConfig = useMemo((): OutcomeConfig | null => {
    if (mode !== "scalar") return null;
    if (marketStyle === "binary") {
      return {
        ...defaultBinaryConfig(),
        optionLow: optionLow.trim() || "No",
        optionHigh: optionHigh.trim() || "Yes",
      };
    }
    const min = Number(rangeMin);
    const max = Number(rangeMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return null;
    const divisions = divisionValues
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (divisions.length < 2) return null;
    return { style: "kaido", min, max, divisions };
  }, [mode, marketStyle, optionLow, optionHigh, rangeMin, rangeMax, divisionValues]);

  const pickMarketStyle = (style: MarketStyle) => {
    setMarketStyle(style);
    setMode("scalar");
    if (style === "binary") {
      const cfg = defaultBinaryConfig();
      setOptionLow(cfg.optionLow ?? "No");
      setOptionHigh(cfg.optionHigh ?? "Yes");
      setMu0(defaultOpeningCall(cfg));
      setSigma0(defaultOpeningWidth(cfg));
      setTierIdx(2);
      setResolverAddr(resolvers.optimistic);
      return;
    }
    const cfg = defaultKaidoConfig();
    setRangeMin(String(cfg.min));
    setRangeMax(String(cfg.max));
    setDivisionCount("5");
    setDivisionValues(cfg.divisions.map(String));
    setMu0(defaultOpeningCall(cfg));
    setSigma0(defaultOpeningWidth(cfg));
    setTierIdx(0);
    setResolverAddr(resolvers.reflector);
  };

  useEffect(() => {
    if (marketStyle !== "kaido" || mode !== "scalar") return;
    const min = Number(rangeMin);
    const max = Number(rangeMax);
    const n = Number(divisionCount);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min) || !Number.isFinite(n)) return;
    setDivisionValues(evenDivisions(min, max, n).map(String));
  }, [marketStyle, mode, rangeMin, rangeMax, divisionCount]);

  useEffect(() => {
    if (mode !== "scalar" || !outcomeConfig) return;
    if (mu0.trim() === "") setMu0(defaultOpeningCall(outcomeConfig));
    if (sigma0.trim() === "") setSigma0(defaultOpeningWidth(outcomeConfig));
  }, [mode, outcomeConfig, mu0, sigma0]);

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
    const lo = outcomeConfig?.min;
    const hi = outcomeConfig?.max;
    const span =
      lo != null && hi != null && hi > lo
        ? hi - lo
        : Math.max((muReal ?? 100_000) * 0.2, sigmaMin * 8);
    const sigmaMax = Math.max(span / 2, sigmaMin * 16);
    return { sigmaMin, sigmaMax };
  }, [sigmaMin, muReal, outcomeConfig]);

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
      if (q.length > 120) throw new Error("question must be 120 characters or fewer");
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
        const m = required(safeWad(mu0), "opening call");
        let sigRaw = safeWad(sigma0);
        if (sigRaw == null && marketStyle === "binary" && outcomeConfig) {
          sigRaw = safeWad(defaultOpeningWidth(outcomeConfig));
        }
        const s = required(sigRaw, "starting conviction");
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
        await saveMarketMetadata(id, {
          question: q,
          ...(outcomeConfig
            ? {
                marketStyle: outcomeConfig.style,
                outcomeMin: outcomeConfig.min,
                outcomeMax: outcomeConfig.max,
                divisions: outcomeConfig.divisions,
                ...(outcomeConfig.style === "binary"
                  ? { optionLow: outcomeConfig.optionLow, optionHigh: outcomeConfig.optionHigh }
                  : {}),
              }
            : {}),
        });
      } catch (e) {
        console.warn("market deployed but metadata write failed:", e);
      }
      if (clientSettlementAsset().isDemo) {
        try {
          await seedMarketLiquidity(id);
        } catch (e) {
          console.warn("market LP seed failed:", e);
        }
      }
      setCreatedId(id);
      setSuccessOpen(true);
      setReviewOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to launch market");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <LaunchRoadmap steps={STEPS} />

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
            <div className="rounded-xl border border-[#d8c69a]/20 bg-[#d8c69a]/[0.06] px-4 py-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#d8c69a]/75">
                Board preview
              </p>
              <p className="mt-2 font-serif text-xl leading-snug tracking-[-0.02em] text-[#f3efe6] sm:text-2xl">
                {question.trim()}
              </p>
            </div>
          )}
        </div>
      </WizardSection>

      {/* 2 — Market type */}
      <WizardSection step={2} label="Binary or Kaido?">
        <p className="text-sm leading-relaxed text-white/55">
          <span className="text-[#f3efe6]">Binary</span> — two outcomes (yes/no, or your own labels).
          Best for events.{" "}
          <span className="text-[#f3efe6]">Kaido</span> — a continuous range with tick marks traders
          slide along (prices, scores, counts).
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => pickMarketStyle("binary")}
            className={cn(
              "rounded-xl border p-5 text-left transition-colors",
              marketStyle === "binary"
                ? "border-[#d8c69a]/40 bg-[#d8c69a]/10"
                : "border-white/[0.08] bg-[#141416]/50 hover:border-white/15",
            )}
          >
            <p className="font-serif text-lg text-[#f3efe6]">Binary</p>
            <p className="mt-2 text-xs leading-relaxed text-white/45">
              Will GTA 6 release this year? Two options on the chart — settles at one or the other.
            </p>
          </button>
          <button
            type="button"
            onClick={() => pickMarketStyle("kaido")}
            className={cn(
              "rounded-xl border p-5 text-left transition-colors",
              marketStyle === "kaido"
                ? "border-[#d8c69a]/40 bg-[#d8c69a]/10"
                : "border-white/[0.08] bg-[#141416]/50 hover:border-white/15",
            )}
          >
            <p className="font-serif text-lg text-[#f3efe6]">Kaido range</p>
            <p className="mt-2 text-xs leading-relaxed text-white/45">
              Where does BTC close? Pick lower &amp; upper bounds and how many x-values to show.
            </p>
          </button>
        </div>
      </WizardSection>

      {/* 3 — Schedule */}
      <WizardSection step={3} label="When can people trade?">
        <p className="text-sm leading-relaxed text-white/55">
          Trading opens, then locks before settlement. After lock, positions are frozen until the
          outcome is posted.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              { label: "1 hour demo", openM: 2, lockM: 62, resolveM: 65 },
              { label: "24 hours", openM: 2, lockM: 24 * 60 + 2, resolveM: 24 * 60 + 30 },
              { label: "7 days", openM: 2, lockM: 7 * 24 * 60 + 2, resolveM: 7 * 24 * 60 + 30 },
            ] as const
          ).map((p) => (
            <ChoiceButton
              key={p.label}
              active={false}
              onClick={() => {
                setWindowOpen(nowPlus(p.openM));
                setWindowLock(nowPlus(p.lockM));
                setWindowResolve(nowPlus(p.resolveM));
              }}
            >
              {p.label}
            </ChoiceButton>
          ))}
        </div>
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

      {/* 4 — Outcomes */}
      <WizardSection step={4} label="Set the outcomes">
        {marketStyle === "binary" ? (
          <>
            <p className="text-sm leading-relaxed text-white/55">
              Name the two sides. The chart runs 0 → 100 internally; settlement posts one end or the
              other.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Low option (0)" hint="Left side of the chart">
                <Input value={optionLow} onChange={setOptionLow} placeholder="No" />
              </Field>
              <Field label="High option (100)" hint="Right side of the chart">
                <Input value={optionHigh} onChange={setOptionHigh} placeholder="Yes" />
              </Field>
            </div>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-[#141416]/40 px-4 py-3 font-mono text-sm text-white/55">
              <span className="text-[#d8c69a]">{optionLow || "No"}</span>
              <span className="mx-3 text-white/25">←—— chart ——→</span>
              <span className="text-[#d8c69a]">{optionHigh || "Yes"}</span>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-white/55">
              Pick the lower and upper limits, then how many x-values appear on the chart. Traders
              place beliefs anywhere on the line — the ticks are guides.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Lower limit" hint="Left edge of the chart">
                <Input value={rangeMin} onChange={setRangeMin} placeholder="60000" />
              </Field>
              <Field label="Upper limit" hint="Right edge of the chart">
                <Input value={rangeMax} onChange={setRangeMax} placeholder="80000" />
              </Field>
            </div>
            <div className="mt-4 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                Divisions
              </p>
              <div className="flex flex-wrap gap-2">
                {DIVISION_PRESETS.map((n) => (
                  <ChoiceButton
                    key={n}
                    active={divisionCount === String(n)}
                    onClick={() => setDivisionCount(String(n))}
                  >
                    {n} ticks
                  </ChoiceButton>
                ))}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {divisionValues.map((val, i) => (
                <Field key={i} label={`x${i + 1}`}>
                  <Input
                    value={val}
                    onChange={(v) =>
                      setDivisionValues((rows) => rows.map((x, j) => (j === i ? v : x)))
                    }
                  />
                </Field>
              ))}
            </div>
          </>
        )}
      </WizardSection>

      {/* 5 — Opening curve / starting odds */}
      <WizardSection
        step={5}
        label={marketStyle === "binary" ? "Starting odds" : "Opening curve"}
      >
        <p className="text-sm leading-relaxed text-white/55">
          {marketStyle === "binary"
            ? "Where does the crowd lean before the first trade? Slide toward your low or high option."
            : "Where the crowd starts on the line plus how tight the consensus is."}
        </p>

        {mode === "scalar" ? (
          <div className="mt-5 space-y-5">
            {marketStyle === "binary" && outcomeConfig?.style === "binary" && muReal != null ? (
              <BinaryOddsBar
                config={outcomeConfig}
                value={muReal}
                onChange={(v) => setMu0(String(v))}
                size="lg"
              />
            ) : outcomeConfig && muReal != null && Number.isFinite(muReal) ? (
              <div className="space-y-1">
                <RangeSlider
                  label="Opening call"
                  value={muReal}
                  onChange={(v) => setMu0(String(v))}
                  min={outcomeConfig.min}
                  max={outcomeConfig.max}
                  step={(outcomeConfig.max - outcomeConfig.min) / 200 || 1}
                  format={(v) => formatXTick(outcomeConfig, v)}
                  prominent
                />
              </div>
            ) : (
              <Field label="Opening call">
                <Input value={mu0} onChange={setMu0} placeholder="50" />
              </Field>
            )}
            {muReal != null && Number.isFinite(muReal) && outcomeConfig && marketStyle !== "binary" && (
              <p className="-mt-2 text-center font-serif text-2xl tabular-nums text-[#f3efe6]">
                {formatXTick(outcomeConfig, muReal)}
              </p>
            )}

            {marketStyle !== "binary" && convictionRange != null && convictionSnapValues.length > 0 ? (
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
            ) : marketStyle !== "binary" ? (
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
            ) : null}
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

        {kWad != null && bWad != null && bWad > 0n && marketStyle === "kaido" && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-[#d8c69a]/45" aria-hidden />
              <SectionLabel>Chart preview</SectionLabel>
            </div>
            <Panel className="relative overflow-hidden border-[#d8c69a]/12 p-0 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 w-[3px] bg-[#d8c69a]/45"
              />
              <div className="p-4 sm:p-5">
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
                  const range = chartRangeForConfig(outcomeConfig, muR, sigR);
                  return (
                    <BeliefChart
                      mode="scalar"
                      market={{ kWad, bWad, capped }}
                      range={range}
                      xTicks={outcomeConfig?.divisions}
                      formatXTick={(v) => formatXTick(outcomeConfig, v)}
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
            </Panel>
          </div>
        )}
      </WizardSection>

      {/* 6 — Settlement */}
      <WizardSection step={6} label="How does it settle?">
        <p className="text-sm leading-relaxed text-white/55">
          {marketStyle === "binary"
            ? "Binary markets usually need Optimistic or Designated — someone posts which option won."
            : "Oracle feed works for on-chain prices. Custom numbers use Attested or Optimistic."}
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
      <AdvancedBlock title="Advanced — path markets, liquidity & resolver">
        <div className="space-y-6">
          <div>
            <p className="mb-3 text-xs leading-relaxed text-white/45">
              Path markets track multiple checkpoints over time (power-user mode).
            </p>
            <ChoiceButton active={mode === "trajectory"} onClick={() => setMode("trajectory")}>
              Path market
            </ChoiceButton>
            {mode === "trajectory" && (
              <p className="mt-2 text-xs text-white/40">
                Switches off binary/kaido scalar flow — configure checkpoints in opening curve below.
              </p>
            )}
          </div>
          <div className="border-t border-white/10 pt-6">
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
      <Panel className="relative overflow-hidden border-[#d8c69a]/15 p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.08),transparent_65%)]"
        />
        <div className="relative">
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
            onClick={() => setReviewOpen(true)}
            disabled={submitting}
            className="relative inline-flex shrink-0 items-center justify-center rounded-xl border border-[#d8c69a]/25 bg-[#f3efe6] px-8 py-3.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#141416] shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset] transition-all hover:bg-white disabled:opacity-50"
          >
            Review & launch
          </button>
        )}
      </Panel>

      <CreateReviewModal
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        question={question.trim() || "—"}
        marketType={marketStyle === "binary" ? "Binary" : mode === "trajectory" ? "Path market" : "Kaido range"}
        schedule={`Opens ${windowOpen} · Closes ${windowLock}`}
        resolverLabel={TIERS[tierIdx].label}
        onDeploy={() => void submit()}
        deploying={submitting}
      />
      {createdId && (
        <CreateSuccessModal
          open={successOpen}
          onOpenChange={setSuccessOpen}
          marketId={createdId}
          question={question.trim()}
        />
      )}

      {error && (
        <Panel className="border-red-500/30 bg-red-500/5 px-6 py-4">
          <p className="text-sm text-red-300">{error}</p>
        </Panel>
      )}
    </div>
  );
}

// --- helpers ----------------------------------------------------------------

function LaunchRoadmap({ steps }: { steps: readonly string[] }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c1c21] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.06),transparent_65%)]" />
      <div className="relative mb-4 flex items-center gap-3">
        <span className="h-px w-8 bg-[#d8c69a]/45" aria-hidden />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]/85">
          Launch sequence
        </p>
      </div>
      <ol className="relative grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-5">
        {steps.map((step, i) => (
          <li key={step} className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">
              {String(i + 1).padStart(2, "0")}
            </p>
            <p className="mt-1 text-sm leading-snug text-white/55">{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

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
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c1c21]",
        "border-l-[3px] border-l-[#d8c69a]/40",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
        "market-card-enter p-6 sm:p-8",
      )}
      style={{ animationDelay: `${(step - 1) * 70}ms` }}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#d8c69a]/70">
        Step {step}
      </p>
      <h2 className="mt-2 font-serif text-xl leading-snug tracking-[-0.02em] text-[#f3efe6] sm:text-2xl">
        {label}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
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
        "rounded-xl border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-[border-color,background-color,color] duration-150",
        active
          ? "border-[#d8c69a]/40 bg-[#d8c69a]/12 text-[#f3efe6]"
          : "border-white/[0.08] bg-[#141416]/50 text-white/45 hover:border-white/15 hover:text-white/70",
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
        "w-full rounded-xl border border-white/[0.08] bg-[#141416] px-3 py-2.5 text-sm text-[#f3efe6] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-white/25 focus-visible:border-[#d8c69a]/40 focus-visible:ring-1 focus-visible:ring-[#d8c69a]/30",
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
      className="w-full resize-y rounded-xl border border-white/[0.08] bg-[#141416] px-3 py-2.5 text-sm leading-relaxed text-[#f3efe6] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-white/25 focus-visible:border-[#d8c69a]/40 focus-visible:ring-1 focus-visible:ring-[#d8c69a]/30"
    />
  );
}
