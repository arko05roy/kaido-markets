"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { type KaidoConfig } from "@kaido/sdk";

import {
  DashboardPageHeader,
  MetricChip,
} from "@/components/app/dashboard-page-header";
import { Panel, PrimaryLink } from "@/components/app/kaido-ui";
import { ClosesIn } from "@/components/market/closes-in";
import { MiniCrowdCurve } from "@/components/market/mini-crowd-curve";
import { AdjustCallSheet } from "@/components/modals/adjust-call-sheet";
import {
  PositionDetailSheet,
  type PositionDetailData,
} from "@/components/modals/position-detail-sheet";
import { WalletGateModal } from "@/components/modals/wallet-gate-modal";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/provider";
import { fromWad } from "@/lib/curve";
import {
  convictionFromSigma,
  convictionLabel,
  crowdTargetLabel,
  edgeVsCrowd,
  estimatePayoutPreview,
  formatOutcome,
  isTradingWindowOpen,
  peakAtMu,
  statusLabel,
} from "@/lib/market-display";
import { tradeViewFromMarketCard } from "@/lib/market-card-trade-view";
import type { MarketCard } from "@/lib/market-types";
import { loadPositions, type SavedPosition } from "@/lib/positions";
import { exportShareCurvePng } from "@/lib/share-curve-export";
import { cn } from "@/lib/utils";

type Tab = "open" | "settled" | "all";

export interface PositionRow {
  marketId: string;
  market: MarketCard;
  position: SavedPosition;
  title: string;
}

function listAllPositions(network: string, wallet: string, markets: MarketCard[]): PositionRow[] {
  const byAddress = new Map(markets.map((m) => [m.address, m]));
  const rows: PositionRow[] = [];
  if (typeof window === "undefined") return rows;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(`kaido:positions:${network}:${wallet}:`)) continue;
    const marketId = key.split(":").pop();
    if (!marketId) continue;
    const market = byAddress.get(marketId);
    if (!market) continue;
    for (const p of loadPositions(network, wallet, marketId)) {
      rows.push({
        marketId,
        market,
        position: p,
        title: market.info ? "" : marketId,
      });
    }
  }
  return rows.sort((a, b) => b.position.openedAt - a.position.openedAt);
}

function rowDetail(row: PositionRow, title: string): PositionDetailData | null {
  const { market, position } = row;
  const muWad = position.muWad;
  const sigmaWad = position.sigmaWad;
  if (!muWad || !sigmaWad) return null;
  const mu = fromWad(BigInt(muWad));
  const crowdMu = market.crowdMuWad != null ? fromWad(market.crowdMuWad) : mu;
  const edge = edgeVsCrowd(mu, crowdMu);
  const kWad = row.market.kWad ?? 1n;
  const bWad = row.market.bWad ?? 1n;
  const risk = position.collateral7dp
    ? Number(position.collateral7dp) / 1e7
    : 25;
  const yourPeak = peakAtMu(BigInt(muWad), BigInt(sigmaWad), { kWad, bWad });
  const crowdPeak =
    market.crowdMuWad != null && market.crowdSigmaWad != null
      ? peakAtMu(market.crowdMuWad, market.crowdSigmaWad, { kWad, bWad })
      : 0;
  const payout = estimatePayoutPreview({
    riskUsdc: risk,
    yourPeak,
    crowdPeak,
    bReal: fromWad(bWad),
  });
  const sigma = fromWad(BigInt(sigmaWad));
  const conviction = convictionLabel(convictionFromSigma(sigma, 1e-6, sigma * 16));

  return {
    marketId: row.marketId,
    marketTitle: title,
    status: statusLabel(market.status),
    call: formatOutcome(mu),
    conviction,
    riskUsdc: `${risk} USDC`,
    edgeLabel: `${edge.deltaLabel}. ${edge.stance}.`,
    maxWin: `+${payout.maxWin.toFixed(2)} USDC`,
    closesIn:
      statusLabel(market.status) === "Open"
        ? undefined
        : undefined,
    crowdMuWad: market.crowdMuWad?.toString(),
    crowdSigmaWad: market.crowdSigmaWad?.toString(),
    kWad: kWad.toString(),
    bWad: bWad.toString(),
  };
}

export function PositionsBoard({
  network,
  markets,
  titlesByMarket,
  config,
}: {
  network: string;
  markets: MarketCard[];
  titlesByMarket: Record<string, string>;
  config: KaidoConfig | null;
}) {
  const { wallet, connecting, connect } = useWallet();
  const [tab, setTab] = useState<Tab>("all");
  const [walletGate, setWalletGate] = useState(false);
  const [detail, setDetail] = useState<PositionDetailData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<PositionRow | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const rows = useMemo(() => {
    if (!wallet) return [];
    const all = listAllPositions(network, wallet.accountId, markets).map((r) => ({
      ...r,
      title: titlesByMarket[r.marketId] ?? r.marketId.slice(0, 8) + "…",
    }));
    return all;
  }, [network, wallet, markets, titlesByMarket]);

  const [liveCrowdMuWad, setLiveCrowdMuWad] = useState<Record<string, string>>({});

  const refreshCrowd = useCallback(async () => {
    const openMarkets = [
      ...new Set(
        rows
          .filter((r) => !r.position.claimedAt && statusLabel(r.market.status) === "Open")
          .map((r) => r.marketId),
      ),
    ];
    if (openMarkets.length === 0) return;
    const next: Record<string, string> = {};
    await Promise.all(
      openMarkets.map(async (id) => {
        try {
          const res = await fetch(`/api/markets/${id}/crowd`);
          const body = (await res.json()) as { muWad?: string };
          if (body.muWad) next[id] = body.muWad;
        } catch {
          /* skip */
        }
      }),
    );
    if (Object.keys(next).length) setLiveCrowdMuWad((prev) => ({ ...prev, ...next }));
  }, [rows]);

  useEffect(() => {
    void refreshCrowd();
    const t = setInterval(() => void refreshCrowd(), 30_000);
    return () => clearInterval(t);
  }, [refreshCrowd]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const settled = r.position.claimedAt != null || statusLabel(r.market.status) === "Resolved";
      if (tab === "open") return !settled;
      if (tab === "settled") return settled;
      return true;
    });
  }, [rows, tab]);

  const openCount = rows.filter((r) => !r.position.claimedAt && statusLabel(r.market.status) !== "Resolved").length;
  const settledCount = rows.length - openCount;

  return (
    <div className="space-y-5">
      <DashboardPageHeader
        title="Your calls"
        description="Open and settled beliefs across every market — synced from this browser + chain events."
        network={network}
        trailing={
          <>
            <MetricChip label="Open" value={openCount} accent />
            <MetricChip label="Settled" value={settledCount} />
          </>
        }
        footer={
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-[#141416]/60 p-1">
            {(
              [
                { id: "open" as const, label: `Open (${openCount})` },
                { id: "settled" as const, label: `Settled (${settledCount})` },
                { id: "all" as const, label: "All" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em]",
                  tab === t.id
                    ? "bg-[#2a2a30] text-[#f3efe6]"
                    : "text-white/45 hover:text-white/70",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      {!wallet ? (
        <Panel className="flex flex-col items-center gap-4 border-dashed px-8 py-16 text-center">
          <p className="font-serif text-2xl text-[#f3efe6]">Connect to see your beliefs</p>
          <p className="max-w-md text-sm text-white/50">
            Kaido tracks positions you open from this browser. Connect Freighter to load them.
          </p>
          <Button
            onClick={() => setWalletGate(true)}
            className="bg-[#f3efe6] text-[#141416] hover:bg-white"
          >
            Connect wallet
          </Button>
        </Panel>
      ) : filtered.length === 0 ? (
        <Panel className="flex flex-col items-center gap-4 border-dashed px-8 py-16 text-center">
          <p className="font-serif text-2xl text-[#f3efe6]">No beliefs yet</p>
          <p className="max-w-md text-sm text-white/50">
            Trade on a market — your calls show up here after you place a belief.
          </p>
          <PrimaryLink href="/markets">Browse markets</PrimaryLink>
        </Panel>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const status = statusLabel(row.market.status);
            const liveMuWad =
              liveCrowdMuWad[row.marketId] ?? row.market.crowdMuWad?.toString();
            const crowd = liveMuWad ? crowdTargetLabel(BigInt(liveMuWad)) : null;
            const muWad = row.position.muWad;
            const call =
              muWad != null ? formatOutcome(fromWad(BigInt(muWad))) : "Belief";
            const lockSec = Number(row.market.info.window.lock);

            return (
              <Panel key={`${row.marketId}-${row.position.id}`} className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                      <span>{status}</span>
                      {status === "Open" && (
                        <>
                          <span>·</span>
                          <ClosesIn at={lockSec} />
                        </>
                      )}
                    </div>
                    <h2 className="font-serif text-lg text-[#f3efe6]">{row.title}</h2>
                    <p className="font-mono text-sm text-white/55">
                      Call {call}
                      {row.position.collateral7dp && (
                        <> · Risk {(Number(row.position.collateral7dp) / 1e7).toFixed(0)} USDC</>
                      )}
                    </p>
                    {crowd && muWad && liveMuWad && (
                      <p className="text-xs text-white/45">
                        {edgeVsCrowd(fromWad(BigInt(muWad)), fromWad(BigInt(liveMuWad))).deltaLabel}{" "}
                        vs crowd ({crowd})
                      </p>
                    )}
                  </div>
                  {row.market.crowdMuWad && row.market.crowdSigmaWad && (
                    <MiniCrowdCurve
                      muWad={row.market.crowdMuWad}
                      sigmaWad={row.market.crowdSigmaWad}
                      kWad={row.market.kWad ?? 1n}
                      bWad={row.market.bWad ?? 1n}
                      className="hidden w-[120px] sm:block"
                    />
                  )}
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/markets/${row.marketId}`}>Trade</Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const d = rowDetail(row, row.title);
                        if (d) {
                          setDetail(d);
                          setDetailRow(row);
                          setDetailOpen(true);
                        }
                      }}
                    >
                      View
                    </Button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <WalletGateModal
        open={walletGate}
        mode="connect"
        onOpenChange={setWalletGate}
        onConnect={() => void connect("freighter").then(() => setWalletGate(false))}
        connecting={connecting}
      />
      <PositionDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        data={detail}
        canAdjustCall={
          !!detailRow &&
          !!config &&
          statusLabel(detailRow.market.status) === "Open" &&
          isTradingWindowOpen(detailRow.market.status?.tag, detailRow.market.info.window)
        }
        onAdjustCall={() => {
          setDetailOpen(false);
          setAdjustOpen(true);
        }}
        onShare={
          detailRow?.position.muWad &&
          detailRow.position.sigmaWad &&
          detailRow.market.crowdMuWad &&
          detailRow.market.crowdSigmaWad &&
          detailRow.market.kWad &&
          detailRow.market.bWad
            ? () => {
                const muWad = BigInt(detailRow.position.muWad!);
                const sigmaWad = BigInt(detailRow.position.sigmaWad!);
                const crowdMu = BigInt(
                  liveCrowdMuWad[detailRow.marketId] ?? detailRow.market.crowdMuWad!.toString(),
                );
                exportShareCurvePng({
                  marketTitle: detailRow.title,
                  call: formatOutcome(fromWad(muWad)),
                  conviction: detail?.conviction ?? "",
                  crowdTarget: crowdTargetLabel(crowdMu),
                  maxWin: detail?.maxWin ?? "",
                  consensus: {
                    muWad: crowdMu,
                    sigmaWad: detailRow.market.crowdSigmaWad!,
                  },
                  yours: { muWad, sigmaWad },
                  market: {
                    kWad: detailRow.market.kWad!,
                    bWad: detailRow.market.bWad!,
                  },
                });
              }
            : undefined
        }
      />
      {config && detailRow && (
        <AdjustCallSheet
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
          config={config}
          market={tradeViewFromMarketCard(detailRow.market)}
          marketTitle={detailRow.title}
        />
      )}
    </div>
  );
}
