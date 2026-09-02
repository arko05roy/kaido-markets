import { LeaderboardBoard } from "@/components/leaderboard/leaderboard-board";
import { buildCalibrationLeaderboard } from "@/lib/leaderboard/scores";
import { activeNetworkId } from "@/lib/stellar/networks";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const network = activeNetworkId();
  let rows: Awaited<ReturnType<typeof buildCalibrationLeaderboard>> = [];
  let error: string | null = null;
  try {
    rows = await buildCalibrationLeaderboard(100);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load leaderboard from RPC";
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <LeaderboardBoard network={network} rows={rows} error={error} />
    </div>
  );
}
