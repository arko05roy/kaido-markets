"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { type KaidoConfig } from "@kaido/sdk";

import { MetricChip, NetworkBadge } from "@/components/app/dashboard-page-header";
import { PageEyebrow, Panel, PrimaryLink, SectionLabel } from "@/components/app/kaido-ui";
import { useLedgerNow } from "@/components/providers/ledger-time-provider";
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
  statusLabel,
  tradingPhase,
} from "@/lib/market-display";
import { clientSettlementAsset } from "@/lib/settlement-asset";
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

const TABS: { id: Tab; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "settled", label: "Settled" },
  { id: "all", label: "All" },
];

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

function isRowSettled(row: PositionRow): boolean {
  return row.position.claimedAt != null || statusLabel(row.market.status) === "Resolved";
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
  const risk = position.collateral7dp ? Number(position.collateral7dp) / 1e7 : 25;
  const payout =
    market.crowdMuWad != null && market.crowdSigmaWad != null
      ? estimatePayoutPreview({
          riskUsdc: risk,
          yourBelief: { muWad: BigInt(muWad), sigmaWad: BigInt(sigmaWad) },
          crowdBelief: { muWad: market.crowdMuWad, sigmaWad: market.crowdSigmaWad },
          market: { kWad, bWad },
        })
      : { maxWin: 0, multiple: 0 };
  const sigma = fromWad(BigInt(sigmaWad));
  const conviction = convictionLabel(convictionFromSigma(sigma, 1e-6, sigma * 16));

  const sym = clientSettlementAsset().symbol;
  return {
    marketId: row.marketId,
    marketTitle: title,
    status: statusLabel(market.status),
    call: formatOutcome(mu),
    conviction,
    riskUsdc: `${risk} ${sym}`,
    edgeLabel: `${edge.deltaLabel}. ${edge.stance}.`,
    maxWin: `+${payout.maxWin.toFixed(2)} ${sym}`,
    closesIn: undefined,
    crowdMuWad: market.crowdMuWad?.toString(),
    crowdSigmaWad: market.crowdSigmaWad?.toString(),
    kWad: kWad.toString(),
    bWad: bWad.toString(),
  };
}

type CallRailData = {
  yourPct: number;
  crowdPct: number;
  minLabel: string;
  maxLabel: string;
};

function buildCallRail(yourMu: number, crowdMu: number, crowdSigma: number): CallRailData {
  const pad = Math.max(3 * crowdSigma, Math.abs(crowdMu) * 0.05, 1);
  const min = Math.min(yourMu, crowdMu) - pad;
  const max = Math.max(yourMu, crowdMu) + pad;
  const span = Math.max(max - min, 1e-9);
  const toPct = (v: number) => Math.min(100, Math.max(0, ((v - min) / span) * 100));
  return {
    yourPct: toPct(yourMu),
    crowdPct: toPct(crowdMu),
    minLabel: formatOutcome(min),
    maxLabel: formatOutcome(max),
  };
}

/** Your call vs crowd on one rail — signature for position cards. */
function PositionCallRail({
  rail,
  yourCall,
  crowd,
  live,
}: {
  rail: CallRailData;
  yourCall: string;
  crowd: string;
  live: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="relative h-9 w-full" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.1]" />
        <div
          className={cn(
            "absolute top-1/2 h-2 -translate-y-1/2 rounded-full",
            live ? "bg-[#d8c69a]/25" : "bg-white/[0.06]",
          )}
          style={{
            left: `${Math.min(rail.yourPct, rail.crowdPct)}%`,
            width: `${Math.max(Math.abs(rail.crowdPct - rail.yourPct), 2)}%`,
          }}
        />
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#f3efe6] bg-[#f3efe6] shadow-[0_0_8px_rgba(243,239,230,0.3)]"
          style={{ left: `${rail.yourPct}%` }}
        />
        <div
          className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d8c69a]"
          style={{ left: `${rail.crowdPct}%` }}
        />
      </div>
      <div className="flex items-end justify-between gap-2 font-mono text-[10px] tabular-nums tracking-tight">
        <span className="text-white/25">{rail.minLabel}</span>
        <span className={cn("text-[11px]", live ? "text-[#d8c69a]" : "text-white/45")}>
          You · {yourCall} · Crowd · {crowd}
        </span>
        <span className="text-white/25">{rail.maxLabel}</span>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1",
        accent
          ? "border-[#d8c69a]/25 bg-[#d8c69a]/[0.08]"
          : "border-white/[0.06] bg-white/[0.02]",
      )}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          accent ? "text-[#d8c69a]" : "text-white/70",
        )}
      >
        {value}
      </span>
    </span>
  );
}

function PositionsBoardHeader({
  network,
  openCount,
  settledCount,
  tab,
  onTabChange,
  totalCount,
}: {
  network: string;
  openCount: number;
  settledCount: number;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  totalCount: number;
}) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c1c21] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.1),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.05),transparent_65%)]" />

      <div className="relative flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <PageEyebrow>Your book</PageEyebrow>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.05] tracking-[-0.03em] text-[#f3efe6]">
                Your calls
              </h1>
              <NetworkBadge network={network} />
            </div>
            <p className="max-w-[52ch] text-sm leading-relaxed text-white/45">
              Open and settled beliefs across every market — synced from this browser and chain
              events.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <MetricChip label="Open" value={openCount} accent />
            <MetricChip label="Settled" value={settledCount} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/[0.04] bg-[#141416]/70 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={cn(
                  "shrink-0 rounded-lg px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-[background-color,color] duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c21]",
                  tab === t.id
                    ? "bg-[#2a2a30] font-medium text-[#f3efe6] shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
                    : "text-white/45 hover:text-white/70",
                )}
              >
                {t.label}
                {t.id === "open" && openCount > 0 ? ` (${openCount})` : ""}
                {t.id === "settled" && settledCount > 0 ? ` (${settledCount})` : ""}
              </button>
            ))}
          </div>
          {tab !== "all" && totalCount > 0 && (
            <p className="shrink-0 font-mono text-[11px] text-white/35">
              {tab === "open" ? openCount : settledCount} of {totalCount}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

function SectionDivider({ label, count, muted }: { label: string; count: number; muted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-4", muted && "opacity-70")}>
      <SectionLabel>
        {label} · {count}
      </SectionLabel>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

function PositionCard({
  row,
  liveMuWad,
  onView,
  style,
}: {
  row: PositionRow;
  liveMuWad?: string;
  onView: () => void;
  style?: React.CSSProperties;
}) {
  const settled = isRowSettled(row);
  const status = statusLabel(row.market.status);
  const live = status === "Open" && !settled;
  const muWad = row.position.muWad;
  const call = muWad != null ? formatOutcome(fromWad(BigInt(muWad))) : "—";
  const crowdMuStr = liveMuWad ?? row.market.crowdMuWad?.toString();
  const crowd = crowdMuStr ? crowdTargetLabel(BigInt(crowdMuStr)) : null;
  const lockSec = Number(row.market.info.window.lock);
  const riskUsdc = row.position.collateral7dp
    ? (Number(row.position.collateral7dp) / 1e7).toFixed(0)
    : null;

  let edgeLabel: string | null = null;
  let rail: CallRailData | null = null;
  if (muWad && crowdMuStr && row.market.crowdSigmaWad) {
    const yourMu = fromWad(BigInt(muWad));
    const crowdMu = fromWad(BigInt(crowdMuStr));
    const crowdSigma = fromWad(row.market.crowdSigmaWad);
    edgeLabel = edgeVsCrowd(yourMu, crowdMu).deltaLabel;
    rail = buildCallRail(yourMu, crowdMu, crowdSigma);
  }

  let conviction: string | null = null;
  if (row.position.sigmaWad) {
    const sigma = fromWad(BigInt(row.position.sigmaWad));
    conviction = convictionLabel(convictionFromSigma(sigma, 1e-6, sigma * 16));
  }

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c1c21]",
        "border-l-[3px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
        "transition-[border-color,background-color,box-shadow] duration-250",
        "motion-safe:hover:border-[#d8c69a]/16 motion-safe:hover:bg-[#1f1f25]",
        "motion-safe:hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.55)]",
        live ? "border-l-[#d8c69a]/55" : "border-l-white/[0.08]",
        settled && "opacity-[0.92]",
        "market-card-enter",
      )}
      style={style}
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,38%)] lg:items-center lg:gap-8">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
              {live ? (
                <span className="relative flex items-center gap-1.5 text-emerald-300/90">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Open
                </span>
              ) : (
                <span>{settled ? "Settled" : status}</span>
              )}
            </div>
            {live && (
              <div className="text-right">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">
                  Closes in
                </p>
                <p className="font-mono text-sm tabular-nums text-[#f3efe6]">
                  <ClosesIn at={lockSec} />
                </p>
              </div>
            )}
          </div>

          <h2 className="font-serif text-[1.2rem] leading-[1.15] tracking-[-0.02em] text-[#f3efe6] sm:text-[1.35rem]">
            {row.title}
          </h2>

          <div className="flex flex-wrap gap-1.5">
            <StatChip label="Your call" value={call} accent />
            {riskUsdc && <StatChip label="Risk" value={riskUsdc} />}
            {conviction && <StatChip label="Conviction" value={conviction} />}
            {edgeLabel && crowd && (
              <StatChip label="Vs crowd" value={`${edgeLabel} (${crowd})`} accent />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:flex-col">
          {rail && crowd ? (
            <PositionCallRail rail={rail} yourCall={call} crowd={crowd} live={live} />
          ) : null}
          {row.market.crowdMuWad && row.market.crowdSigmaWad && (
            <MiniCrowdCurve
              muWad={row.market.crowdMuWad}
              sigmaWad={row.market.crowdSigmaWad}
              kWad={row.market.kWad ?? 1n}
              bWad={row.market.bWad ?? 1n}
              className="mx-auto h-12 w-32 opacity-80 sm:mx-0"
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-white/[0.05] px-5 py-4 sm:px-6">
        <Button
          variant="outline"
          size="sm"
          asChild
          className="rounded-xl border-white/[0.1] font-mono text-[10px] uppercase tracking-[0.14em] text-white/55 hover:border-[#d8c69a]/30 hover:text-[#f3efe6]"
        >
          <Link href={`/markets/${row.marketId}`}>Trade range</Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onView}
          className="rounded-xl border-white/[0.1] font-mono text-[10px] uppercase tracking-[0.14em] text-[#d8c69a] hover:border-[#d8c69a]/30 hover:bg-[#d8c69a]/10"
        >
          View belief
        </Button>
      </div>
    </article>
  );
}

function PositionsList({
  rows,
  liveCrowdMuWad,
  onViewRow,
  startIndex = 0,
}: {
  rows: PositionRow[];
  liveCrowdMuWad: Record<string, string>;
  onViewRow: (row: PositionRow) => void;
  startIndex?: number;
}) {
  return (
    <div className="space-y-4">
      {rows.map((row, i) => (
        <PositionCard
          key={`${row.marketId}-${row.position.id}`}
          row={row}
          liveMuWad={liveCrowdMuWad[row.marketId]}
          onView={() => onViewRow(row)}
          style={{ animationDelay: `${(startIndex + i) * 55}ms` }}
        />
      ))}
    </div>
  );
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
  const { nowSec } = useLedgerNow();
  const [tab, setTab] = useState<Tab>("all");
  const [walletGate, setWalletGate] = useState(false);
  const [detail, setDetail] = useState<PositionDetailData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<PositionRow | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const rows = useMemo(() => {
    if (!wallet) return [];
    return listAllPositions(network, wallet.accountId, markets).map((r) => ({
      ...r,
      title: titlesByMarket[r.marketId] ?? `${r.marketId.slice(0, 8)}…`,
    }));
  }, [network, wallet, markets, titlesByMarket]);

  const [liveCrowdMuWad, setLiveCrowdMuWad] = useState<Record<string, string>>({});

  const refreshCrowd = useCallback(async () => {
    const openMarkets = [
      ...new Set(
        rows
          .filter(
            (r) =>
              !isRowSettled(r) &&
              (isTradingWindowOpen(r.market.status?.tag, r.market.info.window, nowSec) ||
                tradingPhase(r.market.status?.tag, r.market.info.window, nowSec) === "before_open"),
          )
          .map((r) => r.marketId),
      ),
    ];
    if (openMarkets.length === 0) return;
    const next: Record<string, string> = {};
    await Promise.all(
      openMarkets.map(async (id) => {
        try {
          const res = await fetch(`/api/markets/${id}/crowd`);
          const body = (await res.json()) as { muWad?: string; musWad?: string[] };
          const mu = body.musWad?.[0] ?? body.muWad;
          if (mu) next[id] = mu;
        } catch {
          /* skip */
        }
      }),
    );
    if (Object.keys(next).length) setLiveCrowdMuWad((prev) => ({ ...prev, ...next }));
  }, [rows, nowSec]);

  useEffect(() => {
    void refreshCrowd();
    const t = setInterval(() => void refreshCrowd(), 12_000);
    return () => clearInterval(t);
  }, [refreshCrowd]);

  const openRows = useMemo(() => rows.filter((r) => !isRowSettled(r)), [rows]);
  const settledRows = useMemo(() => rows.filter((r) => isRowSettled(r)), [rows]);

  const filtered = useMemo(() => {
    if (tab === "open") return openRows;
    if (tab === "settled") return settledRows;
    return rows;
  }, [rows, tab, openRows, settledRows]);

  const handleViewRow = (row: PositionRow) => {
    const d = rowDetail(row, row.title);
    if (d) {
      setDetail(d);
      setDetailRow(row);
      setDetailOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <PositionsBoardHeader
        network={network}
        openCount={openRows.length}
        settledCount={settledRows.length}
        tab={tab}
        onTabChange={setTab}
        totalCount={rows.length}
      />

      {!wallet ? (
        <Panel className="relative flex flex-col items-center gap-4 overflow-hidden border-dashed px-8 py-16 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(216,198,154,0.06),transparent_70%)]" />
          <p className="relative font-serif text-2xl text-[#f3efe6]">Connect to see your beliefs</p>
          <p className="relative max-w-md text-sm leading-relaxed text-white/50">
            Kaido tracks positions you open from this browser. Connect Freighter to load them.
          </p>
          <Button
            onClick={() => setWalletGate(true)}
            className="relative rounded-xl bg-[#f3efe6] px-6 font-mono text-[11px] uppercase tracking-[0.16em] text-[#141416] hover:bg-white"
          >
            Connect wallet
          </Button>
        </Panel>
      ) : filtered.length === 0 ? (
        <Panel className="relative flex flex-col items-center gap-4 overflow-hidden border-dashed px-8 py-16 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(216,198,154,0.06),transparent_70%)]" />
          <p className="relative font-serif text-2xl text-[#f3efe6]">No beliefs yet</p>
          <p className="relative max-w-md text-sm leading-relaxed text-white/50">
            Trade on a market — your calls show up here after you place a belief.
          </p>
          <div className="relative">
            <PrimaryLink href="/markets">Browse markets</PrimaryLink>
          </div>
        </Panel>
      ) : tab === "all" ? (
        <div className="space-y-8">
          {openRows.length > 0 && (
            <section className="space-y-4">
              <SectionDivider label="Open" count={openRows.length} />
              <PositionsList
                rows={openRows}
                liveCrowdMuWad={liveCrowdMuWad}
                onViewRow={handleViewRow}
              />
            </section>
          )}
          {settledRows.length > 0 && (
            <section className="space-y-4">
              <SectionDivider label="Archive" count={settledRows.length} muted />
              <PositionsList
                rows={settledRows}
                liveCrowdMuWad={liveCrowdMuWad}
                onViewRow={handleViewRow}
                startIndex={openRows.length}
              />
            </section>
          )}
        </div>
      ) : (
        <PositionsList
          rows={filtered}
          liveCrowdMuWad={liveCrowdMuWad}
          onViewRow={handleViewRow}
        />
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
          isTradingWindowOpen(
            detailRow.market.status?.tag,
            detailRow.market.info.window,
            nowSec,
          )
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
          market={tradeViewFromMarketCard(detailRow.market, nowSec)}
          marketTitle={detailRow.title}
        />
      )}
    </div>
  );
}
