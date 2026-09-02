// Calibration leaderboard + streaks — build.md E13 / Sprint 6.
export default function LeaderboardPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <p className="text-muted-foreground">
        Ranked by calibration (Brier-like), not just $ won. Arrives in Sprint 6.
      </p>
    </main>
  );
}
