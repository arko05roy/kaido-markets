import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata: Metadata = {
  title: "Whitepaper · Kaido",
  description:
    "Kaido v0.1 working draft. Distribution markets on Stellar — mechanism, architecture, oracle tiering, economics, roadmap.",
};

async function loadWhitepaper(): Promise<string> {
  const filePath = path.join(process.cwd(), "..", "kaido-whitepaper.md");
  return fs.readFile(filePath, "utf8");
}

/* ─── content helpers ─────────────────────────────────────────── */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function flattenChildren(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenChildren).join("");
  if (node && typeof node === "object" && "props" in node) {
    return flattenChildren(
      (node as { props: { children?: React.ReactNode } }).props.children,
    );
  }
  return "";
}

/* ─── markdown components ─────────────────────────────────────── */

const mdComponents: Components = {
  h1: ({ children }) => {
    const text = flattenChildren(children);
    return (
      <h1
        id={slugify(text)}
        className="mt-24 scroll-mt-32 font-serif text-[2.5rem] leading-[1] tracking-[-0.025em] text-[#f3efe6] first:mt-0 sm:text-[3.5rem] lg:text-[4.5rem]"
      >
        {children}
      </h1>
    );
  },
  h2: ({ children }) => {
    const text = flattenChildren(children);
    return (
      <h2
        id={slugify(text)}
        className="mt-20 scroll-mt-32 font-serif text-[2rem] leading-[1.05] tracking-[-0.02em] text-[#f3efe6] sm:text-[2.75rem]"
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }) => {
    const text = flattenChildren(children);
    return (
      <h3
        id={slugify(text)}
        className="mt-14 scroll-mt-32 font-serif text-[1.5rem] font-medium leading-[1.15] tracking-[-0.015em] text-[#f3efe6] sm:text-[1.875rem]"
      >
        {children}
      </h3>
    );
  },
  h4: ({ children }) => (
    <h4 className="mt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-[#d8c69a]">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mt-6 text-[16px] leading-[1.75] text-white/70 sm:text-[17px]">{children}</p>
  ),
  a: ({ children, href }) => (
    <Link
      href={href || "#"}
      className="border-b border-[#d8c69a]/40 text-[#f3efe6] transition-colors hover:border-[#d8c69a] hover:text-white"
    >
      {children}
    </Link>
  ),
  strong: ({ children }) => <strong className="font-medium text-[#f3efe6]">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/85">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="mt-8 border-l-2 border-[#d8c69a] bg-[#d8c69a]/[0.04] px-6 py-4 font-serif text-[18px] italic leading-[1.55] text-[#f3efe6]">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="mt-6 space-y-3 text-[16px] leading-[1.7] text-white/70 sm:text-[17px]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-6 list-decimal space-y-3 pl-6 text-[16px] leading-[1.7] text-white/70 marker:text-[#d8c69a] marker:font-mono marker:text-[12px] sm:text-[17px]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-2">{children}</li>,
  code: ({ children, className }) => {
    // inline vs fenced
    const isInline = !className;
    if (isInline) {
      return (
        <code className="rounded-sm bg-white/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-[#d8c69a]">
          {children}
        </code>
      );
    }
    return (
      <code className="block font-mono text-[13px] leading-[1.7] text-white/85">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="mt-6 overflow-x-auto border border-white/10 bg-[#08080a] p-6 font-mono text-[13px] leading-[1.7] text-white/85">
      {children}
    </pre>
  ),
  hr: () => <hr className="mt-16 border-t border-white/10" />,
  table: ({ children }) => (
    <div className="mt-8 overflow-x-auto border border-white/10">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-white/10 bg-[#08080a]">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-white/5">{children}</tbody>,
  tr: ({ children }) => <tr className="transition-colors hover:bg-white/[0.02]">{children}</tr>,
  th: ({ children }) => (
    <th className="px-5 py-4 align-top font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-5 py-4 align-top text-[14.5px] leading-[1.55] text-white/70">{children}</td>
  ),
};

/* ─── extract TOC from markdown ───────────────────────────────── */

type TocEntry = { level: 1 | 2; text: string; slug: string };

function extractToc(md: string): TocEntry[] {
  const toc: TocEntry[] = [];
  const lines = md.split("\n");
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h1) toc.push({ level: 1, text: h1[1], slug: slugify(h1[1]) });
    else if (h2) toc.push({ level: 2, text: h2[1], slug: slugify(h2[1]) });
  }
  return toc;
}

/* ─── page ────────────────────────────────────────────────────── */

export default async function WhitepaperPage() {
  const raw = await loadWhitepaper();

  // Split front matter (the title + tagline + draft note above the first ---)
  // and the body. We render the front matter custom for the editorial cover.
  const firstSep = raw.indexOf("\n---\n");
  const front = firstSep > -1 ? raw.slice(0, firstSep) : "";
  const body = firstSep > -1 ? raw.slice(firstSep + 5) : raw;

  const titleMatch = front.match(/^#\s+(.+?)\s*$/m);
  const taglineMatch = front.match(/^###\s+\*?(.+?)\*?\s*$/m);
  const versionMatch = front.match(/\*\*Whitepaper\s+(.+?)\*\*/);

  const title = titleMatch?.[1] ?? "Kaido Whitepaper";
  const tagline =
    taglineMatch?.[1]?.replace(/^\*|\*$/g, "") ??
    "A distribution-market primitive for Stellar.";
  const version = versionMatch?.[1] ?? "v0.1 — Working Draft";

  const toc = extractToc(body);

  return (
    <div className="kaido-landing relative min-h-screen w-full bg-[#0b0b0c] text-[#ece9e2]">
      {/* COVER */}
      <section className="relative overflow-hidden border-b border-white/10 px-6 py-24 sm:px-10 lg:py-36">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.12),transparent_60%)]" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.06),transparent_60%)]" />

        <div className="relative mx-auto max-w-[1400px]">
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#d8c69a]">
            <span className="inline-block h-px w-8 bg-[#d8c69a]" />
            The whitepaper
            <span className="text-white/30">·</span>
            <span className="text-white/45">{version}</span>
          </div>

          <h1 className="mt-10 font-serif text-[2.5rem] leading-[0.95] tracking-[-0.035em] text-[#f3efe6] sm:text-[4.5rem] lg:text-[6.5rem]">
            {title}
          </h1>

          <p className="mt-10 max-w-[60ch] font-serif text-[20px] italic leading-[1.35] text-white/70 sm:text-[26px]">
            {tagline}
          </p>

          <dl className="mt-14 grid max-w-[800px] grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-6 font-mono text-[10px] uppercase tracking-[0.22em]">
            <div className="pr-6">
              <dt className="text-white/35">Author</dt>
              <dd className="mt-1.5 font-serif text-base normal-case tracking-normal text-[#f3efe6]">
                Kaido Labs
              </dd>
            </div>
            <div className="px-6">
              <dt className="text-white/35">Sections</dt>
              <dd className="mt-1.5 font-serif text-base normal-case tracking-normal text-[#f3efe6]">
                {toc.filter((e) => e.level === 1).length} parts
              </dd>
            </div>
            <div className="pl-6">
              <dt className="text-white/35">Read time</dt>
              <dd className="mt-1.5 font-serif text-base normal-case tracking-normal text-[#d8c69a]">
                ~40 min
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* TOC + BODY */}
      <div className="relative mx-auto max-w-[1400px] px-6 py-20 sm:px-10 lg:py-28">
        <div className="grid grid-cols-12 gap-x-10 gap-y-12">
          {/* TOC — sticky on desktop */}
          <aside className="col-span-12 lg:sticky lg:top-24 lg:col-span-3 lg:self-start">
            <div className="border border-white/10 bg-[#0a0a0b] p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#d8c69a]">
                Contents
              </div>
              <ol className="mt-5 space-y-2.5 font-mono text-[11px] uppercase tracking-[0.18em]">
                {toc.map((entry) => (
                  <li
                    key={entry.slug}
                    className={entry.level === 2 ? "pl-4 text-white/45" : "text-white/75"}
                  >
                    <a
                      href={`#${entry.slug}`}
                      className="transition-colors hover:text-[#d8c69a]"
                    >
                      {entry.text}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          {/* BODY */}
          <article className="col-span-12 lg:col-span-9 lg:max-w-[68ch]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {body}
            </ReactMarkdown>

            {/* end-of-paper card */}
            <div className="mt-20 border-t border-white/10 pt-10">
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#d8c69a]">
                End of paper
              </div>
              <p className="mt-4 max-w-[58ch] font-serif text-[22px] leading-[1.3] tracking-[-0.01em] text-[#f3efe6]">
                Built one curve at a time on Stellar.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-6">
                <Link
                  href="/markets"
                  className="group inline-flex items-center gap-3 rounded-full bg-[#f3efe6] px-7 py-4 text-[12px] font-medium uppercase tracking-[0.2em] text-[#0b0b0c] transition-all hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c]"
                >
                  Enter markets
                  <span className="inline-block transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </Link>
                <Link
                  href="/"
                  className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/55 transition-colors hover:text-white"
                >
                  Back to home ↑
                </Link>
              </div>
            </div>
          </article>
        </div>
      </div>

      <footer className="border-t border-white/10 px-6 py-10 sm:px-10">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
          <div className="flex items-center gap-3">
            <span className="font-serif text-base italic text-white/85">Kaido</span>
            <span className="text-white/25">街道</span>
          </div>
          <div>{version}</div>
        </div>
      </footer>
    </div>
  );
}
