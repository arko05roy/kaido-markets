import { Kaido, type KaidoConfig, type KaidoSigner } from "@kaido/sdk";

import { estimatePayoutPreview, formatContractTradeError } from "@/lib/market-display";

const USDC_DECIMALS = 7;

export interface TradeQuote {
  collateralUsdc: number;
  maxWin: number;
  multiple: number;
  worstCase: number;
  feeUsdc: number;
  simulated: boolean;
}

/** Simulate trade on-chain, then attach payout estimates for receipt UI. */
export async function simulateTradeQuote(
  config: KaidoConfig,
  marketId: string,
  args: {
    kind: "scalar" | "trajectory";
    mu2?: bigint;
    sigma2?: bigint;
    mus2?: bigint[];
    sigmas2?: bigint[];
    maxCollateral7dp: bigint;
    kWad: bigint;
    bWad: bigint;
    crowdMuWad: bigint;
    crowdSigmaWad: bigint;
    feeBps?: number;
    capped?: boolean;
  },
  signer: KaidoSigner,
): Promise<TradeQuote> {
  const kaido = new Kaido(config);
  const market = kaido.market(marketId, signer);
  try {
    if (args.kind === "scalar") {
      if (args.mu2 == null || args.sigma2 == null) throw new Error("Missing belief");
      await market.trade({
        trader: signer.accountId,
        mu2: args.mu2,
        sigma2: args.sigma2,
        max_collateral_7dp: args.maxCollateral7dp,
      });
    } else {
      if (!args.mus2?.length || !args.sigmas2?.length) throw new Error("Missing trajectory belief");
      await market.trade_trajectory({
        trader: signer.accountId,
        mus2: args.mus2,
        sigmas2: args.sigmas2,
        max_collateral_7dp: args.maxCollateral7dp,
      });
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Trade simulation failed";
    throw new Error(formatContractTradeError(raw));
  }

  const riskUsdc = Number(args.maxCollateral7dp) / 10 ** USDC_DECIMALS;
  const marketCurve = { kWad: args.kWad, bWad: args.bWad, capped: args.capped };
  const payout =
    args.kind === "scalar" && args.mu2 != null && args.sigma2 != null
      ? estimatePayoutPreview({
          riskUsdc,
          yourBelief: { muWad: args.mu2, sigmaWad: args.sigma2 },
          crowdBelief: { muWad: args.crowdMuWad, sigmaWad: args.crowdSigmaWad },
          market: marketCurve,
        })
      : { maxWin: 0, multiple: 0 };
  const feeUsdc = args.feeBps ? riskUsdc * (args.feeBps / 10_000) : 0;

  return {
    collateralUsdc: riskUsdc,
    maxWin: payout.maxWin,
    multiple: payout.multiple,
    worstCase: riskUsdc,
    feeUsdc,
    simulated: true,
  };
}
