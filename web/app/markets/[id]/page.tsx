// Generic market page (distribution mode) — build.md E11 / Sprint 5.
// Next 16: `params` is a Promise.
export default async function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">Market</h1>
      <p className="font-mono text-sm text-muted-foreground">{id}</p>
      <p className="text-muted-foreground">
        Distribution-mode canvas, consensus overlay, LP panel and resolver tier
        badge land in Sprint 5.
      </p>
    </main>
  );
}
