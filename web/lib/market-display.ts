/**
 * Human-facing market copy and formatting — the translation layer from on-chain
 * params to degen-friendly UI (see plan.md). Client-safe (no server imports).
 */
import { registry } from "@kaido/contract-bindings";
import { fromWad, renderGaussian, WAD } from "@/lib/curve";

type MarketInfo = registry.MarketInfo;
type MarketStatus = registry.MarketStatus;

type MarketCopyInput = Pick<MarketInfo, "outcome_space" | "tier" | "window">;
export type { MarketCopyInput };
const { ResolverTier } = registry;

export function tierLabel(tier: registry.ResolverTier): string {
  switch (tier) {
    case ResolverTier.Reflector:
      return "T0 · Reflector oracle";
    case ResolverTier.Attested:
      return "T1 · Attested";
    case ResolverTier.Optimistic:
      return "T2 · Optimistic";
    case ResolverTier.Designated:
      return "T3 · Designated";
    default:
      return "Unknown tier";
  }
}

export function formatWad(v: bigint, fractionDigits = 4): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const intPart = abs / WAD;
  const fracPart = abs % WAD;
  const fracStr = fracPart
    .toString()
    .padStart(18, "0")
    .slice(0, fractionDigits)
    .replace(/0+$/, "");
  return `${neg ? "-" : ""}${intPart}${fracStr ? "." + fracStr : ""}`;
}

export type ConvictionLevel = "wide" | "confident" | "sniper";

/** Short label for a market status. */
export function statusLabel(status: MarketStatus | null): string {
  if (!status) return "—";
  switch (status.tag) {
    case "Open":
      return "Open";
    case "Locked":
      return "Locked";
    case "Resolved":
      return "Resolved";
    case "ResolvedVec":
      return "Resolved";
    case "Disputable":
      return "Disputable";
    default:
      return "—";
  }
}

export type MarketWindow = { open: bigint | number; lock: bigint | number };

/** Mirrors `DistributionMarket::trade` — status Open and ledger time inside [open, lock). */
export function isTradingWindowOpen(
  statusTag: string | null | undefined,
  window: MarketWindow,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (statusTag !== "Open") return false;
  const open = Number(window.open);
  const lock = Number(window.lock);
  return nowSec >= open && nowSec < lock;
}

export function tradingClosedReason(
  statusTag: string | null | undefined,
  window: MarketWindow,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  if (statusTag && statusTag !== "Open") {
    return `Trading is closed — market status is ${statusLabel({ tag: statusTag } as MarketStatus)}.`;
  }
  const open = Number(window.open);
  const lock = Number(window.lock);
  if (nowSec < open) {
    return `Trading opens ${fmtResolveDateLong(open)}.`;
  }
  if (nowSec >= lock) {
    return `Trading locked ${fmtResolveDateLong(lock)} — create a new market or wait for the next deploy.`;
  }
  return "Trading is closed for this market.";
}

/** Map Soroban contract error codes from failed simulations to readable copy. */
export function formatContractTradeError(message: string): string {
  if (message.includes("Error(Contract, #30)") || message.includes("MarketNotOpen")) {
    return "Trading window is not open — the market may have locked or the window expired. Create a new market via /create.";
  }
  if (message.includes("Error(Contract, #46)") || message.includes("BlendDepthExceeded")) {
    return "Blend borrow depth exhausted — reduce trade size or wait for positions to unwind at claim.";
  }
  if (message.includes("Error(Contract, #47)") || message.includes("BlendMarketNotAuthorized")) {
    return "This market is not authorized for BlendTap — run authorize_market on the adapter after deploy.";
  }
  if (message.includes("Error(Contract, #34)") || message.includes("SlippageExceeded")) {
    return "Slippage guard tripped — raise your max USDC risk amount.";
  }
  if (message.includes("Error(Contract, #15)") || message.includes("SigmaBelowFloor")) {
    return "Conviction is too tight — widen your range.";
  }
  return message;
}

/** Format a real-unit outcome for display (prices, scores, etc.). */
export function formatOutcome(v: number, kind?: import("@/lib/outcome-scale").OutcomeKind): string {
  if (!Number.isFinite(v)) return "—";
  if (kind === "probability") {
    return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    return `$${(v / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 10_000) {
    return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (abs >= 1000) {
    return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (abs >= 1) {
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return v.toPrecision(3);
}

/** Format on-chain USDC amounts (7 decimal places). */
export function formatUsdc7dp(amount7dp: bigint): string {
  const n = Number(amount7dp) / 1e7;
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatOutcomeDelta(delta: number): string {
  if (!Number.isFinite(delta)) return "—";
  const abs = Math.abs(delta);
  const sign = delta >= 0 ? "+" : "−";
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}k`;
  }
  if (abs >= 1) {
    return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return `${sign}${abs.toPrecision(2)}`;
}

export function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function formatCountdown(targetSec: number, nowSec: number): string {
  const delta = Math.max(0, targetSec - nowSec);
  if (delta === 0) return "now";
  const d = Math.floor(delta / 86400);
  const h = Math.floor((delta % 86400) / 3600);
  const m = Math.floor((delta % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${delta % 60}s`;
}

function fmtResolveDate(unixSec: bigint | number): string {
  const d = new Date(Number(unixSec) * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtResolveDateLong(unixSec: bigint | number): string {
  const d = new Date(Number(unixSec) * 1000);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Best-effort human title when no off-chain metadata exists. */
export function marketQuestion(info: MarketCopyInput, crowdMuWad?: bigint): string {
  const resolve = info.window.resolve;
  const date = fmtResolveDate(resolve);
  const isTraj = info.outcome_space.tag === "Trajectory";
  const cpCount =
    isTraj && info.outcome_space.tag === "Trajectory"
      ? info.outcome_space.values[0]?.length ?? 0
      : 0;

  const tier = tierLabel(info.tier);
  const oracleAsset =
    tier.includes("Reflector") ? "BTC" : null;

  if (isTraj && oracleAsset) {
    return cpCount > 1
      ? `Where does ${oracleAsset} go across ${cpCount} checkpoints?`
      : `Where does the ${oracleAsset} path land?`;
  }
  if (oracleAsset) {
    return `Where will ${oracleAsset} close on ${date}?`;
  }
  if (isTraj) {
    return `What path prints by ${date}?`;
  }

  if (crowdMuWad != null) {
    const crowd = fromWad(crowdMuWad);
    if (crowd > 1000) {
      return `Where does the price close on ${date}?`;
    }
  }

  return `What number prints on ${date}?`;
}

export function marketSubtitle(info: MarketCopyInput, crowdMuWad?: bigint): string {
  const parts: string[] = [];
  if (crowdMuWad != null) {
    parts.push(`Crowd target: ${formatOutcome(fromWad(crowdMuWad))}`);
  }
  parts.push(`Resolves ${fmtResolveDateLong(info.window.resolve)}`);
  return parts.join(" · ");
}

export function crowdTargetLabel(muWad: bigint): string {
  return formatOutcome(fromWad(muWad));
}

export function edgeVsCrowd(yourMu: number, crowdMu: number): {
  delta: number;
  deltaLabel: string;
  pctLabel: string;
  stance: string;
} {
  const delta = yourMu - crowdMu;
  const pct = crowdMu !== 0 ? (delta / Math.abs(crowdMu)) * 100 : 0;
  const deltaLabel =
    delta >= 0
      ? `${formatOutcomeDelta(delta).replace("+", "")} above crowd`
      : `${formatOutcomeDelta(delta).replace("−", "")} below crowd`;
  const pctLabel = `${formatPct(pct)} vs crowd`;
  let stance = "You are inside the crowd range";
  if (Math.abs(pct) >= 5) {
    stance = delta > 0 ? "You are fading consensus from above" : "You are fading consensus from below";
  } else if (Math.abs(pct) >= 1) {
    stance = delta > 0 ? "You are above crowd" : "You are below crowd";
  }
  return { delta, deltaLabel, pctLabel, stance };
}

/** Map σ to a conviction personality label (wide ↔ tight). */
export function convictionFromSigma(
  sigmaReal: number,
  sigmaMin: number,
  sigmaMax: number,
): ConvictionLevel {
  const t = (sigmaReal - sigmaMin) / Math.max(sigmaMax - sigmaMin, 1e-9);
  if (t <= 0.33) return "sniper";
  if (t <= 0.66) return "confident";
  return "wide";
}

export function convictionLabel(level: ConvictionLevel): string {
  switch (level) {
    case "sniper":
      return "Sniper";
    case "confident":
      return "Confident";
    case "wide":
      return "Wide range";
  }
}

export function convictionHint(level: ConvictionLevel): string {
  switch (level) {
    case "sniper":
      return "Sniper · higher upside, less room to miss";
    case "confident":
      return "Confident · balanced payoff zone";
    case "wide":
      return "Wide · safer range, lower upside";
  }
}

const PREVIEW_MAX_MULTIPLE = 25;

/** Rough payout preview — honest estimate, not a guaranteed quote. */
export function estimatePayoutPreview(opts: {
  riskUsdc: number;
  yourBelief: { muWad: bigint; sigmaWad: bigint };
  crowdBelief: { muWad: bigint; sigmaWad: bigint };
  market: { kWad: bigint; bWad: bigint; capped?: boolean };
}): { maxWin: number; multiple: number; poolLimited: boolean } {
  const { riskUsdc, yourBelief, crowdBelief, market } = opts;
  if (!Number.isFinite(riskUsdc) || riskUsdc <= 0) {
    return { maxWin: 0, multiple: 0, poolLimited: false };
  }
  const yourMu = fromWad(yourBelief.muWad);
  const yourPeak = peakAtMu(yourBelief.muWad, yourBelief.sigmaWad, market);
  const crowdPeak = peakAtMu(crowdBelief.muWad, crowdBelief.sigmaWad, market);
  const crowdAtYourMu = renderGaussian(crowdBelief, market, [yourMu])[0]?.y ?? 0;
  // ponytail: floor vs crowd peak so fading far doesn't divide by ~0 and print 28,000×
  const crowdRef = Math.max(crowdAtYourMu, crowdPeak * 0.05);
  const densityEdge = yourPeak / Math.max(crowdRef, 1e-12);
  const edgeMultiple = Math.min(
    Math.max(0, (densityEdge - 1) * 0.35),
    PREVIEW_MAX_MULTIPLE,
  );
  const maxWin = riskUsdc * edgeMultiple;
  const multiple = edgeMultiple;
  return { maxWin, multiple, poolLimited: false };
}

export function formatPayoutMultiple(multiple: number): string {
  if (!Number.isFinite(multiple) || multiple <= 0) return "0.0x";
  if (multiple < 0.1) return "<0.1x";
  return `${multiple.toFixed(1)}x`;
}

export function peakAtMu(
  muWad: bigint,
  sigmaWad: bigint,
  market: { kWad: bigint; bWad: bigint; capped?: boolean },
): number {
  const mu = fromWad(muWad);
  const pt = renderGaussian({ muWad, sigmaWad }, market, [mu]);
  return pt[0]?.y ?? 0;
}
