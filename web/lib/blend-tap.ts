/**
 * BlendTap JIT borrow math — mirrors `distribution-market` + `blend-adapter`.
 * Used for pre-trade disclosure UI only; on-chain execution stays in the contract.
 */

/** `BLEND_BORROW_NUM / BLEND_BORROW_DEN` — 50% of posted collateral (7-dp). */
export const BLEND_BORROW_NUM = 1n;
export const BLEND_BORROW_DEN = 2n;

/** Blend USDC `c_factor` (75%) — collateral factor on the lending pool. */
export const BLEND_COLLATERAL_FACTOR_BPS = 7500n;

/** `blend-adapter::REPAY_INTEREST_BUFFER_7DP` — 0.001 USDC headroom at unwind. */
export const BLEND_REPAY_INTEREST_BUFFER_7DP = 10_000n;

const SETTLEMENT_SCALE = 10_000_000n;

export interface BlendTapBreakdown {
  maxTotal7dp: bigint;
  collateral7dp: bigint;
  fee7dp: bigint;
  borrow7dp: bigint;
  depthBefore7dp: bigint;
  depthAfter7dp: bigint;
  marketBackedAfter7dp: bigint;
  withinDepth: boolean;
}

/**
 * Derive collateral, fee, and borrow from the trader's max total (7-dp).
 * Collateral solves `total = collateral + floor(collateral × feeBps / 10_000)` (contract uses WAD internally; this is the 7-dp UI bound).
 */
export function computeBlendTapBreakdown(opts: {
  maxTotal7dp: bigint;
  feeBps: number;
  availableDepth7dp: bigint;
  currentBacked7dp?: bigint;
}): BlendTapBreakdown {
  const feeBps = BigInt(Math.max(0, opts.feeBps));
  const feeDenom = 10_000n + feeBps;
  const collateral7dp = (opts.maxTotal7dp * 10_000n) / feeDenom;
  const fee7dp = opts.maxTotal7dp - collateral7dp;
  const borrow7dp = (collateral7dp * BLEND_BORROW_NUM) / BLEND_BORROW_DEN;
  const depthBefore = opts.availableDepth7dp;
  const withinDepth = borrow7dp > 0n && borrow7dp <= depthBefore;
  const depthAfter = withinDepth ? depthBefore - borrow7dp : depthBefore;
  const backed = opts.currentBacked7dp ?? 0n;

  return {
    maxTotal7dp: opts.maxTotal7dp,
    collateral7dp,
    fee7dp,
    borrow7dp,
    depthBefore7dp: depthBefore,
    depthAfter7dp: depthAfter,
    marketBackedAfter7dp: backed + (withinDepth ? borrow7dp : 0n),
    withinDepth,
  };
}

export function usdc7dpFromFloat(n: number): bigint {
  if (!Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.round(n * Number(SETTLEMENT_SCALE)));
}

export function formatUsdc7dp(amount7dp: bigint, maxFrac = 4): string {
  const n = Number(amount7dp) / Number(SETTLEMENT_SCALE);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: Math.min(2, maxFrac),
    maximumFractionDigits: maxFrac,
  });
}

/** UI disclosure — real formulas, illustrative pool headroom (not a chain read). */
export function displayBlendTapBreakdown(opts: {
  maxTotal7dp: bigint;
  feeBps: number;
  poolDepth7dp?: bigint;
}): BlendTapBreakdown {
  const feeBps = BigInt(Math.max(0, opts.feeBps));
  const feeDenom = 10_000n + feeBps;
  const collateral7dp = (opts.maxTotal7dp * 10_000n) / feeDenom;
  const borrow7dp = (collateral7dp * BLEND_BORROW_NUM) / BLEND_BORROW_DEN;
  const live = opts.poolDepth7dp ?? 0n;
  const displayDepth =
    live > borrow7dp ? live : borrow7dp * 4n + 100_000_000_000n; // borrow + 10k USDC floor
  return computeBlendTapBreakdown({
    maxTotal7dp: opts.maxTotal7dp,
    feeBps: opts.feeBps,
    availableDepth7dp: displayDepth,
  });
}
