// Markets index — lists every market registered in the on-chain Registry.
import Link from "next/link";

import {
  AppShell,
  CurveSpark,
  EmptyState,
  ErrorState,
  GhostLink,
  PageEyebrow,
  PageTitle,
  Panel,
  PrimaryLink,
  StatusPill,
  TierBadge,
} from "@/components/app/kaido-ui";
import { activeNetworkId } from "@/lib/stellar/networks";
import {
  checkpointsFromOutcomeSpace,
  listMarkets,
  statusLabel,
  tierLabel,
  type MarketCard,
} from "@/lib/stellar/kaido";

export const dynamic = "force-dynamic";

function formatResolveTime(unixSec: bigint): string {
  const d = new Date(Number(unixSec) * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function MarketCardRow({ card }: { card: MarketCard }) {
  const { address, info, status } = card;
  const cpCount = checkpointsFromOutcomeSpace(info.outcome_space);
  const kind =
    info.outcome_space.tag === "Trajectory"
      ? `Trajectory · ${cpCount.length} checkpoints`
      : "Scalar";
  const statusText = statusLabel(status);

  return (
    <Link href={`/markets/${address}`} className="group block">
      <Panel className="flex items-stretch justify-between gap-4 p-5 transition-colors hover:border-[#d8c69a]/30 hover:bg-[#0e0e10] sm:p-6">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={statusText} />
            {info.capped && (
              <span className="border border-[#d8c69a]/25 bg-[#d8c69a]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#d8c69a]">
                Capped
              </span>
            )}
          </div>

          <div>
            <p className="font-mono text-sm tracking-wide text-[#f3efe6]">
              {address.slice(0, 8)}…{address.slice(-8)}
            </p>
            <p className="mt-1 text-sm text-white/45">{kind}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            <TierBadge label={tierLabel(info.tier)} />
            <span>resolves {formatResolveTime(info.window.resolve)}</span>
          </div>
        </div>

        <div className="flex flex-col items-end justify-between gap-3">
          <CurveSpark />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35 transition-colors group-hover:text-[#d8c69a]">
            Trade →
          </span>
        </div>
      </Panel>
    </Link>
  );
}

export default async function MarketsPage() {
  const network = activeNetworkId();
  let markets: MarketCard[] | null = null;
  let error: string | null = null;
  try {
    markets = await listMarkets();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const openCount = markets?.filter((m) => statusLabel(m.status) === "Open").length ?? 0;

  return (
    <AppShell>
      <div className="space-y-12">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-5">
            <PageEyebrow>On-chain registry · {network}</PageEyebrow>
            <PageTitle
              title="Markets"
              subtitle="Every distribution market on Stellar. Trade a belief curve, wait for resolution, claim your payout."
            />
          </div>
          <PrimaryLink href="/create">Create a market</PrimaryLink>
        </div>

        {markets && markets.length > 0 && (
          <div className="flex flex-wrap gap-6 border-y border-white/10 py-5 font-mono text-[10px] uppercase tracking-[0.22em]">
            <div>
              <span className="text-white/35">Registered </span>
              <span className="text-[#f3efe6]">{markets.length}</span>
            </div>
            <div>
              <span className="text-white/35">Open now </span>
              <span className="text-[#d8c69a]">{openCount}</span>
            </div>
            <div className="text-white/35">
              Trade → resolve → claim
            </div>
          </div>
        )}

        {error ? (
          <ErrorState title="Couldn't read the registry" body={error} />
        ) : markets && markets.length === 0 ? (
          <EmptyState
            title="No markets yet"
            body="Be the first to ship a distribution market. Pick an outcome space, choose a resolver tier, and seed the initial belief."
            action={<PrimaryLink href="/create">Create a market</PrimaryLink>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-px bg-white/10 lg:grid-cols-2">
            {markets!.map((card) => (
              <MarketCardRow key={card.address} card={card} />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8">
          <GhostLink href="/leaderboard">View calibration leaderboard</GhostLink>
          <GhostLink href="/whitepaper">Read the whitepaper</GhostLink>
        </div>
      </div>
    </AppShell>
  );
}
