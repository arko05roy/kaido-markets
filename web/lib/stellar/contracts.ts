/**
 * Resolves the *deployed* Kaido contract ids for the active network.
 *
 * Source of truth: `config/networks.<network>.json` — rewritten on every
 * `make deploy:<network>` run (build.md §0a). Env vars win when set; otherwise
 * we read the JSON file (also mirrored to `web/config/` for Vercel).
 */
import { readNetworkConfigFile } from "./load-network-file";
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
    readonly settlementSymbol?: string | null;
    readonly demoMode?: boolean;
    readonly kaidoIssuer?: string | null;
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

export const CONTRACT_ENV_KEYS: Record<keyof DeployedContracts, string> = {
  marketFactory: "NEXT_PUBLIC_KAIDO_MARKET_FACTORY",
  distributionMarket: "NEXT_PUBLIC_KAIDO_DISTRIBUTION_MARKET",
  registry: "NEXT_PUBLIC_KAIDO_REGISTRY",
  blendAdapter: "NEXT_PUBLIC_KAIDO_BLEND_ADAPTER",
  resolverReflector: "NEXT_PUBLIC_KAIDO_RESOLVER_REFLECTOR",
  resolverAttested: "NEXT_PUBLIC_KAIDO_RESOLVER_ATTESTED",
  resolverOptimistic: "NEXT_PUBLIC_KAIDO_RESOLVER_OPTIMISTIC",
  resolverDesignated: "NEXT_PUBLIC_KAIDO_RESOLVER_DESIGNATED",
};

const EXTERNAL_ENV_KEYS = {
  usdcSacId: "NEXT_PUBLIC_KAIDO_USDC_SAC",
  settlementSymbol: "NEXT_PUBLIC_KAIDO_SETTLEMENT_SYMBOL",
  demoMode: "NEXT_PUBLIC_KAIDO_DEMO_MODE",
  kaidoIssuer: "NEXT_PUBLIC_KAIDO_ISSUER",
  reflectorFeedId: "NEXT_PUBLIC_KAIDO_REFLECTOR_FEED",
  adminAddress: "NEXT_PUBLIC_KAIDO_ADMIN",
} as const;

const FIXTURE_ENV_KEYS = {
  demoMarket: "NEXT_PUBLIC_KAIDO_DEMO_MARKET",
  demoResolver: "NEXT_PUBLIC_KAIDO_DEMO_RESOLVER",
  lifecycleMarket: "NEXT_PUBLIC_KAIDO_LIFECYCLE_MARKET",
  lifecycleResolver: "NEXT_PUBLIC_KAIDO_LIFECYCLE_RESOLVER",
} as const;

function envBool(key: string): boolean {
  const v = process.env[key];
  return v === "1" || v === "true";
}

export function deployedConfig(): DeployedConfig {
  const network = activeNetworkId();
  const file = readNetworkConfigFile(network);

  const contracts: Partial<Record<keyof DeployedContracts, string>> = {};
  const missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    const id = process.env[CONTRACT_ENV_KEYS[key]] ?? file?.contracts?.[key]?.id;
    if (id) contracts[key] = id;
    else missing.push(`${key} (${CONTRACT_ENV_KEYS[key]})`);
  }
  for (const key of OPTIONAL_KEYS) {
    const id = process.env[CONTRACT_ENV_KEYS[key]] ?? file?.contracts?.[key]?.id;
    if (id) contracts[key] = id;
  }
  if (missing.length > 0) {
    throw new Error(
      `Kaido contract ids unresolved for network "${network}": ${missing.join(", ")}. ` +
        `Run \`make deploy:${network}\` to write config/networks.${network}.json.`,
    );
  }

  const fixtures: Record<string, string> = {};
  for (const [key, envKey] of Object.entries(FIXTURE_ENV_KEYS)) {
    const id = process.env[envKey] ?? file?.fixtures?.[key];
    if (id) fixtures[key] = id;
  }

  const ext = file?.external;
  return {
    network,
    contracts: contracts as DeployedContracts,
    external: {
      usdcSacId: process.env[EXTERNAL_ENV_KEYS.usdcSacId] ?? ext?.usdcSacId ?? null,
      settlementSymbol:
        process.env[EXTERNAL_ENV_KEYS.settlementSymbol] ?? ext?.settlementSymbol ?? null,
      demoMode: envBool(EXTERNAL_ENV_KEYS.demoMode) || ext?.demoMode === true,
      kaidoIssuer: process.env[EXTERNAL_ENV_KEYS.kaidoIssuer] ?? ext?.kaidoIssuer ?? null,
      reflectorFeedId:
        process.env[EXTERNAL_ENV_KEYS.reflectorFeedId] ?? ext?.reflectorFeedId ?? null,
      adminAddress: process.env[EXTERNAL_ENV_KEYS.adminAddress] ?? ext?.adminAddress ?? null,
    },
    fixtures: fixtures as NetworkFixtures,
  };
}
