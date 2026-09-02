/**
 * Client-side position tracking — the chain has no "list my positions" view, so
 * we persist position ids opened from this browser per (network, wallet, market).
 */

const PREFIX = "kaido:positions:";

export interface SavedPosition {
  readonly id: string;
  readonly openedAt: number;
  readonly claimedAt?: number;
  /** USDC payout in 7-decimal stroops, as a string. */
  readonly payout7dp?: string;
  /** Collateral locked at open (7dp), if recorded. */
  readonly collateral7dp?: string;
  /** Scalar belief at trade time (WAD strings), for result card. */
  readonly muWad?: string;
  readonly sigmaWad?: string;
}

function storageKey(network: string, wallet: string, marketId: string): string {
  return `${PREFIX}${network}:${wallet}:${marketId}`;
}

function readRaw(key: string): SavedPosition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPosition[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(key: string, positions: SavedPosition[]): void {
  localStorage.setItem(key, JSON.stringify(positions));
}

/** All saved positions for this wallet on this market (newest first). */
export function loadPositions(network: string, wallet: string, marketId: string): SavedPosition[] {
  return readRaw(storageKey(network, wallet, marketId)).sort((a, b) => b.openedAt - a.openedAt);
}

/** Record a newly opened position id (deduped). */
export function savePosition(
  network: string,
  wallet: string,
  marketId: string,
  positionId: bigint,
  meta?: { muWad?: bigint; sigmaWad?: bigint; collateral7dp?: bigint },
): void {
  const key = storageKey(network, wallet, marketId);
  const id = positionId.toString();
  const existing = readRaw(key);
  if (existing.some((p) => p.id === id)) return;
  writeRaw(key, [
    {
      id,
      openedAt: Date.now(),
      ...(meta?.muWad != null ? { muWad: meta.muWad.toString() } : {}),
      ...(meta?.sigmaWad != null ? { sigmaWad: meta.sigmaWad.toString() } : {}),
      ...(meta?.collateral7dp != null ? { collateral7dp: meta.collateral7dp.toString() } : {}),
    },
    ...existing,
  ]);
}

/** Mark a position as claimed with its payout. */
export function markClaimed(
  network: string,
  wallet: string,
  marketId: string,
  positionId: bigint,
  payout7dp: bigint,
): void {
  const key = storageKey(network, wallet, marketId);
  const id = positionId.toString();
  const payout = payout7dp.toString();
  const next = readRaw(key).map((p) =>
    p.id === id ? { ...p, claimedAt: Date.now(), payout7dp: payout } : p,
  );
  if (!next.some((p) => p.id === id)) {
    next.unshift({ id, openedAt: Date.now(), claimedAt: Date.now(), payout7dp: payout });
  }
  writeRaw(key, next);
}

/** Format 7-decimal USDC stroops for display. */
export function formatUsdc7dp(amount7dp: bigint): string {
  const neg = amount7dp < 0n;
  const abs = neg ? -amount7dp : amount7dp;
  const whole = abs / 10_000_000n;
  const frac = abs % 10_000_000n;
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${fracStr ? "." + fracStr : ""}`;
}
