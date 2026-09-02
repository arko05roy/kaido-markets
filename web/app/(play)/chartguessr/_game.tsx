"use client";

/**
 * ChartGuessr — the launch game loop (build.md E12):
 *
 *   watch (live BTC from the Reflector feed)  →  set your forecast (sliders)  →
 *   submit (a real `tradeTrajectory` on the configured market, play-vs-house)  →
 *   wait for the window  →  resolve + claim  →  result.
 *
 * Belief input is slider-driven (`TrajectoryBeliefInput`), not freehand — the
 * per-checkpoint `(μ, σ)` are exactly what's submitted (ADR-8), bounded to a
 * sane price window so they can't drift into nonsense. Everything on-chain goes
 * through `@kaido/sdk` with the connected wallet's signer; nothing is mocked.
 */
import { Kaido, type KaidoConfig } from "@kaido/sdk";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  TrajectoryBeliefInput,
  type TrajectoryBelief,
} from "@/components/forecast/trajectory-belief-input";
import { useWallet } from "@/components/wallet/provider";
import { Button } from "@/components/ui/button";
import { fromWad } from "@/lib/curve";

/** Plain (serialisable) view of the configured ChartGuessr market. */
export interface ChartGuessrMarket {
  address: string;
  kWad: string;
  bWad: string;
  /** Checkpoint timestamps (unix seconds), ascending. */
  checkpoints: number[];
  /** Current per-checkpoint consensus means (WAD). */
  consensusMusWad: string[];
  windowOpen: number;
  windowLock: number;
  windowResolve: number;
}

type Phase = "watch" | "draw" | "submitting" | "submitted" | "resolving" | "result";

const WATCH_MS = 45_000;
const POLL_MS = 1_500;
const COLLATERAL_BUDGET_7DP = 5_000_000n; // 0.5 USDC max per play (testnet-friendly)

interface BtcSample {
  t: number; // unix seconds
  priceWad: bigint;
}

export function ChartGuessrGame({
  config,
  market,
}: {
  config: KaidoConfig;
  market: ChartGuessrMarket | null;
}) {
  const { wallet, connecting } = useWallet();
  const kaido = useMemo(() => new Kaido(config), [config]);

  const [phase, setPhase] = useState<Phase>("watch");
  const [samples, setSamples] = useState<BtcSample[]>([]);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [belief, setBelief] = useState<TrajectoryBelief | null>(null);
  const [watchStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [positionId, setPositionId] = useState<bigint | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [payoutWad, setPayoutWad] = useState<bigint | null>(null);
  const [resolvedOutcomes, setResolvedOutcomes] = useState<bigint[] | null>(null);

  // --- live BTC polling during the watch phase ---------------------------
  useEffect(() => {
    if (phase !== "watch") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/btc", { cache: "no-store" });
        const body = (await res.json()) as { priceWad: string; timestamp: number } | { error: string };
        if (cancelled) return;
        if ("error" in body) {
          setFeedError(body.error);
        } else {
          setFeedError(null);
          setSamples((prev) => [
            ...prev,
            { t: body.timestamp || Math.floor(Date.now() / 1000), priceWad: BigInt(body.priceWad) },
          ]);
        }
      } catch (e) {
        if (!cancelled) setFeedError(e instanceof Error ? e.message : "feed unreachable");
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase]);

  // --- clock (also drives the watch→draw transition) ----------------------
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setPhase((p) => (p === "watch" && t - watchStart >= WATCH_MS ? "draw" : p));
    }, 250);
    return () => clearInterval(id);
  }, [watchStart]);

  const chartSamples = useMemo(
    () => samples.map((s) => ({ x: s.t, y: fromWad(s.priceWad) })),
    [samples],
  );
  const consensusMus = useMemo(
    () => (market ? market.consensusMusWad.map((m) => fromWad(BigInt(m))) : []),
    [market],
  );

  const submit = useCallback(async () => {
    if (!market || !belief || !wallet) return;
    setPhase("submitting");
    setTxError(null);
    try {
      const id = await kaido.tradeTrajectory(
        market.address,
        { mus2: belief.musWad, sigmas2: belief.sigmasWad, maxCollateral7dp: COLLATERAL_BUDGET_7DP },
        wallet.signer,
      );
      setPositionId(id);
      setPhase("submitted");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "trade failed");
      setPhase("draw");
    }
  }, [market, belief, wallet, kaido]);

  const resolveAndClaim = useCallback(async () => {
    if (!market || positionId == null || !wallet) return;
    setPhase("resolving");
    setTxError(null);
    try {
      try {
        await kaido.resolve(market.address, wallet.signer);
      } catch {
        /* already resolved */
      }
      const outcomes = (await kaido.market(market.address).resolved_outcomes()).result as bigint[];
      setResolvedOutcomes(outcomes.map((x) => BigInt(x)));
      const payout = await kaido.claimTrajectory(market.address, positionId, wallet.signer);
      setPayoutWad(BigInt(payout));
      setPhase("result");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "resolve/claim failed");
      setPhase("submitted");
    }
  }, [market, positionId, wallet, kaido]);

  if (!market) {
    return (
      <Notice title="No ChartGuessr market configured">
        Deploy a BTC trajectory market and set <code className="font-mono">NEXT_PUBLIC_CHARTGUESSR_MARKET</code>{" "}
        (or it&apos;s read from <code className="font-mono">config/networks.&lt;network&gt;.json</code>{" "}
        <code className="font-mono">demo.chartGuessrMarket</code>, which <code className="font-mono">make
        deploy:testnet</code> writes). Until then there&apos;s nothing real to play against.
      </Notice>
    );
  }

  const watchLeft = Math.max(0, Math.ceil((WATCH_MS - (now - watchStart)) / 1000));
  const inputDisabled = phase !== "draw";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">ChartGuessr · BTC</h1>
        <PhaseBadge phase={phase} watchLeft={watchLeft} />
      </header>

      <TrajectoryBeliefInput
        market={{ kWad: BigInt(market.kWad), bWad: BigInt(market.bWad) }}
        checkpoints={market.checkpoints}
        consensusMus={consensusMus}
        samples={chartSamples}
        disabled={inputDisabled}
        onChange={setBelief}
      />

      {phase === "watch" && (
        <p className="text-sm text-muted-foreground">
          Watching live BTC… {watchLeft}s until you set your forecast.{" "}
          {feedError ? <span className="text-destructive">Feed: {feedError}</span> : `${samples.length} ticks`}
        </p>
      )}

      {phase === "draw" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Set each of the {market.checkpoints.length} checkpoints — value and how confident.
          </p>
          <div className="ml-auto flex items-center gap-2">
            {!wallet ? (
              <span className="text-sm text-muted-foreground">{connecting ? "connecting…" : "connect a wallet to submit"}</span>
            ) : (
              <Button size="sm" disabled={!belief} onClick={() => void submit()}>
                Submit forecast
              </Button>
            )}
          </div>
        </div>
      )}

      {(phase === "submitting" || phase === "resolving") && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {phase === "submitting" ? "Submitting your forecast on-chain…" : "Resolving and claiming…"}
        </p>
      )}

      {phase === "submitted" && positionId != null && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
          <p className="text-sm">
            Forecast in. Position <span className="font-mono">#{positionId.toString()}</span>. Comes back
            after the window resolves ({new Date(market.windowResolve * 1000).toLocaleTimeString()}).
          </p>
          {wallet && (
            <Button className="ml-auto" size="sm" onClick={() => void resolveAndClaim()}>
              Resolve &amp; claim
            </Button>
          )}
        </div>
      )}

      {phase === "result" && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-lg font-semibold">
            {payoutWad != null && payoutWad > 0n ? "You won 🎉" : "No payout this round"}
          </p>
          {payoutWad != null && (
            <p className="text-sm text-muted-foreground">payout: {(Number(payoutWad) / 1e7).toFixed(4)} USDC</p>
          )}
          {resolvedOutcomes && (
            <p className="mt-1 text-xs text-muted-foreground">
              actual: {resolvedOutcomes.map((x) => fromWad(x).toFixed(0)).join(" · ")}
            </p>
          )}
          <Button className="mt-3" size="sm" variant="outline" onClick={() => location.reload()}>
            Play again
          </Button>
        </div>
      )}

      {txError && <p className="text-sm text-destructive">{txError}</p>}
    </div>
  );
}

function PhaseBadge({ phase, watchLeft }: { phase: Phase; watchLeft: number }) {
  const label =
    phase === "watch"
      ? `watch · ${watchLeft}s`
      : phase === "draw"
        ? "set forecast"
        : phase === "submitting"
          ? "submitting…"
          : phase === "submitted"
            ? "locked"
            : phase === "resolving"
              ? "resolving…"
              : "result";
  return (
    <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-lg border bg-card p-6 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
