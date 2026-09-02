import { MetricChip, NetworkBadge } from "@/components/app/dashboard-page-header";
import { PageEyebrow } from "@/components/app/kaido-ui";

export function CreateMarketHeader({ network }: { network: string }) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c1c21] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.1),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.05),transparent_65%)]" />

      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0 space-y-3">
          <PageEyebrow>Launch pad</PageEyebrow>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.05] tracking-[-0.03em] text-[#f3efe6]">
              Create market
            </h1>
            <NetworkBadge network={network} />
          </div>
          <p className="max-w-[52ch] text-sm leading-relaxed text-white/45">
            Set the question, seed the crowd curve, and choose when trading opens and settles.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <MetricChip label="Flow" value="5 steps" />
        </div>
      </div>
    </header>
  );
}
