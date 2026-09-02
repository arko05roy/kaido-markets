/**
 * Server-side persistence for off-chain market copy (questions aren't on-chain yet).
 */
import fs from "fs";
import path from "path";

import type { SavedMarketMetadata } from "@/lib/market-metadata";

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

export function getSavedMarketQuestion(network: string, marketId: string): string | null {
  const q = loadMarketMetadataStore()[network]?.[marketId]?.question;
  return q?.trim() ? q.trim() : null;
}

export function saveMarketQuestionToStore(
  network: string,
  marketId: string,
  question: string,
): SavedMarketMetadata {
  const store = loadMarketMetadataStore();
  const entry: SavedMarketMetadata = {
    question: question.trim(),
    createdAt: new Date().toISOString(),
  };
  if (!store[network]) store[network] = {};
  store[network][marketId] = entry;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify(store, null, 2)}\n`);
  return entry;
}
