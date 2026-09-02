"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

const VIDEO_SRC =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/alt-g7Cv2QzqL3k6ey3igjNYkM32d8Fld7.mp4";

export function Hero({ network }: { network: string }) {
  return (
    <div className="kaido-landing relative w-full bg-[#0b0b0c] text-[#ece9e2]">
      <HeroFold />
      <ThesisSection />
      <BeliefSection />
      <BuildersSection />
      <PaperCTA />
      <LandingFooter network={network} />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* shared bits                                                       */
/* ---------------------------------------------------------------- */

const reveal = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 0.61, 0.36, 1] as [number, number, number, number] },
  },
};

function SectionLabel({ num, title }: { num: string; title: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#d8c69a]">{num}</div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
        {title}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* HERO FOLD                                                         */
/* ---------------------------------------------------------------- */

function HeroFold() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onReady = () => setVideoLoaded(true);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.load();
    if (video.readyState >= 2) setVideoLoaded(true);
    return () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && videoLoaded) {
      videoRef.current.play().catch(() => {});
    }
  }, [videoLoaded]);

  return (
    <section className="relative w-full px-[min(2vw,1.5rem)] pt-[min(2vw,1.5rem)] pb-[min(2vw,1.5rem)]">
      <div className="relative h-[calc(100dvh-2*min(2vw,1.5rem))] min-h-[620px] w-full overflow-hidden rounded-[42px] md:rounded-[72px]">
        <Image
          src="/hero-placeholder.png"
          alt=""
          fill
          priority
          sizes="100vw"
          quality={100}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            videoLoaded ? "opacity-0" : "opacity-100"
          }`}
        />
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          muted
          playsInline
          loop
          preload="auto"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            videoLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0b0c]/65 via-[#0b0b0c]/10 to-[#0b0b0c]/85" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:3px_3px]" />

        <div className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-6 pb-20 pt-28 sm:px-10 lg:pb-24">
          <p
            className="kaido-fade mb-6 font-mono text-[11px] uppercase tracking-[0.28em] text-[#d8c69a]"
            style={{ animationDelay: "200ms" }}
          >
            <span className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-[#d8c69a] align-middle" />
            Distribution markets · on Stellar
          </p>

          <h1
            className="kaido-fade font-serif text-[18vw] leading-[0.86] italic tracking-[-0.02em] text-[#f3efe6] sm:text-[14vw] lg:text-[11rem]"
            style={{ animationDelay: "300ms" }}
          >
            Kaido
            <span className="ml-3 align-top font-sans not-italic text-[0.18em] tracking-[0.3em] text-[#d8c69a]/70">
              街道
            </span>
          </h1>

          <p
            className="kaido-fade mt-6 max-w-2xl font-serif text-3xl italic leading-[1.1] text-white sm:text-4xl lg:text-5xl"
            style={{ animationDelay: "420ms" }}
          >
            Bet the curve. <span className="text-white/50">Not the coin.</span>
          </p>

          <div
            className="kaido-fade mt-10 flex flex-wrap items-center gap-x-6 gap-y-4"
            style={{ animationDelay: "560ms" }}
          >
            <Link
              href="/whitepaper"
              className="group inline-flex items-center gap-3 rounded-full bg-[#f3efe6] px-7 py-4 text-[13px] font-medium uppercase tracking-[0.18em] text-[#0b0b0c] transition-all hover:bg-white"
            >
              Read whitepaper
              <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 overflow-hidden border-t border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="kaido-marquee flex whitespace-nowrap py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-white/55">
            {Array.from({ length: 2 }).flatMap((_, dup) =>
              [
                "BTC/USD · 68,420",
                "ETH/USD · 3,712",
                "XLM/USD · 0.124",
                "ELECTION MARGIN · +3.2",
                "10Y YIELD · 4.21%",
                "MAY CPI · 0.21",
                "WTI · 78.14",
                "GOLD · 2,348",
              ].map((t, i) => (
                <span key={`${dup}-${i}`} className="mx-10 flex items-center gap-3">
                  <span className="h-1 w-1 rounded-full bg-[#d8c69a]" /> {t}
                </span>
              )),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* § 01 — THESIS — yes/no vs the curve                               */
/* ---------------------------------------------------------------- */

function ThesisSection() {
  return (
    <section className="relative border-t border-white/10 px-6 py-32 sm:px-10 lg:py-48">
      <div className="mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2 className="font-serif text-[3.25rem] leading-[0.9] tracking-[-0.035em] text-[#f3efe6] sm:text-[6rem] lg:text-[11rem]">
            Belief was never binary.
          </h2>
        </motion.div>

        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-20"
        >
          <DistributionDemo />
        </motion.div>
      </div>
    </section>
  );
}

function DistributionDemo() {
  // shared price axis: $60k → $80k, threshold at $70k (left 2/3 of canvas)
  // bell μ=68.2k σ=1.4k. Above $70k area ≈ 8%, below ≈ 92% under this curve.
  // We use 38/62 as the *market's* current binary odds (independent quote) to
  // show the dramatic resolution gap — the binary view is structurally lossy
  // regardless of the underlying belief.
  return (
    <div className="relative overflow-hidden border border-white/10 bg-[#0a0a0b]">
      {/* very subtle accent — research-doc neutral */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.05),transparent_70%)]" />

      {/* top bar — market metadata + the question */}
      <div className="relative border-b border-white/10 px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.22em]">
          <span className="flex items-center gap-2 text-[#d8c69a]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d8c69a] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#d8c69a]" />
            </span>
            live
          </span>
          <span className="text-white/40">BTC · 24h close</span>
          <span className="hidden text-white/25 sm:inline">·</span>
          <span className="hidden text-white/40 sm:inline">range $60k–$80k</span>
          <span className="ml-auto text-white/35">market · GC4F…Z2QA</span>
        </div>
        <h3 className="mt-4 font-serif text-2xl leading-[1.1] tracking-[-0.01em] text-[#f3efe6] sm:text-[28px] lg:text-[32px]">
          Where does BTC close on Friday?
        </h3>
      </div>

      <div className="relative grid grid-cols-12">
        {/* THE CURVE — Kaido */}
        <div className="relative col-span-12 flex flex-col border-b border-white/10 lg:col-span-8 lg:border-b-0 lg:border-r">
          <div className="flex items-baseline justify-between px-6 pt-6 sm:px-8">
            <div className="flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-[0.22em]">
              <span className="text-[#d8c69a]">Kaido</span>
              <span className="text-white/30">·</span>
              <span className="text-white/55">continuous</span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">
              μ 68.2k · σ 1.4k
            </span>
          </div>

          <BellCurveChart />

          {/* position readout — feels like a real trade */}
          <div className="mt-auto grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 font-mono text-[10px] uppercase tracking-[0.22em]">
            <div className="px-6 py-4 sm:px-8">
              <div className="text-white/35">Cost to open</div>
              <div className="mt-1.5 font-serif text-lg normal-case tracking-normal text-[#f3efe6]">
                12.40 <span className="text-white/40">XLM</span>
              </div>
            </div>
            <div className="px-6 py-4 sm:px-8">
              <div className="text-white/35">Max payout</div>
              <div className="mt-1.5 font-serif text-lg normal-case tracking-normal text-[#f3efe6]">
                180 <span className="text-white/40">XLM</span>
              </div>
            </div>
            <div className="px-6 py-4 sm:px-8">
              <div className="text-white/35">Resolution</div>
              <div className="mt-1.5 font-serif text-lg normal-case tracking-normal text-[#d8c69a]">
                continuous
              </div>
            </div>
          </div>
        </div>

        {/* THE BINARY — old way (now a punchline panel) */}
        <div className="relative col-span-12 bg-[#08080a] lg:col-span-4">
          <BinaryBars />
        </div>
      </div>

      {/* footer — forward action */}
      <div className="relative flex flex-wrap items-center justify-between gap-4 border-t border-white/10 px-6 py-5 sm:px-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
          Same question · two resolutions · one is structurally lossy
        </span>
        <Link
          href="/markets"
          className="group inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[#f3efe6] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b]"
        >
          Open this market on testnet
          <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
        </Link>
      </div>
    </div>
  );
}

function BellCurveChart() {
  // viewBox 800 x 360; baseline y=290; peak y=70
  // price axis $60k → $80k mapped to x: 40 → 760 (720px wide)
  //   $60k→40, $64k→184, $68k→328, $70k→400, $72k→472, $76k→616, $80k→760
  // μ=68.2k → x≈335. σ=1.4k → 50.4px
  const xMu = 335;
  const xThreshold = 400; // $70k
  const sigmaPx = 50.4;
  // bell path approximation
  const bellD = `M 40 290 C 160 290 260 70 ${xMu} 70 C 410 70 520 290 760 290`;
  const bellFillD = `${bellD} L 760 290 L 40 290 Z`;

  return (
    <div className="relative mt-8 px-6 pb-6 sm:px-8">
      <svg
        viewBox="0 0 800 360"
        className="block h-auto w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Bell curve over BTC closing price, peaking at $68.2k with σ $1.4k"
      >
        <defs>
          <linearGradient id="bellFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#d8c69a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#d8c69a" stopOpacity="0" />
          </linearGradient>
          <filter id="bellStroke" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* grid */}
        {[110, 170, 230].map((y) => (
          <line key={y} x1="40" x2="760" y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />
        ))}

        {/* σ-band (μ ± σ) */}
        <motion.rect
          x={xMu - sigmaPx}
          y="70"
          width={sigmaPx * 2}
          height="220"
          fill="rgba(216,198,154,0.07)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 1.4 }}
        />

        {/* baseline axis */}
        <line x1="40" y1="290" x2="760" y2="290" stroke="rgba(255,255,255,0.22)" />

        {/* tickmarks + labels */}
        {[
          [60, "$60k"],
          [64, "$64k"],
          [68, "$68k"],
          [72, "$72k"],
          [76, "$76k"],
          [80, "$80k"],
        ].map(([v, label]) => {
          const x = 40 + (((v as number) - 60) / 20) * 720;
          return (
            <g key={label as string}>
              <line x1={x} y1="290" x2={x} y2="296" stroke="rgba(255,255,255,0.3)" />
              <text
                x={x}
                y="316"
                textAnchor="middle"
                fontSize="10"
                fontFamily="var(--font-jetbrains-mono), monospace"
                letterSpacing="1.5"
                fill="rgba(255,255,255,0.42)"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* curve fill */}
        <motion.path
          d={bellFillD}
          fill="url(#bellFill)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.5 }}
        />
        {/* curve stroke */}
        <motion.path
          d={bellD}
          fill="none"
          stroke="#d8c69a"
          strokeWidth="2"
          strokeLinecap="round"
          filter="url(#bellStroke)"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: "easeOut", delay: 0.3 }}
        />

        {/* μ marker */}
        <motion.line
          x1={xMu}
          y1="70"
          x2={xMu}
          y2="290"
          stroke="rgba(216,198,154,0.55)"
          strokeDasharray="2 4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.6 }}
        />
        <motion.circle
          cx={xMu}
          cy="70"
          r="5"
          fill="#d8c69a"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.8, type: "spring", stiffness: 300, damping: 18 }}
        />
        <motion.text
          x={xMu}
          y="52"
          textAnchor="middle"
          fontSize="10"
          fontFamily="var(--font-jetbrains-mono), monospace"
          letterSpacing="2"
          fill="#d8c69a"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 2 }}
        >
          μ · 68.2k
        </motion.text>

        {/* threshold cut — the dotted line where a binary market would slice */}
        <motion.line
          x1={xThreshold}
          y1="20"
          x2={xThreshold}
          y2="290"
          stroke="rgba(255,255,255,0.35)"
          strokeDasharray="3 5"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 2.2, duration: 0.4 }}
        />
        <motion.text
          x={xThreshold + 8}
          y="34"
          fontSize="10"
          fontFamily="var(--font-jetbrains-mono), monospace"
          letterSpacing="2"
          fill="rgba(255,255,255,0.5)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 2.3 }}
        >
          binary cuts here →
        </motion.text>
      </svg>

      {/* readout chip */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 2.4, duration: 0.5 }}
        className="absolute right-8 top-8 hidden border border-[#d8c69a]/40 bg-[#0b0b0c]/85 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] backdrop-blur sm:block"
      >
        <div className="text-[#d8c69a]">Your forecast</div>
        <div className="mt-1 text-white/55">μ 68.2k · σ 1.4k</div>
      </motion.div>
    </div>
  );
}

function BinaryBars() {
  return (
    <div className="relative flex h-full flex-col px-6 pb-10 pt-10 sm:px-8 lg:pt-12">
      {/* PUNCHLINE — dominates the panel */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
        className="relative z-10"
      >
        <p className="font-serif text-[36px] font-bold leading-[1] tracking-[-0.025em] text-[#f3efe6] sm:text-[44px] lg:text-[48px]">
          Kaido is built for the{" "}
          <span className="text-[#d8c69a]">interesting questions.</span>
        </p>

        <div className="mt-10 flex flex-col items-center text-center">
          <p className="font-serif text-[18px] leading-[1.25] tracking-[-0.01em] text-white/55 sm:text-[20px]">
            For questions that aren&apos;t just a
          </p>
          <p
            className="relative mt-4 font-serif text-[52px] font-black leading-[0.95] tracking-[0.02em] text-[#f3efe6] sm:text-[68px] lg:text-[76px]"
            style={{
              textShadow:
                "0 0 24px rgba(216,198,154,0.55), 0 0 52px rgba(216,198,154,0.28), 0 0 120px rgba(216,198,154,0.14)",
            }}
          >
            <span className="relative inline-block">
              YES <span className="text-white/35">OR</span> NO
              <span
                aria-hidden
                className="pointer-events-none absolute left-[-4%] right-[-4%] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[#d8c69a]/70 to-transparent"
              />
            </span>
            <span className="text-[#d8c69a]">.</span>
          </p>
        </div>
      </motion.div>

      {/* BINARY — receding into the background, blurred + fading to nothing */}
      <div
        aria-hidden
        className="pointer-events-none relative mt-10 select-none opacity-55 blur-[2px] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.35)_55%,transparent_100%)]"
      >
        <div className="mb-6 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">
            Settles · BTC ≥ $70k
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/25">
            Polymarket-style
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center justify-center border border-white/12 bg-white/[0.02] px-3 py-5">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/50">
              Yes
            </span>
            <span className="mt-2 font-serif text-3xl tracking-[-0.01em] text-white/85">38¢</span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">
              above $70k
            </span>
          </div>
          <div className="flex flex-col items-center justify-center border border-white/12 bg-white/[0.02] px-3 py-5">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/50">
              No
            </span>
            <span className="mt-2 font-serif text-3xl tracking-[-0.01em] text-white/85">62¢</span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">
              at or below
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}


/* ---------------------------------------------------------------- */
/* § 02 — WHAT A BET LOOKS LIKE — lifecycle of one position          */
/* ---------------------------------------------------------------- */

function BeliefSection() {
  return (
    <section className="relative overflow-hidden border-t border-white/10 px-6 py-28 sm:px-10 lg:py-40">
      <div className="pointer-events-none absolute -right-40 top-1/4 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.05),transparent_70%)]" />

      <div className="relative mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2
            className="w-full font-serif leading-[0.92] tracking-[-0.045em] text-[#f3efe6]"
            style={{ fontSize: "clamp(2.5rem, 9vw, 12rem)" }}
          >
            <span className="block whitespace-nowrap">Your belief on a curve.</span>
            <span className="block whitespace-nowrap text-white/40">your capital more efficient.</span>
          </h2>
        </motion.div>

        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-20"
        >
          <BetLifecycle />
        </motion.div>
      </div>
    </section>
  );
}

function BetLifecycle() {
  const cards = [
    {
      title: "Markets for numbers.",
      label: "Outcome space",
      body: "Any question that resolves to a number can be a market — a closing price, a vote margin, a CPI print, a box-office gross. Pick the range, pick the oracle, ship it.",
    },
    {
      title: "Position is a shape.",
      label: "Forecast",
      body: "You set where you think the number lands and how confident you are. The AMM prices your whole curve against the crowd — one position, one trade, one click.",
    },
    {
      title: "Closer pays more.",
      label: "Settlement",
      body: "When the truth arrives, your payout scales with how close your curve peaks to the realized number. Nail it tight and win big. Spread wider and play it safer.",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-px bg-white/10 lg:grid-cols-3">
      {cards.map((c, i) => (
        <motion.article
          key={c.title}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: i * 0.12, ease: [0.22, 0.61, 0.36, 1] }}
          className="group flex min-h-[420px] flex-col justify-between bg-[#0a0a0b] p-10 transition-colors hover:bg-[#0e0e10] lg:min-h-[520px] lg:p-12"
        >
          <h3 className="font-serif text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-[#f3efe6] sm:text-[40px] lg:text-[44px]">
            {c.title}
          </h3>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]">
              {c.label}
            </div>
            <p className="mt-4 max-w-[36ch] text-[15px] leading-[1.6] text-white/60">{c.body}</p>
          </div>
        </motion.article>
      ))}
    </div>
  );
}


function BuildersSection() {
  return (
    <section className="relative overflow-hidden border-t border-white/10 px-6 py-28 sm:px-10 lg:py-44">
      <div className="pointer-events-none absolute -left-40 bottom-1/4 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.05),transparent_70%)]" />

      <div className="relative mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2
            className="w-full whitespace-nowrap font-serif leading-[0.92] tracking-[-0.045em] text-[#f3efe6]"
            style={{ fontSize: "clamp(2.5rem, 11.2vw, 16rem)" }}
          >
            Any market. <span className="text-white/40">One call.</span>
          </h2>
        </motion.div>

        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-20 grid grid-cols-12 gap-px bg-white/10"
        >
          <div className="col-span-12 bg-[#0a0a0b] lg:col-span-7">
            <CodeBlock />
          </div>

          <div className="col-span-12 flex flex-col gap-px bg-white/10 lg:col-span-5">
            <SDKRow
              label="Question"
              body="Any prompt with a numeric answer — a price, a margin, a count, a score."
            />
            <SDKRow
              label="Outcome"
              body="A scalar range, or trajectory checkpoints. You define the space; the AMM handles the rest."
            />
            <SDKRow
              label="Resolver"
              body="Reflector feeds out of the box. Or plug your own — attested, optimistic, or designated."
            />
            <SDKRow
              label="Lifecycle"
              body="Open · lock · resolve. Soroban handles settlement. House vault seeds initial liquidity."
            />
          </div>
        </motion.div>

        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-10 flex flex-wrap items-center justify-between gap-6 border-t border-white/10 pt-8"
        >
          <div className="flex items-center gap-3 border border-white/12 bg-[#0a0a0b] px-5 py-3 font-mono text-[12px] tracking-[0.04em] text-white/80">
            <span className="text-[#d8c69a]">$</span>
            <span className="text-white/55">npm i</span>
            <span>@kaido/sdk</span>
            <span className="ml-2 hidden border-l border-white/10 pl-3 text-[10px] uppercase tracking-[0.22em] text-white/35 sm:inline">
              v0.1 · testnet
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 font-mono text-[11px] uppercase tracking-[0.22em]">
            <Link
              href="/docs"
              className="group inline-flex items-center gap-2 text-[#f3efe6] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c]"
            >
              Read the docs
              <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              href="https://github.com/kaido"
              className="text-white/45 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c]"
            >
              GitHub
            </Link>
            <Link
              href="/whitepaper"
              className="text-white/45 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c]"
            >
              Whitepaper
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SDKRow({ label, body }: { label: string; body: string }) {
  return (
    <div className="group flex flex-col gap-3 bg-[#0a0a0b] p-7 transition-colors hover:bg-[#0e0e10] lg:flex-row lg:items-baseline lg:gap-8 lg:p-8">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a] lg:w-28">
        {label}
      </div>
      <p className="flex-1 text-[15px] leading-[1.55] text-white/65">{body}</p>
    </div>
  );
}

function CodeBlock() {
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.22em]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-[#d8c69a]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d8c69a]" />
            @kaido/sdk
          </span>
          <span className="text-white/30">·</span>
          <span className="text-white/45">typescript</span>
        </div>
        <span className="text-white/35">create.ts</span>
      </div>

      <pre className="flex-1 overflow-x-auto p-6 font-mono text-[13px] leading-[1.75] text-white/85 sm:p-7 sm:text-[13.5px]">
        <code>
          <CodeLine>
            <CodeKw>import</CodeKw> <CodeText>{"{"} kaido {"}"}</CodeText>{" "}
            <CodeKw>from</CodeKw> <CodeStr>{`"@kaido/sdk"`}</CodeStr>
            <CodeText>;</CodeText>
          </CodeLine>
          <CodeLine />
          <CodeLine>
            <CodeKw>const</CodeKw> <CodeText>market</CodeText> <CodeOp>=</CodeOp>{" "}
            <CodeKw>await</CodeKw> <CodeFn>kaido.createMarket</CodeFn>
            <CodeText>{"({"}</CodeText>
          </CodeLine>
          <CodeLine indent={2}>
            <CodeKey>question</CodeKey>
            <CodeText>: </CodeText>
            <CodeStr>{`"Where does BTC close on Friday?"`}</CodeStr>
            <CodeText>,</CodeText>
          </CodeLine>
          <CodeLine indent={2}>
            <CodeKey>outcome</CodeKey>
            <CodeText>: {"{"} </CodeText>
            <CodeKey>type</CodeKey>
            <CodeText>: </CodeText>
            <CodeStr>{`"scalar"`}</CodeStr>
            <CodeText>, </CodeText>
            <CodeKey>range</CodeKey>
            <CodeText>: [</CodeText>
            <CodeNum>60_000</CodeNum>
            <CodeText>, </CodeText>
            <CodeNum>80_000</CodeNum>
            <CodeText>] {"}"},</CodeText>
          </CodeLine>
          <CodeLine indent={2}>
            <CodeKey>resolver</CodeKey>
            <CodeText>: {"{"} </CodeText>
            <CodeKey>kind</CodeKey>
            <CodeText>: </CodeText>
            <CodeStr>{`"reflector"`}</CodeStr>
            <CodeText>, </CodeText>
            <CodeKey>feed</CodeKey>
            <CodeText>: </CodeText>
            <CodeStr>{`"BTC/USD"`}</CodeStr>
            <CodeText> {"}"},</CodeText>
          </CodeLine>
          <CodeLine indent={2}>
            <CodeKey>resolveAt</CodeKey>
            <CodeText>: </CodeText>
            <CodeStr>{`"2026-05-17T21:00Z"`}</CodeStr>
            <CodeText>,</CodeText>
          </CodeLine>
          <CodeLine indent={2}>
            <CodeKey>fee</CodeKey>
            <CodeText>: </CodeText>
            <CodeNum>100</CodeNum>
            <CodeText>,</CodeText> <CodeCom>{`// bps`}</CodeCom>
          </CodeLine>
          <CodeLine>
            <CodeText>{"});"}</CodeText>
          </CodeLine>
        </code>
      </pre>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
        <span className="text-[#d8c69a]/80">returns</span>
        <span>market.address</span>
        <span className="text-white/25">·</span>
        <span>market.positionNFT</span>
        <span className="text-white/25">·</span>
        <span>market.resolve()</span>
      </div>
    </div>
  );
}

function CodeLine({ children, indent = 0 }: { children?: React.ReactNode; indent?: number }) {
  return (
    <div className="whitespace-pre">
      {" ".repeat(indent * 2)}
      {children ?? " "}
    </div>
  );
}
function CodeKw({ children }: { children: React.ReactNode }) {
  return <span className="text-[#d8c69a]">{children}</span>;
}
function CodeFn({ children }: { children: React.ReactNode }) {
  return <span className="text-[#f3efe6]">{children}</span>;
}
function CodeKey({ children }: { children: React.ReactNode }) {
  return <span className="text-white/90">{children}</span>;
}
function CodeStr({ children }: { children: React.ReactNode }) {
  return <span className="text-[#a3b07a]">{children}</span>;
}
function CodeNum({ children }: { children: React.ReactNode }) {
  return <span className="text-[#e6a85c]">{children}</span>;
}
function CodeOp({ children }: { children: React.ReactNode }) {
  return <span className="text-white/55">{children}</span>;
}
function CodeText({ children }: { children: React.ReactNode }) {
  return <span className="text-white/70">{children}</span>;
}
function CodeCom({ children }: { children: React.ReactNode }) {
  return <span className="text-white/35">{children}</span>;
}

/* ---------------------------------------------------------------- */
/* § 07 — PAPER CTA                                                  */
/* ---------------------------------------------------------------- */

function PaperCTA() {
  const toc = [
    { n: "01", t: "The primitive", p: "03" },
    { n: "02", t: "Distribution markets", p: "11" },
    { n: "03", t: "The AMM", p: "24" },
    { n: "04", t: "Oracle tiering", p: "38" },
    { n: "05", t: "Settlement", p: "52" },
    { n: "06", t: "Economics", p: "61" },
    { n: "07", t: "Implementation", p: "73" },
    { n: "08", t: "Road to mainnet", p: "84" },
    { n: "09", t: "Future work", p: "92" },
  ];

  return (
    <section className="relative overflow-hidden border-t border-white/10 px-6 py-28 sm:px-10 lg:py-40">
      {/* atmosphere */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.14),transparent_60%)]" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.06),transparent_60%)]" />

      <div className="relative mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-12 gap-x-6 gap-y-12 lg:gap-x-16"
        >
          {/* LEFT — editorial pitch */}
          <div className="col-span-12 flex flex-col justify-between lg:col-span-7">
            <div>
              <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#d8c69a]">
                <span className="inline-block h-px w-8 bg-[#d8c69a]" />
                The whitepaper
              </div>
              <h2 className="mt-8 font-serif text-[3rem] leading-[0.95] tracking-[-0.035em] text-[#f3efe6] sm:text-[5rem] lg:text-[7.5rem]">
                Read the
                <span className="block text-white/40">working draft.</span>
              </h2>
              <p className="mt-10 max-w-[48ch] text-[17px] leading-[1.6] text-white/60 sm:text-[19px]">
                The mechanism end-to-end. AMM construction, oracle tiering, economics, and the road
                from testnet to mainnet — with footnotes you'll actually want to follow.
              </p>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-5">
              <Link
                href="/whitepaper"
                className="group inline-flex items-center gap-4 rounded-full bg-[#f3efe6] px-9 py-5 text-[13px] font-medium uppercase tracking-[0.2em] text-[#0b0b0c] shadow-[0_20px_60px_-15px_rgba(216,198,154,0.45)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_30px_80px_-15px_rgba(216,198,154,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b0b0c]"
              >
                Open the paper
                <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <Link
                href="/whitepaper.pdf"
                className="group inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/55 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c]"
              >
                Download PDF
                <span className="text-white/30 transition-colors group-hover:text-[#d8c69a]">↓</span>
              </Link>
            </div>

          </div>

          {/* RIGHT — paper as artifact (light, like the real thing) */}
          <motion.div
            initial={{ opacity: 0, y: 20, rotate: -1 }}
            whileInView={{ opacity: 1, y: 0, rotate: -1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
            className="col-span-12 lg:col-span-5"
          >
            <Link
              href="/whitepaper"
              className="group relative block transition-transform duration-500 hover:rotate-0 hover:-translate-y-2 focus-visible:outline-none focus-visible:rotate-0"
              aria-label="Open Kaido whitepaper"
            >
              {/* paper drop shadow stack */}
              <div className="pointer-events-none absolute -inset-4 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(216,198,154,0.18),transparent_60%)] blur-2xl" />

              <div className="relative bg-[#f3efe6] p-7 text-[#0b0b0c] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7),0_8px_24px_-8px_rgba(216,198,154,0.4)] sm:p-9 lg:p-10">
                {/* paper grain */}
                <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:radial-gradient(rgba(0,0,0,0.6)_1px,transparent_1px)] [background-size:3px_3px]" />

                <div className="relative">
                  <div className="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.28em] text-[#0b0b0c]/55">
                    <span>Kaido Labs</span>
                    <span>v0.1 · 2026</span>
                  </div>

                  <h3 className="mt-7 font-serif text-[34px] leading-[0.95] tracking-[-0.02em] text-[#0b0b0c] sm:text-[40px]">
                    Distribution
                    <br />
                    Markets
                    <span className="mt-1 block text-[22px] tracking-[-0.01em] text-[#0b0b0c]/55 sm:text-[26px]">
                      for Stellar
                    </span>
                  </h3>

                  <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[#0b0b0c]/55">
                    Kaido Labs · working draft
                  </div>

                  <ol className="mt-8 grid grid-cols-1 gap-1.5 border-t border-[#0b0b0c]/15 pt-5 font-mono text-[10.5px] uppercase tracking-[0.18em]">
                    {toc.map((row, i) => (
                      <li
                        key={row.n}
                        className={`flex items-baseline gap-3 ${
                          i > 4 ? "text-[#0b0b0c]/30" : "text-[#0b0b0c]/65"
                        }`}
                      >
                        <span className="w-9 text-[#0b0b0c]/35">§ {row.n}</span>
                        <span className="flex-1 truncate">{row.t}</span>
                        <span className="font-mono text-[#0b0b0c]/40">p. {row.p}</span>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-7 flex items-center justify-between border-t border-dashed border-[#0b0b0c]/20 pt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[#0b0b0c]/55">
                    <span className="flex items-center gap-2 text-[#0b0b0c]/75 transition-colors group-hover:text-[#0b0b0c]">
                      Open the paper
                      <span className="inline-block transition-transform group-hover:translate-x-1">
                        →
                      </span>
                    </span>
                    <span>9 parts</span>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* FOOTER                                                            */
/* ---------------------------------------------------------------- */

function LandingFooter({ network }: { network: string }) {
  return (
    <footer className="border-t border-white/10 px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
        <div className="flex items-center gap-3">
          <span className="font-serif text-base italic text-white/85">Kaido</span>
          <span className="text-white/25">街道</span>
        </div>
        <div className="flex items-center gap-6">
          <span>net · {network}</span>
          <Link href="/markets" className="hover:text-white/85">Markets</Link>
          <Link href="/create" className="hover:text-white/85">Create</Link>
          <Link href="/leaderboard" className="hover:text-white/85">Leaderboard</Link>
          <Link href="/whitepaper" className="hover:text-white/85">Paper</Link>
        </div>
      </div>
    </footer>
  );
}
