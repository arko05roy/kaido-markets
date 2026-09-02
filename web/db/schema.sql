-- Market question copy (off-chain). Run once in Neon SQL editor or via psql.
CREATE TABLE IF NOT EXISTS market_metadata (
  network text NOT NULL,
  market_id text NOT NULL,
  question text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, market_id)
);
