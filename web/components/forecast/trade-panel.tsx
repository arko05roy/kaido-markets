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
import { fromWad, type GaussianBelief } from "@/lib/curve";

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
}

const USDC_DECIMALS = 7;

export function TradePanel({ config, market }: { config: KaidoConfig; market: TradeMarketView }) {
  const { wallet, connecting } = useWallet();
  const kaido = useMemo(() => new Kaido(config), [config]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "trade failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!market.tradingOpen) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Trading is closed for this market (locked or resolved).
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Take a position</h2>
      {market.kind === "scalar" ? (
        <ScalarBeliefInput
          market={{ kWad, bWad }}
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
      <label className="flex max-w-xs flex-col gap-1.5 text-sm">
        <span className="font-medium">Max collateral (USDC)</span>
        <input
          type="number"
          min={0}
          step="0.0000001"
          value={maxUsdc}
          onChange={(e) => setMaxUsdc(e.target.value)}
          className="rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={submitting}
        />
        <span className="text-[11px] text-muted-foreground">
          Slippage guard — the trade reverts if it would lock more than this.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        {!wallet ? (
          <span className="text-sm text-muted-foreground">{connecting ? "connecting…" : "connect a wallet to trade"}</span>
        ) : (
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitting ? "Submitting…" : "Submit position"}
          </Button>
        )}
        {positionId != null && (
          <span className="text-sm">
            Position <span className="font-mono">#{positionId.toString()}</span> opened.{" "}
            <Link href={`/markets/${market.address}`} className="underline">refresh</Link>
          </span>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground">
        Trading needs a USDC trustline on your wallet (testnet:{" "}
        <code className="font-mono">USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5</code>) and a USDC balance.
      </p>
    </div>
  );
}
