import Link from "next/link";

import { Panel } from "@/components/app/kaido-ui";
import { cn } from "@/lib/utils";

export function NetworkBadge({ network }: { network: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-300/85">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
      </span>
      {network}
    </span>
  );
}

export function MetricChip({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-[4.5rem] rounded-xl border border-white/[0.06] bg-[#141416]/50 px-3 py-2 text-center",
        className,
      )}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold leading-snug tabular-nums",
          accent ? "text-[#d8c69a]" : "text-[#f3efe6]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function DashboardPageHeader({
  title,
  description,
  network,
  badge,
  trailing,
  footer,
  back,
  titleClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  network?: string;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  footer?: React.ReactNode;
  back?: { href: string; label: string };
  titleClassName?: string;
}) {
  return (
    <Panel className="overflow-hidden p-0">
      {back && (
        <div className="border-b border-white/[0.06] px-4 py-2.5 sm:px-5">
          <Link
            href={back.href}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/40 transition-colors hover:text-[#f3efe6]"
          >
            {back.label}
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              className={cn(
                "text-[1.35rem] font-semibold tracking-tight text-[#f3efe6] sm:text-2xl",
                titleClassName,
              )}
            >
              {title}
            </h1>
            {network && <NetworkBadge network={network} />}
            {badge}
          </div>
          {description && <p className="max-w-2xl text-sm text-white/45">{description}</p>}
        </div>
        {trailing && <div className="flex shrink-0 flex-wrap items-center gap-2">{trailing}</div>}
      </div>
      {footer && <div className="border-t border-white/[0.06] px-4 py-3 sm:px-5">{footer}</div>}
    </Panel>
  );
}
