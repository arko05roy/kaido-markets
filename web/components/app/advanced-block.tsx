/** Collapsible block for power-user / on-chain details. Client-safe for use in market actions. */
export function AdvancedBlock({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c1c21] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
      open={defaultOpen ? true : undefined}
    >
      <summary className="cursor-pointer list-none px-5 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white/60 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="text-white/25 transition-transform group-open:rotate-90">›</span>
          {title}
        </span>
      </summary>
      <div className="border-t border-white/[0.06] px-5 py-5">{children}</div>
    </details>
  );
}
