"use client";

/**
 * TradePanel — degen-friendly trade ticket with receipt modal + simulated quote.
 */
import { Kaido, type KaidoConfig } from "@kaido/sdk";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useLedgerNow } from "@/components/providers/ledger-time-provider";

import { ScalarBeliefInput } from "@/components/forecast/scalar-belief-input";
import {
  TrajectoryBeliefInput,
  type TrajectoryBelief,
} from "@/components/forecast/trajectory-belief-input";
import { ShareCurveModal } from "@/components/modals/first-visit-modal";
import { BlendBorrowModal } from "@/components/modals/blend-borrow-modal";
import {
  TradeReceiptModal,
  TradeSubmittingModal,
} from "@/components/modals/trade-receipt-modal";
import { TradeErrorModal, WalletGateModal } from "@/components/modals/wallet-gate-modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useWallet } from "@/components/wallet/provider";
import { useUsdcBalance } from "@/components/wallet/use-usdc-balance";
import {
  crowdTargetLabel,
  convictionFromSigma,
  convictionLabel,
  edgeVsCrowd,
  estimatePayoutPreview,
  formatContractTradeError,
  formatOutcome,
  formatPayoutMultiple,
  isTradingWindowOpen,
  tradingClosedReason,
} from "@/lib/market-display";
import { effectiveSigmaFloor, fromWad, type GaussianBelief } from "@/lib/curve";
import { savePosition } from "@/lib/positions";
import { exportShareCurvePng } from "@/lib/share-curve-export";
import { simulateTradeQuote, type TradeQuote } from "@/lib/trade-quote";
import { USDC_FAUCET_URL } from "@/lib/stellar/usdc";
import { clientSettlementAsset, SETTLEMENT_DECIMALS } from "@/lib/settlement-asset";
import { DemoFaucetButton } from "@/components/wallet/demo-faucet-button";
import { chartRangeForConfig, formatCallLabel, parseOutcomeConfig } from "@/lib/outcome-scale";
import type { LiveCrowdSnapshot } from "@/lib/use-live-crowd";
import { cn } from "@/lib/utils";

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
  feeBps?: number;
  marketTitle?: string;
  marketStyle?: import("@/lib/outcome-scale").MarketStyle;
  outcomeMin?: number;
  outcomeMax?: number;
  divisions?: number[];
  divisionLabels?: string[];
  optionLow?: string;
  optionHigh?: string;
  /** BlendTap headroom (7-dp USDC); omit when unreadable. */
  blendBackedDepth7dp?: bigint;
}

const RISK_PRESETS = [10, 25, 50, 100];

function PayoutPreview({
  riskUsdc,
  maxWin,
  multiple,
  worstCase,
  symbol,
}: {
  riskUsdc: number;
  maxWin: number;
  multiple: number;
  worstCase: number;
  symbol: string;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-white/[0.06] bg-[#141416]/60 p-4">
      <div className="flex justify-between text-sm">
        <span className="text-white/45">You risk</span>
        <span className="font-mono tabular-nums text-[#f3efe6]">
          {riskUsdc} {symbol}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-white/45">If you nail it</span>
        <span className="font-mono tabular-nums text-emerald-300/90">
          +{maxWin.toFixed(2)} {symbol}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-white/45">Max multiple</span>
        <span className="font-mono tabular-nums text-[#d8c69a]">{formatPayoutMultiple(multiple)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-white/45">Worst case</span>
        <span className="font-mono tabular-nums text-red-300/90">
          −{worstCase.toFixed(2)} {symbol}
        </span>
      </div>
      <p className="border-t border-white/[0.06] pt-2 text-[10px] leading-relaxed text-white/35">
        Rough estimate, max 25×. Exact quote shown before signing.
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
  positionId,
  onShare,
  symbol,
}: {
  call: string;
  conviction: string;
  riskUsdc: number;
  maxWin: number;
  edgeLabel: string;
  positionId: bigint;
  onShare: () => void;
  symbol: string;
}) {
  return (
    <div className="space-y-3 border border-emerald-500/25 bg-emerald-500/5 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300/80">
        Your belief is live · #{positionId.toString()}
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
          <span className="font-mono text-[#f3efe6]">
            {riskUsdc} {symbol}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/45">Max win</span>
          <span className="font-mono text-emerald-300/90">
            +{maxWin.toFixed(2)} {symbol}
          </span>
        </div>
      </div>
      <p className="text-xs text-white/50">{edgeLabel}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onShare}
          className="border-white/15 text-[11px] uppercase tracking-[0.14em]"
        >
          Share curve
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          asChild
          className="border-white/15 text-[11px] uppercase tracking-[0.14em]"
        >
          <Link href="/positions">View position</Link>
        </Button>
      </div>
    </div>
  );
}

export function TradePanel({
  config,
  market,
  onPositionOpened,
  onBeliefChange,
  onPreviewChange,
  compact,
}: {
  config: KaidoConfig;
  market: TradeMarketView;
  onPositionOpened?: (positionId: bigint, consensus: LiveCrowdSnapshot) => void;
  onBeliefChange?: (belief: GaussianBelief) => void;
  onPreviewChange?: (call: string, multiple: number) => void;
  compact?: boolean;
}) {
  const { wallet, connecting, connect } = useWallet();
  const { toast } = useToast();
  const kaido = useMemo(() => new Kaido(config), [config]);
  const settlement = clientSettlementAsset();
  const sym = settlement.symbol;
  const { balance7dp: usdcBal, refresh: refreshBal } = useUsdcBalance(
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

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [blendOpen, setBlendOpen] = useState(false);
  const [blendDepth7dp, setBlendDepth7dp] = useState<bigint>(0n);
  const [blendDepthLoading, setBlendDepthLoading] = useState(false);
  const [walletGate, setWalletGate] = useState<"connect" | "no-funds" | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [positionId, setPositionId] = useState<bigint | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const { nowSec } = useLedgerNow();

  const tradingOpen = isTradingWindowOpen(
    market.statusTag,
    { open: market.windowOpen, lock: market.windowLock },
    nowSec,
  );

  const riskUsdc = Number(maxUsdc);
  const crowdMu = fromWad(consensusScalar.muWad);
  const yourMu = fromWad(scalarBelief.muWad);
  const yourSigma = fromWad(scalarBelief.sigmaWad);
  const crowdSigma = fromWad(consensusScalar.sigmaWad);
  const outcomeConfig = useMemo(
    () =>
      parseOutcomeConfig({
        marketStyle: market.marketStyle,
        outcomeMin: market.outcomeMin,
        outcomeMax: market.outcomeMax,
        divisions: market.divisions,
        divisionLabels: market.divisionLabels,
        optionLow: market.optionLow,
        optionHigh: market.optionHigh,
      }),
    [
      market.marketStyle,
      market.outcomeMin,
      market.outcomeMax,
      market.divisions,
      market.divisionLabels,
      market.optionLow,
      market.optionHigh,
    ],
  );
  const scalarChartRange = useMemo(
    () => (market.kind === "scalar" ? chartRangeForConfig(outcomeConfig, crowdMu, crowdSigma) : null),
    [market.kind, outcomeConfig, crowdMu, crowdSigma],
  );
  const floorReal = Math.max(1e-12, fromWad(effectiveSigmaFloor(kWad, bWad)));
  const sigmaMax = Math.max(Math.abs(crowdMu) * 0.5, floorReal * 16);

  const payout =
    market.kind !== "scalar" || !Number.isFinite(riskUsdc) || riskUsdc <= 0
      ? { maxWin: 0, multiple: 0, poolLimited: false }
      : estimatePayoutPreview({
          riskUsdc,
          yourBelief: scalarBelief,
          crowdBelief: consensusScalar,
          market: marketCurve,
        });

  const edge = edgeVsCrowd(yourMu, crowdMu);
  const conviction = convictionFromSigma(yourSigma, floorReal, sigmaMax);
  const callLabel = market.kind === "scalar" ? formatCallLabel(outcomeConfig, yourMu) || formatOutcome(yourMu) : "Trajectory belief";
  const convictionText = market.kind === "scalar" ? convictionLabel(conviction) : "—";

  useEffect(() => {
    setQuote(null);
  }, [scalarBelief.muWad, scalarBelief.sigmaWad, maxUsdc]);

  useEffect(() => {
    if (market.kind === "scalar") onBeliefChange?.(scalarBelief);
  }, [market.kind, scalarBelief, onBeliefChange]);

  useEffect(() => {
    if (market.kind !== "scalar") return;
    onPreviewChange?.(callLabel, quote?.multiple ?? payout.multiple);
  }, [market.kind, callLabel, quote, payout.multiple, onPreviewChange]);

  const openReceipt = async () => {
    if (!wallet) {
      setWalletGate("connect");
      return;
    }
    if (usdcBal != null && usdcBal <= 0n) {
      setWalletGate("no-funds");
      return;
    }
    const n = Number(maxUsdc);
    if (!Number.isFinite(n) || n <= 0) {
      setErrorMsg("Risk amount must be a positive number");
      setErrorOpen(true);
      return;
    }

    setReceiptOpen(true);
    setQuoting(true);
    setQuote(null);
    try {
      const maxCollateral7dp = BigInt(Math.round(n * 10 ** SETTLEMENT_DECIMALS));
      const q = await simulateTradeQuote(
        config,
        market.address,
        {
          kind: market.kind,
          mu2: market.kind === "scalar" ? scalarBelief.muWad : undefined,
          sigma2: market.kind === "scalar" ? scalarBelief.sigmaWad : undefined,
          mus2: market.kind === "trajectory" ? trajBelief.musWad : undefined,
          sigmas2: market.kind === "trajectory" ? trajBelief.sigmasWad : undefined,
          maxCollateral7dp,
          kWad,
          bWad,
          crowdMuWad: consensusScalar.muWad,
          crowdSigmaWad: consensusScalar.sigmaWad,
          feeBps: market.feeBps,
          capped: market.capped,
        },
        wallet.signer,
      );
      setQuote(q);
    } catch (e) {
      setReceiptOpen(false);
      setErrorMsg(e instanceof Error ? e.message : "Could not simulate trade");
      setErrorOpen(true);
    } finally {
      setQuoting(false);
    }
  };

  const blendTapEnabled = !settlement.isDemo;

  const openBlendStep = async () => {
    setReceiptOpen(false);
    setBlendOpen(true);
    setBlendDepthLoading(true);
    const seed = market.blendBackedDepth7dp ?? 0n;
    setBlendDepth7dp(seed);
    try {
      const live = await kaido.blendBackedDepth(market.address);
      setBlendDepth7dp(live);
    } catch {
      if (seed > 0n) setBlendDepth7dp(seed);
    } finally {
      setBlendDepthLoading(false);
    }
  };

  const handleReceiptConfirm = () => {
    if (blendTapEnabled) {
      void openBlendStep();
      return;
    }
    void confirmTrade();
  };

  const confirmTrade = async () => {
    if (!wallet) return;
    setSubmitting(true);
    try {
      const n = Number(maxUsdc);
      const maxCollateral7dp = BigInt(Math.round(n * 10 ** SETTLEMENT_DECIMALS));
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
      setReceiptOpen(false);
      setBlendOpen(false);
      savePosition(config.network, wallet.signer.accountId, market.address, id, {
        ...(market.kind === "scalar"
          ? { muWad: scalarBelief.muWad, sigmaWad: scalarBelief.sigmaWad, collateral7dp: maxCollateral7dp }
          : { collateral7dp: maxCollateral7dp }),
      });
      const consensus: LiveCrowdSnapshot =
        market.kind === "scalar"
          ? {
              consensusMusWad: [scalarBelief.muWad.toString()],
              consensusSigmasWad: [scalarBelief.sigmaWad.toString()],
            }
          : {
              consensusMusWad: trajBelief.musWad.map((m) => m.toString()),
              consensusSigmasWad: trajBelief.sigmasWad.map((s) => s.toString()),
            };
      onPositionOpened?.(id, consensus);
      toast({
        title: "Belief is live",
        description: `Position #${id.toString()} — view in Positions`,
        variant: "success",
      });
    } catch (e) {
      setReceiptOpen(false);
      setBlendOpen(false);
      const raw = e instanceof Error ? e.message : "Trade failed";
      setErrorMsg(formatContractTradeError(raw));
      setErrorOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (!tradingOpen) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.1] bg-[#1c1c21]/50 px-5 py-4 text-sm text-white/50">
        {tradingClosedReason(market.statusTag, { open: market.windowOpen, lock: market.windowLock }, nowSec)}
      </div>
    );
  }

  const displayPayout = { maxWin: payout.maxWin, multiple: payout.multiple, worstCase: riskUsdc };

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-5 rounded-2xl border border-white/[0.06] bg-[#1c1c21] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] sm:p-6",
          compact && "border-0 bg-transparent p-0 shadow-none",
        )}
      >
        {!compact && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#d8c69a]">
              {outcomeConfig?.style === "binary" ? "Pick your side" : "Call the number"}
            </p>
            <p className="mt-1 text-sm text-white/45">
              {outcomeConfig?.style === "binary"
                ? "Slide toward your option, then size your risk."
                : "Set your call, press conviction, size your risk."}
            </p>
          </div>
        )}

        {market.kind === "scalar" ? (
          <ScalarBeliefInput
            market={marketCurve}
            consensus={consensusScalar}
            range={scalarChartRange ?? undefined}
            outcomeConfig={outcomeConfig ?? undefined}
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

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
            Risk amount ({sym})
          </span>
          <div className="flex flex-wrap gap-2">
            {RISK_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setMaxUsdc(String(p))}
                disabled={submitting}
                className={cn(
                  "rounded-lg border px-3 py-1.5 font-mono text-[11px] tabular-nums transition-colors",
                  maxUsdc === String(p)
                    ? "border-[#d8c69a]/40 bg-[#d8c69a]/12 text-[#f3efe6]"
                    : "border-white/[0.08] text-white/45 hover:border-white/15",
                )}
              >
                {p}
              </button>
            ))}
          </div>
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
        </div>

        {Number.isFinite(riskUsdc) && riskUsdc > 0 && (
          <PayoutPreview
            riskUsdc={riskUsdc}
            maxWin={payout.maxWin}
            multiple={payout.multiple}
            worstCase={riskUsdc}
            symbol={sym}
          />
        )}

        <Button
          onClick={() => void openReceipt()}
          disabled={submitting || quoting}
          className="min-h-11 w-full rounded-xl bg-[#f3efe6] px-6 text-[12px] uppercase tracking-[0.16em] text-[#141416] hover:bg-white"
        >
          {quoting ? <Loader2 className="size-4 animate-spin" /> : null}
          Place belief
        </Button>

        {!wallet && (
          <p className="text-center text-xs text-white/40">
            {connecting ? "Connecting…" : "Connect Freighter to trade"}
          </p>
        )}
        {wallet && usdcBal != null && usdcBal <= 0n && (
          <div className="flex flex-col items-center gap-2 text-xs text-white/40">
            {settlement.isDemo ? (
              <>
                <p>You need demo {sym} to trade.</p>
                <DemoFaucetButton symbol={sym} issuer={settlement.issuer} onSuccess={refreshBal} />
              </>
            ) : (
              <p>
                You need testnet USDC.{" "}
                <a
                  href={USDC_FAUCET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#d8c69a] underline"
                >
                  Get USDC
                </a>
              </p>
            )}
          </div>
        )}

        {positionId != null && (
          <PositionLiveCard
            call={callLabel}
            conviction={convictionText}
            riskUsdc={riskUsdc}
            maxWin={displayPayout.maxWin}
            edgeLabel={
              market.kind === "scalar"
                ? `Currently ${edge.deltaLabel}. ${edge.stance}.`
                : "Your belief is live. Watch the crowd move."
            }
            positionId={positionId}
            symbol={sym}
            onShare={() => setShareOpen(true)}
          />
        )}
      </div>

      <WalletGateModal
        open={walletGate != null}
        mode={walletGate ?? "connect"}
        onOpenChange={(v) => !v && setWalletGate(null)}
        onConnect={() => void connect("freighter").then(() => setWalletGate(null))}
        connecting={connecting}
        networkLabel={config.network}
        onFaucetSuccess={refreshBal}
      />
      <TradeReceiptModal
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        call={callLabel}
        conviction={convictionText}
        riskUsdc={riskUsdc}
        quote={quote}
        quoting={quoting}
        symbol={sym}
        onConfirm={handleReceiptConfirm}
        onBack={() => setReceiptOpen(false)}
      />
      <BlendBorrowModal
        open={blendOpen}
        onOpenChange={(v) => {
          if (!v && !submitting) {
            setBlendOpen(false);
            setReceiptOpen(true);
          }
        }}
        symbol={sym}
        feeBps={market.feeBps ?? 0}
        riskUsdc={riskUsdc}
        availableDepth7dp={blendDepth7dp}
        loadingDepth={blendDepthLoading}
        onContinue={() => void confirmTrade()}
        continuing={submitting}
      />
      <TradeSubmittingModal open={submitting} />
      <TradeErrorModal
        open={errorOpen}
        message={errorMsg}
        onOpenChange={setErrorOpen}
        onRetry={() => {
          setErrorOpen(false);
          void openReceipt();
        }}
      />
      <ShareCurveModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        marketTitle={market.marketTitle ?? "Market"}
        call={callLabel}
        conviction={convictionText}
        maxWin={`+${displayPayout.maxWin.toFixed(2)} ${sym}`}
        onDownloadPng={
          market.kind === "scalar"
            ? () =>
                exportShareCurvePng({
                  marketTitle: market.marketTitle ?? "Market",
                  call: callLabel,
                  conviction: convictionText,
                  crowdTarget: crowdTargetLabel(consensusScalar.muWad, outcomeConfig),
                  maxWin: `+${displayPayout.maxWin.toFixed(2)} ${sym}`,
                  consensus: consensusScalar,
                  yours: scalarBelief,
                  market: marketCurve,
                })
            : undefined
        }
      />
    </>
  );
}

/** Sticky mobile CTA — tap opens full ticket in a sheet. */
export function MobileTradeBar({
  call,
  multiple,
  onOpen,
}: {
  call: string;
  multiple: number;
  onOpen: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#141416]/95 p-3 backdrop-blur-md lg:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-[#f3efe6] px-4 py-3.5 text-left"
      >
        <span className="min-w-0 truncate font-mono text-xs text-[#141416]">
          Your call: {call} · {multiple.toFixed(1)}x
        </span>
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.16em] text-[#141416]">
          Place belief
        </span>
      </button>
    </div>
  );
}
