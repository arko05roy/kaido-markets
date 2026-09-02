/**
 * Server-side read helpers for the deployed Kaido contracts. Thin wrappers over
 * the generated bindings (`@kaido/contract-bindings`) that build a read-only
 * (simulate-only) client from the active network's config + deployed ids and
 * return decoded results. Trading / write paths go through `@kaido/sdk` and the
 * client wallet — these are reads for the market list + market pages.
 */
import { registry, distributionMarket } from "@kaido/contract-bindings";

import { checkpointsFromOutcomeSpace } from "@/lib/outcome-space";
import type { MarketCard } from "@/lib/market-types";

import { deployedConfig } from "./contracts";
import { activeNetwork } from "./networks";

export { checkpointsFromOutcomeSpace };

export type MarketInfo = registry.MarketInfo;
export type MarketParams = distributionMarket.MarketParams;
export type MarketState = distributionMarket.MarketState;
export type MarketStatus = distributionMarket.MarketStatus;

/** WAD scale (1e18) — the contracts' internal fixed-point unit (ADR-1). */
export const WAD = BigInt("1000000000000000000");

function rpcOptions(contractId: string) {
  const net = activeNetwork();
  if (!net.rpcUrl) {
    throw new Error(
      `No Stellar RPC URL for the active network. Set RPC_URL (mainnet needs a third-party provider).`,
    );
  }
  return {
    contractId,
    networkPassphrase: net.networkPassphrase,
    rpcUrl: net.rpcUrl,
    allowHttp: net.rpcUrl.startsWith("http://"),
  };
}

function registryClient() {
  return new registry.Client(rpcOptions(deployedConfig().contracts.registry));
}

function marketClient(contractId: string) {
  return new distributionMarket.Client(rpcOptions(contractId));
}

/** Number of registered markets. */
export async function marketCount(): Promise<number> {
  return (await registryClient().count()).result;
}

/** All registered market addresses, oldest first. */
export async function listMarketAddresses(): Promise<string[]> {
  return (await registryClient().all()).result;
}

/** The registry's indexed summary for a market. */
export async function getMarketInfo(market: string): Promise<MarketInfo> {
  return (await registryClient().get({ market })).result;
}

/** Live AMM params + belief + status for a market. */
export async function getMarketState(
  market: string,
): Promise<{ params: MarketParams; state: MarketState }> {
  const c = marketClient(market);
  const [params, state] = await Promise.all([
    c.get_params().then((t) => t.result),
    c.get_state().then((t) => t.result),
  ]);
  return { params, state };
}

/** BlendTap: remaining borrow depth from the Blend adapter (7dp USDC); 0 if unset or read fails. */
export async function getBlendBackedDepth(market: string): Promise<bigint> {
  try {
    return BigInt((await marketClient(market).blend_backed_depth()).result);
  } catch {
    return 0n;
  }
}

export type Belief = distributionMarket.Belief;

/** Per-checkpoint consensus beliefs for a trajectory market. */
export async function getBeliefs(market: string): Promise<Belief[]> {
  try {
    const raw = (await marketClient(market).get_beliefs()).result;
    if (!Array.isArray(raw)) return [];
    return raw as Belief[];
  } catch {
    return [];
  }
}

/** Checkpoint timestamps (unix seconds) for a trajectory market; empty for a scalar market. */
export async function getCheckpoints(market: string): Promise<bigint[]> {
  try {
    const raw = (await marketClient(market).get_checkpoints()).result;
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => (typeof x === "bigint" ? x : BigInt(String(x))));
  } catch {
    return [];
  }
}

export async function getResolvedOutcomes(market: string): Promise<bigint[]> {
  try {
    return (await marketClient(market).resolved_outcomes()).result as bigint[];
  } catch {
    return [];
  }
}

export type { MarketCard };

export async function listMarkets(): Promise<MarketCard[]> {
  const addresses = await listMarketAddresses();
  return Promise.all(
    addresses.map(async (address) => {
      const info = await getMarketInfo(address);
      let status: MarketStatus | null = null;
      let crowdMuWad: bigint | undefined;
      let crowdSigmaWad: bigint | undefined;
      let kWad: bigint | undefined;
      let bWad: bigint | undefined;
      let blendBackedDepth7dp: bigint | undefined;
      try {
        const { params, state } = await getMarketState(address);
        status = state.status;
        kWad = params.k;
        bWad = params.b;
        blendBackedDepth7dp = await getBlendBackedDepth(address);
        if (info.outcome_space.tag === "Trajectory") {
          const beliefs = await getBeliefs(address);
          if (beliefs[0]) {
            crowdMuWad = beliefs[0].mu;
            crowdSigmaWad = beliefs[0].sigma;
          }
        } else {
          crowdMuWad = state.belief.mu;
          crowdSigmaWad = state.belief.sigma;
        }
      } catch {
        status = null;
      }
      return { address, info, status, crowdMuWad, crowdSigmaWad, kWad, bWad, blendBackedDepth7dp };
    }),
  );
}

/** Human label for a resolver tier code. */
export function tierLabel(tier: distributionMarket.ResolverTier): string {
  switch (tier) {
    case distributionMarket.ResolverTier.Reflector:
      return "T0 · Reflector oracle";
    case distributionMarket.ResolverTier.Attested:
      return "T1 · Attested";
    case distributionMarket.ResolverTier.Optimistic:
      return "T2 · Optimistic";
    case distributionMarket.ResolverTier.Designated:
      return "T3 · Designated";
    default:
      return "Unknown tier";
  }
}

/** Short label for a market status. */
export function statusLabel(status: MarketStatus | null): string {
  if (!status) return "—";
  switch (status.tag) {
    case "Open":
      return "Open";
    case "Locked":
      return "Locked";
    case "Resolved":
      return "Resolved";
    case "ResolvedVec":
      return "Resolved";
    case "Disputable":
      return "Disputable";
    default:
      return "—";
  }
}

/** Format a WAD-scaled outcome value for display (e.g. a price). */
export function formatWad(v: bigint, fractionDigits = 4): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const intPart = abs / WAD;
  const fracPart = abs % WAD;
  const fracStr = fracPart
    .toString()
    .padStart(18, "0")
    .slice(0, fractionDigits)
    .replace(/0+$/, "");
  return `${neg ? "-" : ""}${intPart}${fracStr ? "." + fracStr : ""}`;
}
