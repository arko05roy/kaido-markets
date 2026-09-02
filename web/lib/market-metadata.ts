/**
 * Off-chain market copy helpers — client-safe. Server persistence lives in
 * `market-metadata-store.ts`.
 */
import { marketQuestion, type MarketCopyInput } from "@/lib/market-display";

export interface SavedMarketMetadata {
  readonly question: string;
  readonly createdAt: string;
}

/** Prefer a saved question; fall back to auto-generated copy from on-chain params. */
export function displayMarketQuestion(
  info: MarketCopyInput,
  crowdMuWad?: bigint,
  customQuestion?: string | null,
): string {
  const q = customQuestion?.trim();
  if (q) return q;
  return marketQuestion(info, crowdMuWad);
}

/** Client helper — POST after a market is deployed. */
export async function saveMarketQuestion(
  marketId: string,
  question: string,
): Promise<void> {
  const res = await fetch(`/api/markets/${encodeURIComponent(marketId)}/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `failed to save question (${res.status})`);
  }
}
