/**
 * Off-chain market copy helpers — client-safe. Server persistence lives in
 * `market-metadata-store.ts`.
 */
import { marketQuestion, type MarketCopyInput } from "@/lib/market-display";
import type { MarketStyle, OutcomeConfig } from "@/lib/outcome-scale";
import { parseOutcomeConfig } from "@/lib/outcome-scale";

export interface SavedMarketMetadata {
  readonly question: string;
  readonly createdAt: string;
  readonly marketStyle?: MarketStyle;
  readonly outcomeMin?: number;
  readonly outcomeMax?: number;
  readonly divisions?: number[];
  readonly optionLow?: string;
  readonly optionHigh?: string;
}

export type MarketMetadataInput = Pick<SavedMarketMetadata, "question"> &
  Partial<Omit<SavedMarketMetadata, "question" | "createdAt">>;

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

export function outcomeConfigFromMetadata(meta: SavedMarketMetadata | null | undefined): OutcomeConfig | null {
  if (!meta) return null;
  return parseOutcomeConfig(meta);
}

/** Client helper — POST after a market is deployed. */
export async function saveMarketMetadata(marketId: string, meta: MarketMetadataInput): Promise<void> {
  const res = await fetch(`/api/markets/${encodeURIComponent(marketId)}/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `failed to save metadata (${res.status})`);
  }
}

/** @deprecated use saveMarketMetadata */
export async function saveMarketQuestion(marketId: string, question: string): Promise<void> {
  await saveMarketMetadata(marketId, { question });
}
