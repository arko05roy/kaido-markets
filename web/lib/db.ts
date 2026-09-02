import { neon } from "@neondatabase/serverless";

export type Sql = ReturnType<typeof neon>;

let schemaReady: Promise<void> | null = null;

export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url || null;
}

export function getSql(): Sql | null {
  const url = getDatabaseUrl();
  return url ? neon(url) : null;
}

/** Idempotent — safe to call on every request (cached after first success). */
export function ensureMarketMetadataSchema(sql: Sql): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS market_metadata (
        network text NOT NULL,
        market_id text NOT NULL,
        question text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (network, market_id)
      )
    `.then(() => undefined);
  }
  return schemaReady;
}
