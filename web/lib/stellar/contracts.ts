/**
 * Resolves the *deployed* Kaido contract ids for the active network.
 *
 * Source of truth: `config/networks.<network>.json` — the gitignored "live ids"
 * file that the deploy script rewrites on every run (build.md §0a). Nothing here
 * is hardcoded; if the file is missing (no deploy yet, or after a testnet reset
 * before re-deploy) we fall back to `NEXT_PUBLIC_KAIDO_*` env vars, and finally
 * throw with an actionable message. Read on the server only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeNetworkId, type StellarNetworkId } from "./networks";

export interface DeployedContracts {
  readonly marketFactory: string;
  readonly distributionMarket: string;
  readonly registry: string;
  readonly houseVault: string;
  readonly resolverReflector: string;
  readonly resolverAttested: string;
  readonly resolverOptimistic: string;
  readonly resolverDesignated: string;
}

export interface DeployedConfig {
  readonly network: StellarNetworkId;
  readonly contracts: DeployedContracts;
  /** Per-network external ids (USDC SAC, Reflector feed, admin) — may be null. */
  readonly external: {
    readonly usdcSacId: string | null;
    readonly reflectorFeedId: string | null;
    readonly adminAddress: string | null;
  };
}

const ENV_KEYS: Record<keyof DeployedContracts, string> = {
  marketFactory: "NEXT_PUBLIC_KAIDO_MARKET_FACTORY",
  distributionMarket: "NEXT_PUBLIC_KAIDO_DISTRIBUTION_MARKET",
  registry: "NEXT_PUBLIC_KAIDO_REGISTRY",
  houseVault: "NEXT_PUBLIC_KAIDO_HOUSE_VAULT",
  resolverReflector: "NEXT_PUBLIC_KAIDO_RESOLVER_REFLECTOR",
  resolverAttested: "NEXT_PUBLIC_KAIDO_RESOLVER_ATTESTED",
  resolverOptimistic: "NEXT_PUBLIC_KAIDO_RESOLVER_OPTIMISTIC",
  resolverDesignated: "NEXT_PUBLIC_KAIDO_RESOLVER_DESIGNATED",
};

let cached: DeployedConfig | null = null;

/** The deployed-contract config for the active network. Cached per process. */
export function deployedConfig(): DeployedConfig {
  if (cached) return cached;
  const network = activeNetworkId();

  // 1. the live-ids file written by the deploy script.
  const file = join(process.cwd(), "..", "config", `networks.${network}.json`);
  const fromFile: Partial<Record<keyof DeployedContracts, string>> = {};
  let external: DeployedConfig["external"] = {
    usdcSacId: null,
    reflectorFeedId: null,
    adminAddress: null,
  };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      contracts?: Record<string, { id?: string }>;
      external?: Partial<DeployedConfig["external"]>;
    };
    if (raw.contracts) {
      for (const key of Object.keys(ENV_KEYS) as (keyof DeployedContracts)[]) {
        const id = raw.contracts[key]?.id;
        if (id) fromFile[key] = id;
      }
    }
    if (raw.external) {
      external = {
        usdcSacId: raw.external.usdcSacId ?? null,
        reflectorFeedId: raw.external.reflectorFeedId ?? null,
        adminAddress: raw.external.adminAddress ?? null,
      };
    }
  } catch {
    // file absent — fall through to env vars.
  }

  // 2. resolve each id: file value, then env var, else error.
  const contracts = {} as Record<keyof DeployedContracts, string>;
  const missing: string[] = [];
  for (const key of Object.keys(ENV_KEYS) as (keyof DeployedContracts)[]) {
    const id = fromFile[key] ?? process.env[ENV_KEYS[key]];
    if (id) contracts[key] = id;
    else missing.push(`${key} (${ENV_KEYS[key]})`);
  }
  if (missing.length > 0) {
    throw new Error(
      `Kaido contract ids unresolved for network "${network}": ${missing.join(", ")}. ` +
        `Run \`make deploy:${network}\` to write config/networks.${network}.json, ` +
        `or set the listed NEXT_PUBLIC_KAIDO_* env vars.`,
    );
  }

  cached = { network, contracts: contracts as DeployedContracts, external };
  return cached;
}
