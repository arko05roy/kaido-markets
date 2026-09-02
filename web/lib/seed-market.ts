/** Client helper: protocol treasury LP-seeds a market (demo mode only). */
export async function seedMarketLiquidity(marketId: string): Promise<void> {
  const res = await fetch("/api/seed-market", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Seed failed (${res.status})`);
  }
}
