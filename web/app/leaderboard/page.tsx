import { buildCalibrationLeaderboard } from "@/lib/leaderboard/scores";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  let rows: Awaited<ReturnType<typeof buildCalibrationLeaderboard>> = [];
  let error: string | null = null;
  try {
    rows = await buildCalibrationLeaderboard(100);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load leaderboard from RPC";
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">
          Ranked by calibration on resolved scalar markets (Brier-like Gaussian score from
          on-chain positions). Live data from Stellar testnet RPC — no mock rows.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && rows.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No resolved markets with scorable trades yet. Trade on a market, wait for resolution,
          then refresh.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Forecaster</th>
                <th className="px-3 py-2 font-medium text-right">Calibration</th>
                <th className="px-3 py-2 font-medium text-right">Markets</th>
                <th className="px-3 py-2 font-medium text-right">Streak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.address} className="border-b last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.address}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.calibration.toFixed(3)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.marketsScored}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.streak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
