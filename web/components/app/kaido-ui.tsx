import Link from "next/link";

/** Shared shell for in-app pages — matches the landing ink + paper palette. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="kaido-app relative min-h-[100dvh] w-full bg-[#0b0b0c] text-[#ece9e2]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(216,198,154,0.06),transparent_70%)]" />
      <div className="relative mx-auto w-full max-w-[1400px] px-6 pb-20 pt-28 sm:px-10">{children}</div>
    </div>
  );
}

export function PageEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#d8c69a]">
      <span className="inline-block h-px w-8 bg-[#d8c69a]" />
      {children}
    </p>
  );
}

export function PageTitle({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <header className="space-y-4">
      <h1 className="font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95] tracking-[-0.03em] text-[#f3efe6]">
        {title}
      </h1>
      {subtitle && (
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-white/55 sm:text-base">{subtitle}</p>
      )}
    </header>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-white/10 bg-[#0a0a0b] ${className}`}>{children}</div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]">{children}</div>
  );
}

export function StatusPill({ label }: { label: string }) {
  const tone =
    label === "Open"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : label === "Locked"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : label === "Disputable"
          ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
          : label === "Resolved"
            ? "border-white/15 bg-white/5 text-white/55"
            : "border-white/10 bg-white/5 text-white/45";
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${tone}`}>
      {label === "Open" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
      )}
      {label}
    </span>
  );
}

export function TierBadge({ label }: { label: string }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</span>
  );
}

/** Decorative mini bell curve — the signature motif on market cards. */
export function CurveSpark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 48"
      className={`block h-12 w-28 shrink-0 opacity-70 transition-opacity group-hover:opacity-100 ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#d8c69a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#d8c69a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M 4 42 C 28 42 44 8 60 8 C 76 8 92 42 116 42"
        fill="none"
        stroke="#d8c69a"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M 4 42 C 28 42 44 8 60 8 C 76 8 92 42 116 42 L 116 42 L 4 42 Z" fill="url(#sparkFill)" />
      <line x1="60" y1="8" x2="60" y2="42" stroke="rgba(216,198,154,0.35)" strokeDasharray="2 3" />
    </svg>
  );
}

export function PrimaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-3 rounded-full bg-[#f3efe6] px-7 py-3.5 text-[12px] font-medium uppercase tracking-[0.18em] text-[#0b0b0c] transition-all hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c]"
    >
      {children}
      <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
    </Link>
  );
}

export function GhostLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/55 transition-colors hover:text-[#f3efe6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c]"
    >
      {children}
      <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
    </Link>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Panel className="flex flex-col items-center gap-4 border-dashed px-8 py-16 text-center">
      <p className="font-serif text-2xl text-[#f3efe6]">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-white/50">{body}</p>
      {action}
    </Panel>
  );
}

export function ErrorState({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <Panel className="border-dashed px-8 py-10">
      <p className="font-medium text-[#f3efe6]">{title}</p>
      <p className="mt-2 text-sm text-white/50">{body}</p>
    </Panel>
  );
}
