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
      <CanvasSection />
      <HowItWorks />
      <ExamplesSection />
      <MechanismSection />
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
              href="/markets"
              className="group inline-flex items-center gap-3 rounded-full bg-[#f3efe6] px-7 py-4 text-[13px] font-medium uppercase tracking-[0.18em] text-[#0b0b0c] transition-all hover:bg-white"
            >
              Enter markets
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
    <section className="relative border-t border-white/10 px-6 py-28 sm:px-10 lg:py-40">
      <div className="mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-12 gap-x-6 gap-y-10"
        >
          <div className="col-span-12 lg:col-span-3">
            <SectionLabel num="§ 01" title="The primitive" />
          </div>
          <div className="col-span-12 lg:col-span-9">
            <h2 className="font-serif text-5xl italic leading-[1] tracking-[-0.01em] text-[#f3efe6] sm:text-6xl lg:text-[5.5rem]">
              A market for every number.
            </h2>
            <p className="mt-8 max-w-xl text-[15px] leading-[1.6] text-white/55">
              Beliefs aren&apos;t coin flips. They&apos;re shapes. Kaido lets you trade the whole
              shape.
            </p>
          </div>
        </motion.div>

        <div className="mt-20 grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-10">
          <motion.div
            variants={reveal}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <YesNoPanel />
          </motion.div>
          <motion.div
            variants={reveal}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: 0.12 }}
          >
            <CurvePanel />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function YesNoPanel() {
  return (
    <div className="group relative flex h-full flex-col border border-white/10 p-8 transition-colors hover:border-white/20 lg:p-10">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
        <span>Yes / No</span>
        <span>1 bit</span>
      </div>
      <div className="mt-14 flex flex-1 items-end justify-center gap-8">
        <div className="flex flex-col items-center">
          <motion.div
            initial={{ height: 0 }}
            whileInView={{ height: 176 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="w-20 origin-bottom rounded-sm bg-white/15"
          />
          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            Yes · 70%
          </div>
        </div>
        <div className="flex flex-col items-center">
          <motion.div
            initial={{ height: 0 }}
            whileInView={{ height: 78 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.35 }}
            className="w-20 origin-bottom rounded-sm bg-white/10"
          />
          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            No · 30%
          </div>
        </div>
      </div>
      <div className="mt-14 border-t border-white/10 pt-6 font-serif text-lg italic leading-snug text-white/55">
        Everyone built the same thing.
        <span className="block text-white/35">Coin flips with a price tag.</span>
      </div>
    </div>
  );
}

function CurvePanel() {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden border border-[#d8c69a]/40 bg-[#d8c69a]/[0.04] p-8 lg:p-10">
      {/* soft amber glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#d8c69a]/10 blur-3xl" />
      <div className="relative flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]">
        <span>Distribution · Kaido</span>
        <span>the whole shape</span>
      </div>
      <div className="relative mt-8 flex-1">
        <svg viewBox="0 0 600 220" className="h-auto w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="curveFill2" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#d8c69a" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#d8c69a" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={i * 200} y1="0" x2={i * 200} y2="200" stroke="rgba(255,255,255,0.06)" />
          ))}
          <line x1="0" y1="200" x2="600" y2="200" stroke="rgba(255,255,255,0.18)" />
          <motion.path
            d="M0,200 C 100,200 160,190 220,150 C 260,115 285,40 320,40 C 360,40 395,110 440,160 C 490,195 540,200 600,200 L 600,200 L 0,200 Z"
            fill="url(#curveFill2)"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, delay: 0.3 }}
          />
          <motion.path
            d="M0,200 C 100,200 160,190 220,150 C 260,115 285,40 320,40 C 360,40 395,110 440,160 C 490,195 540,200 600,200"
            fill="none"
            stroke="#d8c69a"
            strokeWidth="1.5"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease: "easeOut", delay: 0.1 }}
          />
          <motion.line
            x1="320"
            y1="40"
            x2="320"
            y2="200"
            stroke="rgba(216,198,154,0.45)"
            strokeDasharray="2 4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 1.4 }}
          />
          <motion.circle
            cx="320"
            cy="40"
            r="4"
            fill="#d8c69a"
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 1.5, type: "spring", stiffness: 300, damping: 18 }}
          />
        </svg>
      </div>
      <div className="relative mt-3 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
        <span>outcome →</span>
        <span className="text-[#d8c69a]">μ · 68.2k · σ · 1.4k</span>
      </div>
      <div className="relative mt-10 border-t border-white/10 pt-6 font-serif text-lg italic leading-snug text-white/80">
        Where you think it lands.
        <span className="block text-[#d8c69a]">How sure you are.</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* § 02 — CANVAS — you draw your forecast                            */
/* ---------------------------------------------------------------- */

function CanvasSection() {
  return (
    <section className="relative overflow-hidden border-t border-white/10 px-6 py-28 sm:px-10 lg:py-40">
      {/* subtle radial atmosphere */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.08),transparent_60%)]" />
      <div className="relative mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-12 gap-x-6 gap-y-10"
        >
          <div className="col-span-12 lg:col-span-3">
            <SectionLabel num="§ 02" title="The canvas" />
          </div>
          <div className="col-span-12 lg:col-span-9">
            <h2 className="font-serif text-5xl italic leading-[1] tracking-[-0.01em] text-[#f3efe6] sm:text-6xl lg:text-[5.5rem]">
              You don&apos;t read order books.
              <span className="block text-white/40">You draw.</span>
            </h2>
          </div>
        </motion.div>

        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-16 grid grid-cols-12 gap-6 lg:gap-10"
        >
          <div className="col-span-12 lg:col-span-8">
            <CanvasChart />
          </div>
          <aside className="col-span-12 flex flex-col justify-end gap-8 lg:col-span-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]">
                · Trajectory mode
              </div>
              <p className="mt-3 font-serif text-2xl italic leading-snug text-[#f3efe6]">
                For things that move.
              </p>
              <p className="mt-3 text-[14px] leading-[1.6] text-white/55">
                Live charts of prices, scores, polls. Drag the line where you think it goes.
              </p>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]">
                · Distribution mode
              </div>
              <p className="mt-3 font-serif text-2xl italic leading-snug text-[#f3efe6]">
                For things that land.
              </p>
              <p className="mt-3 text-[14px] leading-[1.6] text-white/55">
                Election margins, box office, CPI prints. Draw a hump over a number line — where
                and how sure.
              </p>
            </div>
          </aside>
        </motion.div>
      </div>
    </section>
  );
}

function CanvasChart() {
  return (
    <div className="relative overflow-hidden border border-white/10 bg-[#0a0a0b]">
      {/* header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
          <span className="text-[#d8c69a]">● live</span>
          <span>BTC/USD · 90s</span>
          <span className="hidden sm:inline text-white/30">trajectory</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
          T0 · trustless
        </div>
      </div>

      {/* chart */}
      <div className="relative">
        <svg viewBox="0 0 800 360" className="block h-auto w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="canvasForecast" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#d8c69a" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#d8c69a" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="canvasHist" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f3efe6" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#f3efe6" stopOpacity="0" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* grid */}
          {[60, 120, 180, 240, 300].map((y) => (
            <line key={y} x1="0" x2="800" y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />
          ))}
          {[0, 100, 200, 300, 400, 500, 600, 700, 800].map((x) => (
            <line key={x} x1={x} x2={x} y1="0" y2="360" stroke="rgba(255,255,255,0.03)" />
          ))}

          {/* divider — present moment */}
          <line x1="440" y1="0" x2="440" y2="360" stroke="rgba(216,198,154,0.3)" strokeDasharray="3 4" />
          <text
            x="448"
            y="22"
            fill="#d8c69a"
            fontFamily="var(--font-jetbrains-mono), monospace"
            fontSize="10"
            letterSpacing="2"
            opacity="0.7"
          >
            NOW
          </text>

          {/* historical area */}
          <motion.path
            d="M0,260 L20,255 L50,250 L80,240 L110,235 L140,230 L170,220 L200,210 L230,215 L260,200 L290,195 L320,180 L350,185 L380,170 L410,175 L440,160 L440,360 L0,360 Z"
            fill="url(#canvasHist)"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
          />
          {/* historical line */}
          <motion.path
            d="M0,260 L20,255 L50,250 L80,240 L110,235 L140,230 L170,220 L200,210 L230,215 L260,200 L290,195 L320,180 L350,185 L380,170 L410,175 L440,160"
            fill="none"
            stroke="#f3efe6"
            strokeWidth="1.5"
            strokeOpacity="0.85"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease: "easeOut" }}
          />

          {/* forecast area */}
          <motion.path
            d="M440,160 L470,140 L500,150 L540,120 L580,110 L620,95 L660,100 L700,85 L740,80 L780,70 L780,360 L440,360 Z"
            fill="url(#canvasForecast)"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 1.6 }}
          />
          {/* forecast line */}
          <motion.path
            d="M440,160 L470,140 L500,150 L540,120 L580,110 L620,95 L660,100 L700,85 L740,80 L780,70"
            fill="none"
            stroke="#d8c69a"
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#glow)"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: "easeOut", delay: 1.6 }}
          />
          {/* forecast endpoint */}
          <motion.circle
            cx="780"
            cy="70"
            r="5"
            fill="#d8c69a"
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 3, type: "spring", stiffness: 300, damping: 18 }}
          />
          <motion.circle
            cx="780"
            cy="70"
            r="10"
            fill="none"
            stroke="#d8c69a"
            strokeOpacity="0.4"
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 3.05, duration: 0.6 }}
          />

          {/* y-axis ticks */}
          <text x="10" y="56" fill="rgba(255,255,255,0.35)" fontFamily="var(--font-jetbrains-mono), monospace" fontSize="9" letterSpacing="1">68.8k</text>
          <text x="10" y="176" fill="rgba(255,255,255,0.35)" fontFamily="var(--font-jetbrains-mono), monospace" fontSize="9" letterSpacing="1">68.4k</text>
          <text x="10" y="296" fill="rgba(255,255,255,0.35)" fontFamily="var(--font-jetbrains-mono), monospace" fontSize="9" letterSpacing="1">68.0k</text>
        </svg>

        {/* annotation card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 3.2, duration: 0.5 }}
          className="absolute right-4 top-4 hidden border border-[#d8c69a]/40 bg-[#0b0b0c]/80 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] backdrop-blur sm:block"
        >
          <div className="text-[#d8c69a]">Your forecast</div>
          <div className="mt-1 text-white/50">+0.6% · 45s</div>
        </motion.div>
      </div>

      {/* footer scrubber */}
      <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
        <span>00:00</span>
        <span className="text-white/55">— drag to draw —</span>
        <span>00:90</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* § 03 — THE LOOP                                                   */
/* ---------------------------------------------------------------- */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Draw",
      body: "A curve over the outcome — where, and how sure.",
      glyph: <GlyphCurve />,
    },
    {
      n: "02",
      title: "Position",
      body: "The AMM prices your shape against the market. Loss is bounded.",
      glyph: <GlyphBalance />,
    },
    {
      n: "03",
      title: "Settle",
      body: "Oracle posts the truth. Soroban pays the closest forecasters.",
      glyph: <GlyphTarget />,
    },
  ];
  return (
    <section className="relative border-t border-white/10 bg-[#08080a] px-6 py-28 sm:px-10 lg:py-40">
      <div className="mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-12 gap-x-6 gap-y-6"
        >
          <div className="col-span-12 lg:col-span-3">
            <SectionLabel num="§ 03" title="The loop" />
          </div>
          <div className="col-span-12 lg:col-span-9">
            <h2 className="font-serif text-4xl italic leading-[1] tracking-[-0.01em] text-[#f3efe6] sm:text-5xl lg:text-[4.5rem]">
              Three steps.
              <span className="block text-white/40">No order book.</span>
            </h2>
          </div>
        </motion.div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              variants={reveal}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.12 }}
              className={`relative px-2 py-10 md:px-10 ${
                i !== steps.length - 1 ? "md:border-r md:border-white/10" : ""
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#d8c69a]">
                  {s.n}
                </div>
                <div className="text-white/30">{s.glyph}</div>
              </div>
              <h3 className="mt-8 font-serif text-4xl italic leading-tight text-[#f3efe6]">
                {s.title}
              </h3>
              <p className="mt-4 max-w-xs text-[14px] leading-[1.55] text-white/55">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GlyphCurve() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <path d="M2 32 C 10 32, 14 26, 20 12 C 26 26, 30 32, 38 32" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <line x1="20" y1="12" x2="20" y2="32" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
    </svg>
  );
}

function GlyphBalance() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <line x1="6" y1="20" x2="34" y2="20" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="20" r="4" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="24" y="14" width="10" height="12" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function GlyphTarget() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="20" cy="20" r="8" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="20" cy="20" r="2" fill="currentColor" />
    </svg>
  );
}

/* ---------------------------------------------------------------- */
/* § 04 — EXAMPLES                                                   */
/* ---------------------------------------------------------------- */

type Example = {
  category: string;
  question: string;
  oracle: "T0" | "T1" | "T2" | "T3";
  oracleLabel: string;
  window: string;
  marker: string;
  /** sparkline path data (viewBox 200x60) */
  path: string;
};

const EXAMPLES: Example[] = [
  {
    category: "Crypto · BTC/USD",
    question: "Where does BTC drift in 90 seconds?",
    oracle: "T0",
    oracleLabel: "Trustless · Reflector",
    window: "90s · trajectory",
    marker: "μ · 68.2k",
    path: "M0,45 C 30,42 50,38 80,30 C 110,22 140,12 170,10 C 185,9 195,8 200,7",
  },
  {
    category: "Politics · US 2028",
    question: "What is the popular-vote margin?",
    oracle: "T1",
    oracleLabel: "Attested · certified result",
    window: "scalar · ± 20pp",
    marker: "μ · +3.4",
    path: "M0,50 C 30,48 50,40 80,22 C 95,14 105,12 120,18 C 140,28 160,46 200,52",
  },
  {
    category: "Weather · Mumbai",
    question: "How much rain falls tomorrow?",
    oracle: "T1",
    oracleLabel: "Attested · met. service",
    window: "scalar · 0–300mm",
    marker: "μ · 8mm",
    path: "M0,52 C 20,40 35,14 55,16 C 75,18 90,42 120,50 C 150,55 180,55 200,55",
  },
  {
    category: "Film · Opening weekend",
    question: "How much does it gross domestically?",
    oracle: "T2",
    oracleLabel: "Optimistic · bonded dispute",
    window: "scalar · $0–500M",
    marker: "μ · $74M",
    path: "M0,54 C 30,52 60,48 90,32 C 110,20 125,16 145,20 C 165,26 185,46 200,52",
  },
];

function ExamplesSection() {
  return (
    <section className="relative border-t border-white/10 px-6 py-28 sm:px-10 lg:py-40">
      <div className="mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-12 gap-x-6 gap-y-10"
        >
          <div className="col-span-12 lg:col-span-3">
            <SectionLabel num="§ 04" title="In the wild" />
          </div>
          <div className="col-span-12 lg:col-span-9">
            <h2 className="font-serif text-5xl italic leading-[1] tracking-[-0.01em] text-[#f3efe6] sm:text-6xl lg:text-[5.5rem]">
              Anything quantifiable.
              <span className="block text-white/40">Same primitive.</span>
            </h2>
            <p className="mt-8 max-w-xl text-[15px] leading-[1.6] text-white/55">
              Supply an outcome space and a resolver. The protocol does the rest. Every tier is
              clearly labeled — you always know what you&apos;re trusting.
            </p>
          </div>
        </motion.div>

        <div className="mt-20 grid grid-cols-1 gap-px bg-white/10 md:grid-cols-2">
          {EXAMPLES.map((ex, i) => (
            <motion.div
              key={ex.question}
              variants={reveal}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: (i % 2) * 0.08 + Math.floor(i / 2) * 0.04 }}
            >
              <ExampleCard ex={ex} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExampleCard({ ex }: { ex: Example }) {
  return (
    <article className="group relative flex h-full flex-col gap-10 bg-[#0b0b0c] p-8 transition-colors hover:bg-[#0e0e10] lg:p-12">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em]">
        <span className="text-[#d8c69a]">{ex.category}</span>
        <OracleBadge tier={ex.oracle} label={ex.oracleLabel} />
      </div>

      <h3 className="font-serif text-3xl italic leading-[1.05] text-[#f3efe6] lg:text-4xl">
        {ex.question}
      </h3>

      <div className="mt-auto">
        <svg viewBox="0 0 200 60" className="h-14 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`ex-${ex.oracle}-${ex.category}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#d8c69a" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#d8c69a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${ex.path} L 200,60 L 0,60 Z`} fill={`url(#ex-${ex.oracle}-${ex.category})`} />
          <path d={ex.path} fill="none" stroke="#d8c69a" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
          <span>{ex.window}</span>
          <span className="text-[#d8c69a]/80">{ex.marker}</span>
        </div>
      </div>
    </article>
  );
}

function OracleBadge({ tier, label }: { tier: "T0" | "T1" | "T2" | "T3"; label: string }) {
  const tone = {
    T0: "text-[#d8c69a] border-[#d8c69a]/40",
    T1: "text-white/70 border-white/30",
    T2: "text-white/55 border-white/20",
    T3: "text-white/40 border-white/15",
  }[tier];
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-1 ${tone}`}>
      <span className="font-semibold">{tier}</span>
      <span className="text-white/40">·</span>
      <span className="text-white/45 normal-case tracking-normal">{label}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* § 05 — MECHANISM                                                  */
/* ---------------------------------------------------------------- */

function MechanismSection() {
  return (
    <section className="relative overflow-hidden border-t border-white/10 bg-[#08080a] px-6 py-28 sm:px-10 lg:py-40">
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:3px_3px]" />
      <div className="relative mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-12 gap-x-6 gap-y-10"
        >
          <div className="col-span-12 lg:col-span-3">
            <SectionLabel num="§ 05" title="The mechanism" />
          </div>
          <div className="col-span-12 lg:col-span-9">
            <h2 className="font-serif text-5xl italic leading-[1] tracking-[-0.01em] text-[#f3efe6] sm:text-6xl lg:text-[5.5rem]">
              Geometry, not bookmakers.
            </h2>
            <p className="mt-8 max-w-2xl text-[15px] leading-[1.6] text-white/55">
              An AMM with the <em className="font-serif text-[#f3efe6]">L²-norm</em> as its
              invariant — like Uniswap&apos;s <em className="font-serif text-[#f3efe6]">xy=k</em>,
              but for entire probability distributions. In equilibrium, the market&apos;s state
              becomes the crowd&apos;s forecast.
            </p>
          </div>
        </motion.div>

        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-20 grid grid-cols-12 gap-6 lg:gap-10"
        >
          {/* Sphere visualization */}
          <div className="col-span-12 lg:col-span-5">
            <SphereVisual />
          </div>

          {/* Invariants */}
          <div className="col-span-12 flex flex-col justify-center gap-px bg-white/10 lg:col-span-7">
            <InvariantRow
              eq="‖f‖₂ = k"
              label="Position lives on a sphere"
              body="Every aggregate trader curve has fixed L² length. Same role as xy = k."
            />
            <InvariantRow
              eq="f(x) ≤ b"
              label="Always solvent"
              body="A σ-floor or capped-Gaussian keeps the payout function under the collateral, everywhere."
            />
            <InvariantRow
              eq="x* ∝ p"
              label="Equilibrium = truth"
              body="By Cauchy–Schwarz, arbitrageurs push the curve into the true distribution."
            />
          </div>
        </motion.div>

        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-16 flex flex-wrap items-baseline justify-between gap-4 border-t border-white/10 pt-8 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40"
        >
          <span>Mechanism: White, D. — &quot;Distribution Markets&quot; — Paradigm, Dec 2024</span>
          <span>Kaido v0.1 working draft</span>
        </motion.div>
      </div>
    </section>
  );
}

function SphereVisual() {
  return (
    <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden border border-white/10 bg-[#0b0b0c]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(216,198,154,0.18),transparent_60%)]" />
      <svg viewBox="0 0 400 400" className="h-full w-full">
        <defs>
          <radialGradient id="sphereFill" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#d8c69a" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#d8c69a" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#d8c69a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="150" fill="url(#sphereFill)" stroke="rgba(216,198,154,0.35)" strokeWidth="1" />
        {/* latitude lines */}
        {[140, 170, 200, 230, 260].map((y) => {
          const rx = Math.sqrt(150 * 150 - (y - 200) * (y - 200));
          return (
            <ellipse
              key={y}
              cx="200"
              cy={y}
              rx={rx}
              ry={rx * 0.18}
              stroke="rgba(255,255,255,0.06)"
              fill="none"
            />
          );
        })}
        {/* longitude */}
        <ellipse cx="200" cy="200" rx="150" ry="40" stroke="rgba(255,255,255,0.08)" fill="none" />
        <ellipse cx="200" cy="200" rx="40" ry="150" stroke="rgba(255,255,255,0.08)" fill="none" />

        {/* the position vector / curve */}
        <motion.line
          x1="200"
          y1="200"
          x2="332"
          y2="128"
          stroke="#d8c69a"
          strokeWidth="1.5"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }}
        />
        <motion.circle
          cx="332"
          cy="128"
          r="5"
          fill="#d8c69a"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.6, type: "spring", stiffness: 300, damping: 18 }}
        />
        <motion.circle
          cx="332"
          cy="128"
          r="12"
          fill="none"
          stroke="#d8c69a"
          strokeOpacity="0.3"
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.7, duration: 0.6 }}
        />
        {/* center marker */}
        <circle cx="200" cy="200" r="2" fill="rgba(255,255,255,0.5)" />
      </svg>
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
        <span>Position vector · ‖x‖ = k</span>
        <span className="text-[#d8c69a]/80">Hilbert space</span>
      </div>
    </div>
  );
}

function InvariantRow({ eq, label, body }: { eq: string; label: string; body: string }) {
  return (
    <div className="group flex flex-col gap-3 bg-[#08080a] p-8 transition-colors hover:bg-[#0c0c0e] lg:flex-row lg:items-baseline lg:gap-10 lg:p-10">
      <div className="font-serif text-3xl italic text-[#d8c69a] lg:w-48">{eq}</div>
      <div className="flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#f3efe6]">{label}</div>
        <p className="mt-2 text-[14px] leading-[1.55] text-white/55">{body}</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* § 06 — BUILDERS                                                   */
/* ---------------------------------------------------------------- */

function BuildersSection() {
  return (
    <section className="relative border-t border-white/10 px-6 py-28 sm:px-10 lg:py-40">
      <div className="mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-12 gap-x-6 gap-y-10"
        >
          <div className="col-span-12 lg:col-span-3">
            <SectionLabel num="§ 06" title="For builders" />
          </div>
          <div className="col-span-12 lg:col-span-9">
            <h2 className="font-serif text-5xl italic leading-[1] tracking-[-0.01em] text-[#f3efe6] sm:text-6xl lg:text-[5.5rem]">
              One call.
              <span className="block text-white/40">New market.</span>
            </h2>
            <p className="mt-8 max-w-xl text-[15px] leading-[1.6] text-white/55">
              An SDK and a Soroban contract. Plug your own resolver. Embed Kaido markets anywhere.
            </p>
          </div>
        </motion.div>

        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-16 grid grid-cols-12 gap-6 lg:gap-10"
        >
          <div className="col-span-12 lg:col-span-7">
            <CodeBlock />
          </div>
          <aside className="col-span-12 flex flex-col gap-px bg-white/10 lg:col-span-5">
            <FieldRow k="OutcomeSpace" v="ℝ range · or trajectory checkpoints" />
            <FieldRow k="Parameterization" v="Gaussian (μ, σ) · σ-floor" />
            <FieldRow k="Resolver" v="T0 trustless · T1 attested · T2 optimistic · T3 designated" />
            <FieldRow k="Window" v="open · lock · resolve" />
            <FieldRow k="House liquidity" v="auto-seeded by HouseVault" />
          </aside>
        </motion.div>
      </div>
    </section>
  );
}

function CodeBlock() {
  return (
    <div className="relative overflow-hidden border border-white/10 bg-[#08080a]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
        <span>@kaido/sdk</span>
        <span>typescript</span>
      </div>
      <pre className="overflow-x-auto p-6 font-mono text-[12.5px] leading-[1.7] text-white/80 sm:text-[13px]">
        <code>
          <span className="text-white/35">{`// any number can be a market`}</span>
          {"\n"}
          <span className="text-[#d8c69a]">await</span>{" "}
          <span className="text-white">kaido</span>.
          <span className="text-[#d8c69a]">createMarket</span>({"({"}
          {"\n"}
          {"  "}
          <span className="text-white/90">outcome</span>:{" "}
          <span className="text-[#a3b07a]">{`"scalar"`}</span>,{" "}
          <span className="text-white/90">range</span>:{" "}
          <span className="text-white">[</span>
          <span className="text-[#e6a85c]">-20</span>,{" "}
          <span className="text-[#e6a85c]">20</span>
          <span className="text-white">]</span>,{"\n"}
          {"  "}
          <span className="text-white/90">parameterization</span>:{" "}
          <span className="text-[#a3b07a]">{`"gaussian"`}</span>,{" "}
          <span className="text-white/90">sigmaFloor</span>:{" "}
          <span className="text-[#e6a85c]">0.5</span>,{"\n"}
          {"  "}
          <span className="text-white/90">resolver</span>:{" "}
          <span className="text-white">{`{`}</span>{" "}
          <span className="text-white/90">tier</span>:{" "}
          <span className="text-[#a3b07a]">{`"T1"`}</span>,{" "}
          <span className="text-white/90">attestor</span>:{" "}
          <span className="text-[#a3b07a]">{`"GCERT…"`}</span>{" "}
          <span className="text-white">{`}`}</span>,{"\n"}
          {"  "}
          <span className="text-white/90">window</span>:{" "}
          <span className="text-white">{`{`}</span>{" "}
          <span className="text-white/90">resolveAt</span>:{" "}
          <span className="text-[#a3b07a]">{`"2028-11-10T00:00Z"`}</span>{" "}
          <span className="text-white">{`}`}</span>,{"\n"}
          {"  "}
          <span className="text-white/90">fee</span>:{" "}
          <span className="text-[#e6a85c]">100</span>{" "}
          <span className="text-white/35">{`// bps`}</span>,{"\n"}
          {"}"})
        </code>
      </pre>
      <div className="border-t border-white/10 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]/70">
        → returns: <span className="text-white/55">MarketAddress · PositionNFT collection</span>
      </div>
    </div>
  );
}

function FieldRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-1 bg-[#0b0b0c] p-5 lg:p-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]">{k}</div>
      <div className="text-[13.5px] leading-[1.5] text-white/65">{v}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* § 07 — PAPER CTA                                                  */
/* ---------------------------------------------------------------- */

function PaperCTA() {
  return (
    <section className="relative border-t border-white/10 px-6 py-28 sm:px-10 lg:py-36">
      <div className="mx-auto max-w-[1400px]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="relative overflow-hidden border border-white/10 bg-[#0a0a0b] p-10 sm:p-16 lg:p-24"
        >
          {/* atmospheric gradients */}
          <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.18),transparent_60%)]" />
          <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.06),transparent_60%)]" />

          <div className="relative grid grid-cols-12 gap-x-6 gap-y-8 items-end">
            <div className="col-span-12 lg:col-span-7">
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#d8c69a]">
                · The whitepaper
              </div>
              <h2 className="mt-6 font-serif text-5xl italic leading-[0.98] tracking-[-0.01em] text-[#f3efe6] sm:text-6xl lg:text-[5.5rem]">
                Read the working
                <span className="block">draft.</span>
              </h2>
              <p className="mt-8 max-w-xl text-[15px] leading-[1.6] text-white/55">
                Mechanism, mathematics, oracle tiering, economics, and the road from testnet to
                mainnet. Forty minutes if you read it carefully.
              </p>
            </div>
            <div className="col-span-12 lg:col-span-5 lg:justify-self-end">
              <div className="flex flex-col items-start gap-4 lg:items-end">
                <Link
                  href="/whitepaper"
                  className="group inline-flex items-center gap-3 rounded-full bg-[#f3efe6] px-8 py-4 text-[13px] font-medium uppercase tracking-[0.18em] text-[#0b0b0c] transition-all hover:bg-white"
                >
                  Open the paper
                  <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
                </Link>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
                  v0.1 · ~10,000 words · 9 parts
                </div>
              </div>
            </div>
          </div>
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
