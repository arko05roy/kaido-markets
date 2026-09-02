/**
 * Resolves the *deployed* Kaido contract ids for the active network.
 *
 * Source of truth: `config/networks.<network>.json` — rewritten on every
 * `make deploy:<network>` run (build.md §0a).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeNetworkId, type StellarNetworkId } from "./networks";

export interface DeployedContracts {
  readonly marketFactory: string;
  readonly distributionMarket: string;
  readonly registry: string;
  readonly resolverReflector: string;
  readonly resolverAttested: string;
  readonly resolverOptimistic: string;
  readonly resolverDesignated: string;
  readonly blendAdapter?: string;
}

export interface NetworkFixtures {
  readonly demoMarket?: string;
  readonly demoResolver?: string;
  readonly lifecycleMarket?: string;
  readonly lifecycleResolver?: string;
}

export interface DeployedConfig {
  readonly network: StellarNetworkId;
  readonly contracts: DeployedContracts;
  readonly external: {
    readonly usdcSacId: string | null;
    readonly reflectorFeedId: string | null;
    readonly adminAddress: string | null;
  };
  readonly fixtures: NetworkFixtures;
}

const REQUIRED_KEYS = [
  "marketFactory",
  "distributionMarket",
  "registry",
  "resolverReflector",
  "resolverAttested",
  "resolverOptimistic",
  "resolverDesignated",
] as const satisfies readonly (keyof DeployedContracts)[];

const OPTIONAL_KEYS = ["blendAdapter"] as const satisfies readonly (keyof DeployedContracts)[];

const ENV_KEYS: Record<keyof DeployedContracts, string> = {
  marketFactory: "NEXT_PUBLIC_KAIDO_MARKET_FACTORY",
  distributionMarket: "NEXT_PUBLIC_KAIDO_DISTRIBUTION_MARKET",
  registry: "NEXT_PUBLIC_KAIDO_REGISTRY",
  blendAdapter: "NEXT_PUBLIC_KAIDO_BLEND_ADAPTER",
  resolverReflector: "NEXT_PUBLIC_KAIDO_RESOLVER_REFLECTOR",
  resolverAttested: "NEXT_PUBLIC_KAIDO_RESOLVER_ATTESTED",
  resolverOptimistic: "NEXT_PUBLIC_KAIDO_RESOLVER_OPTIMISTIC",
  resolverDesignated: "NEXT_PUBLIC_KAIDO_RESOLVER_DESIGNATED",
};

export function deployedConfig(): DeployedConfig {
  const network = activeNetworkId();
  const file = join(process.cwd(), "..", "config", `networks.${network}.json`);
  const fromFile: Partial<Record<keyof DeployedContracts, string>> = {};
  let external: DeployedConfig["external"] = {
    usdcSacId: null,
    reflectorFeedId: null,
    adminAddress: null,
  };
  let fixtures: NetworkFixtures = {};
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      contracts?: Record<string, { id?: string }>;
      external?: Partial<DeployedConfig["external"]>;
      fixtures?: NetworkFixtures;
    };
    if (raw.contracts) {
      for (const key of [...REQUIRED_KEYS, ...OPTIONAL_KEYS]) {
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
    if (raw.fixtures) fixtures = raw.fixtures;
  } catch {
    // file absent — fall through to env vars.
  }

  const contracts: Partial<Record<keyof DeployedContracts, string>> = {};
  const missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    const id = fromFile[key] ?? process.env[ENV_KEYS[key]];
    if (id) contracts[key] = id;
    else missing.push(`${key} (${ENV_KEYS[key]})`);
  }
  for (const key of OPTIONAL_KEYS) {
    const id = fromFile[key] ?? process.env[ENV_KEYS[key]];
    if (id) contracts[key] = id;
  }
  if (missing.length > 0) {
    throw new Error(
      `Kaido contract ids unresolved for network "${network}": ${missing.join(", ")}. ` +
        `Run \`make deploy:${network}\` to write config/networks.${network}.json.`,
    );
  }

  return { network, contracts: contracts as DeployedContracts, external, fixtures };
}
