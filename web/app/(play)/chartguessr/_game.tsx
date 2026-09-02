"use client";

/**
 * ChartGuessr — the launch game loop (build.md E12), Sprint 3 "ugly but real":
 *
 *   watch (live BTC from the Reflector feed)  →  draw a path  →  submit (a real
 *   `tradeTrajectory` on the configured market, play-vs-house)  →  wait for the
 *   window  →  resolve + claim  →  result.
 *
 * Everything on-chain goes through `@kaido/sdk` with the connected wallet's
 * signer. Nothing is mocked: no configured market / no Reflector feed ⇒ the UI
 * says so instead of faking data. The 45s/15s clock is a soft guide here;
 * the contract's `MarketWindow` is the real authority.
 */
import { Kaido, type KaidoConfig } from "@kaido/sdk";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ForecastCanvas, type CanvasOverlay } from "@/components/canvas/forecast-canvas";
import { useWallet } from "@/components/wallet/provider";
import { Button } from "@/components/ui/button";
import { fitTrajectory, fromWad, pathToCheckpointValues, type DrawnPoint } from "@/lib/curve";

/** Plain (serialisable) view of the configured ChartGuessr market. */
export interface ChartGuessrMarket {
  /** Market contract id. */
  address: string;
  /** WAD-scaled `k` and `b` from `get_params`. */
  kWad: string;
  bWad: string;
  /** Checkpoint timestamps (unix seconds), ascending. */
  checkpoints: number[];
  /** Current per-checkpoint consensus means (WAD), one per checkpoint. */
  consensusMusWad: string[];
  /** Window: open / lock / resolve unix seconds. */
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
  const [drawn, setDrawn] = useState<DrawnPoint[]>([]);
  const [watchStart] = useState(() => Date.now());
  const [fallbackT0] = useState(() => Math.floor(Date.now() / 1000));
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
        const body = (await res.json()) as
          | { priceWad: string; timestamp: number }
          | { error: string };
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

  // --- canvas geometry ----------------------------------------------------
  // x-axis: "now" (t0) at the left, the last checkpoint at the right.
  const t0 = samples[0]?.t ?? fallbackT0;
  const lastCheckpoint = market?.checkpoints.at(-1) ?? t0 + 60;
  const xMin = 0;
  const xMax = Math.max(1, lastCheckpoint - t0);
  const priceVals = [
    ...samples.map((s) => fromWad(s.priceWad)),
    ...(market?.consensusMusWad ?? []).map((m) => fromWad(BigInt(m))),
  ].filter((v) => Number.isFinite(v) && v > 0);
  const yMid = priceVals.length ? priceVals.reduce((a, b) => a + b, 0) / priceVals.length : 1;
  const ySpread = priceVals.length
    ? Math.max(yMid * 0.04, ...priceVals.map((v) => Math.abs(v - yMid)))
    : 1;
  const yMin = yMid - ySpread * 1.4;
  const yMax = yMid + ySpread * 1.4;

  const checkpointXs = (market?.checkpoints ?? []).map((c) => c - t0);

  const overlays: CanvasOverlay[] = useMemo(() => {
    const o: CanvasOverlay[] = [];
    if (samples.length > 1) {
      o.push({
        points: samples.map((s) => ({ x: s.t - t0, y: fromWad(s.priceWad) })),
        color: "var(--color-chart-1, #f59e0b)",
        opacity: 0.9,
        label: "BTC (live)",
      });
    }
    if (market && market.consensusMusWad.length === market.checkpoints.length) {
      o.push({
        points: market.checkpoints.map((c, i) => ({ x: c - t0, y: fromWad(BigInt(market.consensusMusWad[i])) })),
        color: "var(--color-muted-foreground, #71717a)",
        dashed: true,
        opacity: 0.6,
        label: "consensus",
      });
    }
    return o;
  }, [samples, market, t0]);

  // --- fit + submit -------------------------------------------------------
  const fit = useMemo(() => {
    if (!market || drawn.length < 2) return null;
    try {
      return fitTrajectory(drawn, checkpointXs, { kWad: BigInt(market.kWad), bWad: BigInt(market.bWad) });
    } catch {
      return null;
    }
  }, [market, drawn, checkpointXs]);

  const submit = useCallback(async () => {
    if (!market || !fit || !wallet) return;
    setPhase("submitting");
    setTxError(null);
    try {
      const id = await kaido.tradeTrajectory(
        market.address,
        { mus2: fit.musWad, sigmas2: fit.sigmasWad, maxCollateral7dp: COLLATERAL_BUDGET_7DP },
        wallet.signer,
      );
      setPositionId(id);
      setPhase("submitted");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "trade failed");
      setPhase("draw");
    }
  }, [market, fit, wallet, kaido]);

  const resolveAndClaim = useCallback(async () => {
    if (!market || positionId == null || !wallet) return;
    setPhase("resolving");
    setTxError(null);
    try {
      // resolve() is idempotent-ish: if already resolved the contract errors and
      // we proceed to read + claim anyway.
      try {
        await kaido.resolve(market.address, wallet.signer);
      } catch {
        /* already resolved */
      }
      const { state } = await kaido.getMarket(market.address);
      void state;
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

  // --- render -------------------------------------------------------------
  if (!market) {
    return (
      <Notice title="No ChartGuessr market configured">
        Deploy a BTC trajectory market and set <code className="font-mono">NEXT_PUBLIC_CHARTGUESSR_MARKET</code>{" "}
        to its contract id (the <code className="font-mono">make deploy:testnet</code> trajectory demo does
        this). Until then there&apos;s nothing real to play against.
      </Notice>
    );
  }

  const watchLeft = Math.max(0, Math.ceil((WATCH_MS - (now - watchStart)) / 1000));
  const previewValues = fit ? pathToCheckpointValues(drawn, checkpointXs) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">ChartGuessr · BTC</h1>
        <PhaseBadge phase={phase} watchLeft={watchLeft} />
      </header>

      <ForecastCanvas
        xMin={xMin}
        xMax={xMax}
        yMin={yMin}
        yMax={yMax}
        width={720}
        height={340}
        disabled={phase !== "draw"}
        overlays={overlays}
        checkpointXs={checkpointXs}
        onPathChange={setDrawn}
      />

      {phase === "watch" && (
        <p className="text-sm text-muted-foreground">
          Watching live BTC… {watchLeft}s until you draw.{" "}
          {feedError ? <span className="text-destructive">Feed: {feedError}</span> : `${samples.length} ticks`}
        </p>
      )}

      {phase === "draw" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Draw where BTC goes through the {market.checkpoints.length} checkpoints.
          </p>
          {previewValues && (
            <p className="text-xs text-muted-foreground">
              fit: {previewValues.map((v) => v.toFixed(0)).join(" · ")}
            </p>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDrawn([])} disabled={drawn.length === 0}>
              Clear
            </Button>
            {!wallet ? (
              <span className="text-sm text-muted-foreground">{connecting ? "connecting…" : "connect a wallet to submit"}</span>
            ) : (
              <Button size="sm" disabled={!fit} onClick={() => void submit()}>
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
            after the window resolves (
            {new Date(market.windowResolve * 1000).toLocaleTimeString()}).
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
        ? "draw"
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
