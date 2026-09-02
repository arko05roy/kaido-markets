"use client";

/**
 * TradePanel — the "trade this market" surface on /markets/[id]. Picks the
 * scalar or trajectory belief input by outcome space, lets you set a max
 * collateral, and submits via `@kaido/sdk` with the connected wallet's signer.
 * Read-only display lives in the page; this is the only client/write part.
 */
import { Kaido, type KaidoConfig } from "@kaido/sdk";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ScalarBeliefInput } from "@/components/forecast/scalar-belief-input";
import {
  TrajectoryBeliefInput,
  type TrajectoryBelief,
} from "@/components/forecast/trajectory-belief-input";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/provider";
import { useUsdcBalance } from "@/components/wallet/use-usdc-balance";
import { fromWad, type GaussianBelief } from "@/lib/curve";
import { savePosition } from "@/lib/positions";
import {
  USDC_FAUCET_URL,
} from "@/lib/stellar/usdc";

/** Serialisable view of the market the panel trades against (built server-side). */
export interface TradeMarketView {
  address: string;
  /** "scalar" or "trajectory". */
  kind: "scalar" | "trajectory";
  kWad: string;
  bWad: string;
  /** Consensus belief(s) — one for scalar, one per checkpoint for trajectory (WAD). */
  consensusMusWad: string[];
  consensusSigmasWad: string[];
  /** Checkpoint x-values for trajectory markets (unix seconds); empty for scalar. */
  checkpoints: number[];
  /** True once the market is locked/resolved (no more trades). */
  tradingOpen: boolean;
  /** Capped-Gaussian flag — affects chart rendering. */
  capped?: boolean;
}

const USDC_DECIMALS = 7;

export function TradePanel({
  config,
  market,
  onPositionOpened,
}: {
  config: KaidoConfig;
  market: TradeMarketView;
  /** Called after a position is opened (for settlement panel refresh). */
  onPositionOpened?: (positionId: bigint) => void;
}) {
  const { wallet, connecting } = useWallet();
  const kaido = useMemo(() => new Kaido(config), [config]);
  const { balance7dp: usdcBal } = useUsdcBalance(
    config.rpcUrl,
    config.networkPassphrase,
    config.usdcSacId,
    wallet?.signer.accountId,
  );

  const kWad = BigInt(market.kWad);
  const bWad = BigInt(market.bWad);
  const consensusScalar: GaussianBelief = {
    muWad: BigInt(market.consensusMusWad[0] ?? "0"),
    sigmaWad: BigInt(market.consensusSigmasWad[0] ?? "1"),
  };
  const consensusMus = market.consensusMusWad.map((m) => fromWad(BigInt(m)));

  const [scalarBelief, setScalarBelief] = useState<GaussianBelief>(consensusScalar);
  const [trajBelief, setTrajBelief] = useState<TrajectoryBelief>({
    musWad: market.checkpoints.map((_, i) => BigInt(market.consensusMusWad[i] ?? "0")),
    sigmasWad: market.checkpoints.map((_, i) => BigInt(market.consensusSigmasWad[i] ?? "1")),
  });
  const [maxUsdc, setMaxUsdc] = useState("1");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionId, setPositionId] = useState<bigint | null>(null);

  const submit = async () => {
    if (!wallet) return;
    setSubmitting(true);
    setError(null);
    setPositionId(null);
    try {
      const n = Number(maxUsdc);
      if (!Number.isFinite(n) || n <= 0) throw new Error("max collateral must be a positive number");
      const maxCollateral7dp = BigInt(Math.round(n * 10 ** USDC_DECIMALS));
      let id: bigint;
      if (market.kind === "scalar") {
        id = await kaido.trade(
          market.address,
          { mu2: scalarBelief.muWad, sigma2: scalarBelief.sigmaWad, maxCollateral7dp },
          wallet.signer,
        );
      } else {
        id = await kaido.tradeTrajectory(
          market.address,
          { mus2: trajBelief.musWad, sigmas2: trajBelief.sigmasWad, maxCollateral7dp },
          wallet.signer,
        );
      }
      setPositionId(id);
      if (wallet) {
        savePosition(config.network, wallet.signer.accountId, market.address, id, {
          ...(market.kind === "scalar"
            ? { muWad: scalarBelief.muWad, sigmaWad: scalarBelief.sigmaWad }
            : {}),
        });
        onPositionOpened?.(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "trade failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!market.tradingOpen) {
    return (
      <div className="border border-dashed border-white/15 px-5 py-4 text-sm text-white/50">
        Trading is closed for this market (locked or resolved).
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 border border-white/10 bg-[#0a0a0b] p-6">
      <div>
        <h2 className="kaido-section-title">Take a position</h2>
        <p className="mt-1 kaido-section-sub">Drag the sliders to set where you think the number lands.</p>
      </div>
      {market.kind === "scalar" ? (
        <ScalarBeliefInput
          market={{ kWad, bWad, capped: market.capped }}
          consensus={consensusScalar}
          disabled={submitting}
          onChange={setScalarBelief}
        />
      ) : (
        <TrajectoryBeliefInput
          market={{ kWad, bWad }}
          checkpoints={market.checkpoints}
          consensusMus={consensusMus}
          disabled={submitting}
          onChange={setTrajBelief}
        />
      )}
      <label className="flex max-w-xs flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">Max to spend (USDC)</span>
        <input
          type="number"
          min={0}
          step="0.0000001"
          value={maxUsdc}
          onChange={(e) => setMaxUsdc(e.target.value)}
          className="kaido-input"
          disabled={submitting}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        {!wallet ? (
          <span className="text-sm text-white/50">{connecting ? "Connecting…" : "Connect Freighter to trade"}</span>
        ) : (
          <Button
            onClick={() => void submit()}
            disabled={submitting || (usdcBal != null && usdcBal <= 0n)}
            className="rounded-full bg-[#f3efe6] px-6 text-[12px] uppercase tracking-[0.16em] text-[#0b0b0c] hover:bg-white"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitting ? "Submitting…" : "Submit position"}
          </Button>
        )}
        {positionId != null && (
          <span className="text-sm text-white/55">
            Position opened.{" "}
            <Link href={`/markets/${market.address}`} className="text-[#d8c69a] underline underline-offset-4">Refresh</Link>
          </span>
        )}
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {wallet && usdcBal != null && usdcBal <= 0n && (
        <p className="text-xs text-white/40">
          You need testnet USDC to trade.{" "}
          <a
            href={USDC_FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#d8c69a] underline underline-offset-2"
          >
            Get USDC from the faucet
          </a>
          .
        </p>
      )}
    </div>
  );
}
