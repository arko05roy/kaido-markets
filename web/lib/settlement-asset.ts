/**
 * Settlement asset display + demo-mode helpers.
 *
 * Hackathon: KAIDO demo token (high supply, protocol LP seed, no BlendTap).
 * Mainnet (future): native XLM SAC + GMX-style multi-asset LP vault — swap
 * `settlementSymbol` / SAC id in config; contracts stay token-agnostic.
 */
import { type DeployedConfig } from "@/lib/stellar/contracts";

export const SETTLEMENT_DECIMALS = 7;

export interface SettlementAsset {
  symbol: string;
  isDemo: boolean;
  /** Classic issuer G-address (demo KAIDO only). */
  issuer?: string;
}

/** Client-safe — reads NEXT_PUBLIC_* injected by next.config from networks.json. */
export function clientSettlementAsset(): SettlementAsset {
  const symbol = process.env.NEXT_PUBLIC_KAIDO_SETTLEMENT_SYMBOL ?? "USDC";
  const isDemo =
    process.env.NEXT_PUBLIC_KAIDO_DEMO_MODE === "true" || symbol === "KAIDO";
  const issuer = process.env.NEXT_PUBLIC_KAIDO_ISSUER ?? undefined;
  return { symbol, isDemo, issuer };
}

export function settlementAsset(config?: Pick<DeployedConfig, "external"> | null): SettlementAsset {
  if (config?.external?.settlementSymbol) {
    const symbol = config.external.settlementSymbol;
    return {
      symbol,
      isDemo: config.external.demoMode === true || symbol === "KAIDO",
      issuer: config.external.kaidoIssuer ?? undefined,
    };
  }
  return clientSettlementAsset();
}

/** Human label for 7-dp on-chain amounts, e.g. "12.5 KAIDO". */
export function formatSettlementAmount(
  amount7dp: bigint | number,
  asset: Pick<SettlementAsset, "symbol"> = { symbol: "USDC" },
): string {
  const n = typeof amount7dp === "bigint" ? Number(amount7dp) / 1e7 : amount7dp;
  if (!Number.isFinite(n)) return "—";
  const formatted =
    n >= 10_000
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${formatted} ${asset.symbol}`;
}
