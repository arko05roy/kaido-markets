/**
 * Server-side persistence for off-chain market copy (questions aren't on-chain yet).
 */
import fs from "fs";
import path from "path";

import type { MarketMetadataInput, SavedMarketMetadata } from "@/lib/market-metadata";

const FILE = path.join(process.cwd(), "data", "market-questions.json");

export type MarketMetadataStore = Record<string, Record<string, SavedMarketMetadata>>;

export function loadMarketMetadataStore(): MarketMetadataStore {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw) as MarketMetadataStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getSavedMarketMetadata(
  network: string,
  marketId: string,
): SavedMarketMetadata | null {
  return loadMarketMetadataStore()[network]?.[marketId] ?? null;
}

export function getSavedMarketQuestion(network: string, marketId: string): string | null {
  const q = getSavedMarketMetadata(network, marketId)?.question;
  return q?.trim() ? q.trim() : null;
}

export function saveMarketQuestionToStore(
  network: string,
  marketId: string,
  meta: MarketMetadataInput,
): SavedMarketMetadata {
  const store = loadMarketMetadataStore();
  const prev = store[network]?.[marketId];
  const entry: SavedMarketMetadata = {
    question: meta.question.trim(),
    createdAt: prev?.createdAt ?? new Date().toISOString(),
    ...(meta.marketStyle != null ? { marketStyle: meta.marketStyle } : {}),
    ...(meta.outcomeMin != null ? { outcomeMin: meta.outcomeMin } : {}),
    ...(meta.outcomeMax != null ? { outcomeMax: meta.outcomeMax } : {}),
    ...(meta.divisions != null ? { divisions: meta.divisions } : {}),
    ...(meta.optionLow != null ? { optionLow: meta.optionLow } : {}),
    ...(meta.optionHigh != null ? { optionHigh: meta.optionHigh } : {}),
  };
  if (!store[network]) store[network] = {};
  store[network][marketId] = entry;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify(store, null, 2)}\n`);
  return entry;
}
