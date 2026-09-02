// Permissionless market-creation wizard — build.md E3 / Sprint 5.
export default function CreateMarketPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">Create a market</h1>
      <p className="text-muted-foreground">
        Pick an outcome space, resolver tier, k/b/fee and a window — wired to
        MarketFactory via the SDK in Sprint 5.
      </p>
    </main>
  );
}
