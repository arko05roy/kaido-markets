import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NextConfig } from "next";

import { CONTRACT_ENV_KEYS } from "./lib/stellar/contracts";

/** Repo-root `.env` (parent of `web/`) — server routes need DEPLOYER_SECRET_KEY etc. */
function loadRepoRootEnv() {
  const file = join(process.cwd(), "..", ".env");
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key]) continue;
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    // no parent .env — rely on web/.env.local or exported vars.
  }
}

/** Load config/networks.<network>.json into NEXT_PUBLIC_* (client-safe). */
function injectDeployedConfigEnv() {
  const network = process.env.STELLAR_NETWORK ?? process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet";
  const file = join(process.cwd(), "..", "config", `networks.${network}.json`);
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      contracts?: Record<string, { id?: string }>;
      external?: {
        usdcSacId?: string | null;
        settlementSymbol?: string | null;
        demoMode?: boolean;
        kaidoIssuer?: string | null;
        reflectorFeedId?: string | null;
        adminAddress?: string | null;
      };
      fixtures?: Record<string, string | undefined>;
    };
    const set = (key: string, value: string | undefined | null) => {
      if (value && !process.env[key]) process.env[key] = value;
    };
    if (raw.contracts) {
      for (const [name, envKey] of Object.entries(CONTRACT_ENV_KEYS)) {
        set(envKey, raw.contracts[name]?.id);
      }
    }
    if (raw.external) {
      set("NEXT_PUBLIC_KAIDO_USDC_SAC", raw.external.usdcSacId);
      set("NEXT_PUBLIC_KAIDO_SETTLEMENT_SYMBOL", raw.external.settlementSymbol);
      if (raw.external.demoMode === true) set("NEXT_PUBLIC_KAIDO_DEMO_MODE", "true");
      set("NEXT_PUBLIC_KAIDO_ISSUER", raw.external.kaidoIssuer);
      set("NEXT_PUBLIC_KAIDO_REFLECTOR_FEED", raw.external.reflectorFeedId);
      set("NEXT_PUBLIC_KAIDO_ADMIN", raw.external.adminAddress);
    }
    if (raw.fixtures) {
      set("NEXT_PUBLIC_KAIDO_DEMO_MARKET", raw.fixtures.demoMarket);
      set("NEXT_PUBLIC_KAIDO_DEMO_RESOLVER", raw.fixtures.demoResolver);
      set("NEXT_PUBLIC_KAIDO_LIFECYCLE_MARKET", raw.fixtures.lifecycleMarket);
      set("NEXT_PUBLIC_KAIDO_LIFECYCLE_RESOLVER", raw.fixtures.lifecycleResolver);
    }
  } catch {
    // file absent — env vars or deploy required.
  }
}

loadRepoRootEnv();
injectDeployedConfigEnv();

const nextConfig: NextConfig = {
  // React Compiler is stable in Next 16 (build.md ADR-10). Requires
  // `babel-plugin-react-compiler` (a devDependency).
  reactCompiler: true,

  // Local workspace packages publish source TS; transpile them through Next.
  transpilePackages: ["@kaido/sdk", "@kaido/contract-bindings"],

  // Network params (passphrases, RPC URLs) are loaded from config/networks.json
  // via lib/stellar/networks.ts — nothing network-specific is hardcoded here.
};

export default nextConfig;
