// Single market page — live params + belief + status, read on-chain.
// Next 16: `params` is a Promise. The distribution-mode forecast canvas + LP
// panel land in Sprint 5 (build.md E11); this is the read-only view it builds on.
import Link from "next/link";

import {
  WAD,
  formatWad,
  getMarketInfo,
  getMarketState,
  statusLabel,
  tierLabel,
  type MarketInfo,
  type MarketParams,
  type MarketState,
} from "@/lib/stellar/kaido";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

function fmtTime(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toUTCString();
}

export default async function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let data:
    | { info: MarketInfo; params: MarketParams; state: MarketState }
    | null = null;
  let error: string | null = null;
  try {
    const [info, { params: mp, state }] = await Promise.all([
      getMarketInfo(id),
      getMarketState(id),
    ]);
    data = { info, params: mp, state };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6 sm:p-10">
      <div>
        <Link
          href="/markets"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Markets
        </Link>
      </div>

      {error || !data ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Market</h1>
          <p className="font-mono text-sm text-muted-foreground">{id}</p>
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Couldn’t read this market.</p>
            <p className="mt-1">{error ?? "Unknown error."}</p>
          </div>
        </>
      ) : (
        <>
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {data.params.outcome_space.tag === "Trajectory"
                  ? "Trajectory market"
                  : "Scalar market"}
              </h1>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {statusLabel(data.state.status)}
              </span>
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-medium"
                title="Resolver trust tier — rendered from on-chain state (ADR-5)"
              >
                {tierLabel(data.params.tier)}
              </span>
            </div>
            <p className="font-mono text-xs text-muted-foreground">{id}</p>
          </header>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Belief (consensus)</h2>
            <dl className="rounded-lg border bg-card px-4">
              <Field label="μ (center)" value={formatWad(data.state.belief.mu)} />
              <Field label="σ (width)" value={formatWad(data.state.belief.sigma)} />
              <Field
                label="σ floor"
                value={formatWad(data.state.sigma_min)}
              />
              {data.state.status.tag === "Resolved" && (
                <Field
                  label="Outcome x₀"
                  value={formatWad(data.state.status.values[0])}
                />
              )}
            </dl>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Parameters</h2>
            <dl className="rounded-lg border bg-card px-4">
              <Field
                label="k (liquidity)"
                value={`${Number(data.params.k) / Number(WAD)}`}
              />
              <Field
                label="b (collateral / outcome)"
                value={formatWad(data.params.b)}
              />
              <Field label="Fee" value={`${data.params.fee_bps / 100}%`} />
              <Field
                label="Capped Gaussian"
                value={data.params.capped ? "yes" : "no"}
              />
              <Field
                label="Resolver"
                value={
                  <span className="font-mono text-xs">
                    {data.params.resolver.slice(0, 6)}…
                    {data.params.resolver.slice(-6)}
                  </span>
                }
              />
            </dl>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Window (UTC)</h2>
            <dl className="rounded-lg border bg-card px-4">
              <Field label="Opens" value={fmtTime(data.params.window.open)} />
              <Field label="Locks" value={fmtTime(data.params.window.lock)} />
              <Field
                label="Resolves"
                value={fmtTime(data.params.window.resolve)}
              />
            </dl>
          </section>

          <p className="text-xs text-muted-foreground">
            Trading, the forecast canvas and the LP panel land in Sprint 5
            (build.md E8/E11).
          </p>
        </>
      )}
    </main>
  );
}
