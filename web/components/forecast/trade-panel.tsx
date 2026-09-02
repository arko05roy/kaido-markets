"use client";

/**
 * TradePanel — degen-friendly trade ticket: call, conviction, risk, payout preview.
 */
import { Kaido, type KaidoConfig } from "@kaido/sdk";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ScalarBeliefInput } from "@/components/forecast/scalar-belief-input";
import {
  TrajectoryBeliefInput,
  type TrajectoryBelief,
} from "@/components/forecast/trajectory-belief-input";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/provider";
import { useUsdcBalance } from "@/components/wallet/use-usdc-balance";
import {
  convictionFromSigma,
  convictionLabel,
  edgeVsCrowd,
  estimatePayoutPreview,
  formatContractTradeError,
  formatOutcome,
  isTradingWindowOpen,
  peakAtMu,
  tradingClosedReason,
} from "@/lib/market-display";
import { effectiveSigmaFloor, fromWad, type GaussianBelief } from "@/lib/curve";
import { savePosition } from "@/lib/positions";
import { USDC_FAUCET_URL } from "@/lib/stellar/usdc";

export interface TradeMarketView {
  address: string;
  kind: "scalar" | "trajectory";
  kWad: string;
  bWad: string;
  consensusMusWad: string[];
  consensusSigmasWad: string[];
  checkpoints: number[];
  statusTag: string;
  tradingOpen: boolean;
  windowOpen: number;
  windowLock: number;
  capped?: boolean;
}

const USDC_DECIMALS = 7;

function PayoutPreview({
  riskUsdc,
  maxWin,
  multiple,
  worstCase,
}: {
  riskUsdc: number;
  maxWin: number;
  multiple: number;
  worstCase: number;
}) {
  return (
    <div className="space-y-2 border border-white/10 bg-[#080809] p-4">
      <div className="flex justify-between text-sm">
        <span className="text-white/45">You risk</span>
        <span className="font-mono tabular-nums text-[#f3efe6]">{riskUsdc} USDC</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-white/45">If you nail it</span>
        <span className="font-mono tabular-nums text-emerald-300/90">
          +{maxWin.toFixed(2)} USDC
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-white/45">Max multiple</span>
        <span className="font-mono tabular-nums text-[#d8c69a]">{multiple.toFixed(1)}x</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-white/45">Worst case</span>
        <span className="font-mono tabular-nums text-red-300/90">−{worstCase.toFixed(2)} USDC</span>
      </div>
      <p className="border-t border-white/8 pt-2 text-[10px] leading-relaxed text-white/35">
        Estimated at current crowd. Final quote shown before signing.
      </p>
    </div>
  );
}

function PositionLiveCard({
  call,
  conviction,
  riskUsdc,
  maxWin,
  edgeLabel,
}: {
  call: string;
  conviction: string;
  riskUsdc: number;
  maxWin: number;
  edgeLabel: string;
}) {
  return (
    <div className="border border-emerald-500/25 bg-emerald-500/5 p-5 space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300/80">
        Your belief is live
      </p>
      <div className="grid gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-white/45">Call</span>
          <span className="font-mono text-[#f3efe6]">{call}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/45">Conviction</span>
          <span className="text-[#f3efe6]">{conviction}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/45">Risk</span>
          <span className="font-mono text-[#f3efe6]">{riskUsdc} USDC</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/45">Max win</span>
          <span className="font-mono text-emerald-300/90">+{maxWin.toFixed(2)} USDC</span>
        </div>
      </div>
      <p className="text-xs text-white/50">{edgeLabel}</p>
    </div>
  );
}

export function TradePanel({
  config,
  market,
  onPositionOpened,
}: {
  config: KaidoConfig;
  market: TradeMarketView;
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
  const marketCurve = { kWad, bWad, capped: market.capped };
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
  const [maxUsdc, setMaxUsdc] = useState("25");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionId, setPositionId] = useState<bigint | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const tradingOpen = isTradingWindowOpen(
    market.statusTag,
    { open: market.windowOpen, lock: market.windowLock },
    nowSec,
  );

  const riskUsdc = Number(maxUsdc);
  const crowdMu = fromWad(consensusScalar.muWad);
  const yourMu = fromWad(scalarBelief.muWad);
  const yourSigma = fromWad(scalarBelief.sigmaWad);
  const floorReal = Math.max(1e-12, fromWad(effectiveSigmaFloor(kWad, bWad)));
  const sigmaMax = Math.max(Math.abs(crowdMu) * 0.5, floorReal * 16);

  const payout = useMemo(() => {
    if (market.kind !== "scalar" || !Number.isFinite(riskUsdc) || riskUsdc <= 0) {
      return { maxWin: 0, multiple: 0 };
    }
    const yourPeak = peakAtMu(scalarBelief.muWad, scalarBelief.sigmaWad, marketCurve);
    const crowdPeak = peakAtMu(consensusScalar.muWad, consensusScalar.sigmaWad, marketCurve);
    return estimatePayoutPreview({
      riskUsdc,
      yourPeak,
      crowdPeak,
      bReal: fromWad(bWad),
    });
  }, [market.kind, riskUsdc, scalarBelief, consensusScalar, marketCurve, bWad]);

  const edge = edgeVsCrowd(yourMu, crowdMu);
  const conviction = convictionFromSigma(yourSigma, floorReal, sigmaMax);

  const submit = async () => {
    if (!wallet) return;
    setSubmitting(true);
    setError(null);
    setPositionId(null);
    try {
      const n = Number(maxUsdc);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Risk amount must be a positive number");
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
      const raw = e instanceof Error ? e.message : "Trade failed";
      setError(formatContractTradeError(raw));
    } finally {
      setSubmitting(false);
    }
  };

  if (!tradingOpen) {
    return (
      <div className="border border-dashed border-white/15 px-5 py-4 text-sm text-white/50">
        {tradingClosedReason(market.statusTag, { open: market.windowOpen, lock: market.windowLock }, nowSec)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 border border-white/10 bg-[#0a0a0b] p-5 sm:p-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#d8c69a]">
          Call the number
        </p>
        <p className="mt-1 text-sm text-white/45">Set your call, press conviction, size your risk.</p>
      </div>

      {market.kind === "scalar" ? (
        <ScalarBeliefInput
          market={marketCurve}
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

      <label className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          Risk amount (USDC)
        </span>
        <input
          type="number"
          min={0}
          step="0.0000001"
          value={maxUsdc}
          onChange={(e) => setMaxUsdc(e.target.value)}
          className="kaido-input"
          disabled={submitting}
          autoComplete="off"
        />
        <span className="text-[11px] text-white/35">
          Market risk capped at {maxUsdc || "0"} USDC, excluding network fees.
        </span>
      </label>

      {market.kind === "scalar" && Number.isFinite(riskUsdc) && riskUsdc > 0 && (
        <PayoutPreview
          riskUsdc={riskUsdc}
          maxWin={payout.maxWin}
          multiple={payout.multiple}
          worstCase={riskUsdc}
        />
      )}

      <div className="flex flex-col gap-3">
        {!wallet ? (
          <span className="text-sm text-white/50">
            {connecting ? "Connecting…" : "Connect Freighter to place belief"}
          </span>
        ) : (
          <Button
            onClick={() => void submit()}
            disabled={submitting || (usdcBal != null && usdcBal <= 0n)}
            className="min-h-11 w-full rounded-full bg-[#f3efe6] px-6 text-[12px] uppercase tracking-[0.16em] text-[#0b0b0c] hover:bg-white focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b]"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitting ? "Placing…" : "Place belief"}
          </Button>
        )}
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

      {positionId != null && market.kind === "scalar" && (
        <PositionLiveCard
          call={formatOutcome(yourMu)}
          conviction={convictionLabel(conviction)}
          riskUsdc={riskUsdc}
          maxWin={payout.maxWin}
          edgeLabel={`Currently ${edge.deltaLabel}. ${edge.stance}.`}
        />
      )}
      {positionId != null && market.kind === "trajectory" && (
        <PositionLiveCard
          call="Trajectory belief"
          conviction="—"
          riskUsdc={riskUsdc}
          maxWin={payout.maxWin}
          edgeLabel="Your belief is live. Watch the crowd move."
        />
      )}
    </div>
  );
}
