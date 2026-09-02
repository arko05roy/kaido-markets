"use client";

import {
  DashboardPageHeader,
} from "@/components/app/dashboard-page-header";
import { ErrorState, Panel } from "@/components/app/kaido-ui";

export interface LeaderboardRow {
  address: string;
  calibration: number;
  marketsScored: number;
  streak: number;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function LeaderboardBoard({
  network,
  rows,
  error,
}: {
  network: string;
  rows: LeaderboardRow[];
  error: string | null;
}) {
  const copy = (addr: string) => void navigator.clipboard.writeText(addr);

  return (
    <div className="space-y-5">
      <DashboardPageHeader
        title="Leaderboard"
        description="Ranked by calibration on resolved markets — lower Brier-like score is better."
        network={network}
      />

      {error && (
        <Panel className="border-red-500/30 bg-red-500/5 px-6 py-4">
          <ErrorState title="Couldn't load leaderboard" body={error} />
        </Panel>
      )}

      {!error && rows.length === 0 && (
        <Panel className="flex flex-col items-center gap-4 border-dashed px-8 py-16 text-center">
          <p className="font-serif text-2xl text-[#f3efe6]">No scores yet</p>
          <p className="max-w-md text-sm text-white/50">
            Trade on a market and wait for resolution — forecasters appear here once markets settle.
          </p>
        </Panel>
      )}

      {rows.length > 0 && (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/[0.06] bg-[#141416]/60 text-left">
                <tr>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    #
                  </th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    Forecaster
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    Calibration
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    Markets
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    Streak
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.address} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-3 font-mono text-white/35">{i + 1}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => copy(r.address)}
                        title={r.address}
                        className="font-mono text-xs text-[#d8c69a] hover:text-[#f3efe6]"
                      >
                        {truncateAddress(r.address)}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#f3efe6]">
                      {r.calibration.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-white/55">
                      {r.marketsScored}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-white/55">
                      {r.streak}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
