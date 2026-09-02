/**
 * Server-side persistence for off-chain market copy (questions aren't on-chain yet).
 * Uses Neon when DATABASE_URL is set; otherwise falls back to data/market-questions.json.
 */
import fs from "fs";
import path from "path";

import { ensureMarketMetadataSchema, getSql } from "@/lib/db";
import type { MarketMetadataInput, SavedMarketMetadata } from "@/lib/market-metadata";

const FILE = path.join(process.cwd(), "data", "market-questions.json");

export type MarketMetadataStore = Record<string, Record<string, SavedMarketMetadata>>;

type MetadataPayload = Omit<SavedMarketMetadata, "question" | "createdAt">;

function payloadFromInput(meta: MarketMetadataInput): MetadataPayload {
  return {
    ...(meta.marketStyle != null ? { marketStyle: meta.marketStyle } : {}),
    ...(meta.outcomeMin != null ? { outcomeMin: meta.outcomeMin } : {}),
    ...(meta.outcomeMax != null ? { outcomeMax: meta.outcomeMax } : {}),
    ...(meta.divisions != null ? { divisions: meta.divisions } : {}),
    ...(meta.optionLow != null ? { optionLow: meta.optionLow } : {}),
    ...(meta.optionHigh != null ? { optionHigh: meta.optionHigh } : {}),
  };
}

export function buildSavedMarketMetadata(
  meta: MarketMetadataInput,
  prev?: SavedMarketMetadata | null,
): SavedMarketMetadata {
  return {
    question: meta.question.trim(),
    createdAt: prev?.createdAt ?? new Date().toISOString(),
    ...payloadFromInput(meta),
  };
}

function readJsonStore(): MarketMetadataStore {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw) as MarketMetadataStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeJsonStore(store: MarketMetadataStore): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify(store, null, 2)}\n`);
}

function rowToSavedMetadata(row: {
  question: string;
  payload: MetadataPayload | null;
  created_at: Date | string;
}): SavedMarketMetadata {
  const payload = row.payload ?? {};
  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  return {
    question: row.question,
    createdAt,
    ...payload,
  };
}

type MetadataRow = {
  network?: string;
  market_id?: string;
  question: string;
  payload: MetadataPayload | null;
  created_at: Date | string;
};

function asRows<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

async function seedJsonIntoDbIfEmpty(): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  await ensureMarketMetadataSchema(sql);
  const countRows = asRows<{ count: number }>(
    await sql`SELECT COUNT(*)::int AS count FROM market_metadata`,
  );
  if (Number(countRows[0]?.count ?? 0) > 0) return;

  const store = readJsonStore();
  for (const [network, markets] of Object.entries(store)) {
    for (const [marketId, meta] of Object.entries(markets)) {
      const payload = payloadFromInput(meta);
      await sql`
        INSERT INTO market_metadata (network, market_id, question, payload, created_at)
        VALUES (
          ${network},
          ${marketId},
          ${meta.question},
          ${JSON.stringify(payload)}::jsonb,
          ${meta.createdAt}::timestamptz
        )
        ON CONFLICT (network, market_id) DO NOTHING
      `;
    }
  }
}

/** @deprecated prefer loadMarketMetadataForNetwork */
export async function loadMarketMetadataStore(): Promise<MarketMetadataStore> {
  const sql = getSql();
  if (!sql) return readJsonStore();

  await ensureMarketMetadataSchema(sql);
  await seedJsonIntoDbIfEmpty();

  const rows = asRows<MetadataRow>(
    await sql`
    SELECT network, market_id, question, payload, created_at
    FROM market_metadata
  `,
  );
  const store: MarketMetadataStore = {};
  for (const row of rows) {
    const network = String(row.network);
    const marketId = String(row.market_id);
    if (!store[network]) store[network] = {};
    store[network][marketId] = rowToSavedMetadata({
      question: String(row.question),
      payload: row.payload as MetadataPayload | null,
      created_at: row.created_at as Date | string,
    });
  }
  return store;
}

export async function loadMarketMetadataForNetwork(
  network: string,
): Promise<Record<string, SavedMarketMetadata>> {
  const sql = getSql();
  if (!sql) return readJsonStore()[network] ?? {};

  await ensureMarketMetadataSchema(sql);
  await seedJsonIntoDbIfEmpty();

  const rows = asRows<MetadataRow>(
    await sql`
    SELECT market_id, question, payload, created_at
    FROM market_metadata
    WHERE network = ${network}
  `,
  );
  const out: Record<string, SavedMarketMetadata> = {};
  for (const row of rows) {
    const marketId = String(row.market_id);
    out[marketId] = rowToSavedMetadata({
      question: String(row.question),
      payload: row.payload as MetadataPayload | null,
      created_at: row.created_at as Date | string,
    });
  }
  return out;
}

export async function getSavedMarketMetadata(
  network: string,
  marketId: string,
): Promise<SavedMarketMetadata | null> {
  const sql = getSql();
  if (!sql) return readJsonStore()[network]?.[marketId] ?? null;

  await ensureMarketMetadataSchema(sql);
  await seedJsonIntoDbIfEmpty();

  const rows = asRows<MetadataRow>(
    await sql`
    SELECT question, payload, created_at
    FROM market_metadata
    WHERE network = ${network} AND market_id = ${marketId}
    LIMIT 1
  `,
  );
  const row = rows[0];
  if (!row) return null;
  return rowToSavedMetadata({
    question: String(row.question),
    payload: row.payload as MetadataPayload | null,
    created_at: row.created_at as Date | string,
  });
}

export async function getSavedMarketQuestion(
  network: string,
  marketId: string,
): Promise<string | null> {
  const meta = await getSavedMarketMetadata(network, marketId);
  const q = meta?.question;
  return q?.trim() ? q.trim() : null;
}

async function saveMarketQuestionToDb(
  network: string,
  marketId: string,
  entry: SavedMarketMetadata,
): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not set");
  await ensureMarketMetadataSchema(sql);

  const payload = payloadFromInput(entry);
  await sql`
    INSERT INTO market_metadata (network, market_id, question, payload, created_at, updated_at)
    VALUES (
      ${network},
      ${marketId},
      ${entry.question},
      ${JSON.stringify(payload)}::jsonb,
      ${entry.createdAt}::timestamptz,
      now()
    )
    ON CONFLICT (network, market_id) DO UPDATE SET
      question = EXCLUDED.question,
      payload = EXCLUDED.payload,
      updated_at = now()
  `;
}

export async function saveMarketQuestionToStore(
  network: string,
  marketId: string,
  meta: MarketMetadataInput,
): Promise<SavedMarketMetadata> {
  const sql = getSql();
  const prev = sql ? await getSavedMarketMetadata(network, marketId) : readJsonStore()[network]?.[marketId];
  const entry = buildSavedMarketMetadata(meta, prev);

  if (sql) {
    await saveMarketQuestionToDb(network, marketId, entry);
    return entry;
  }

  const store = readJsonStore();
  if (!store[network]) store[network] = {};
  store[network][marketId] = entry;
  writeJsonStore(store);
  return entry;
}
