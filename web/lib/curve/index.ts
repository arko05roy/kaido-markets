/**
 * `web/lib/curve` — the deterministic curve-fit the frontend uses to turn a
 * drawn path / hump into the `(μ, σ)` parameters a `DistributionMarket` stores,
 * and the inverse (params → rendered curve) so the *exact fitted curve is shown
 * back to the user before they confirm* (ADR-8, build.md §6 item 8).
 *
 * The low-level fixed-point primitives here are a **byte-exact port** of
 * `contracts/crates/kaido-math` (WAD = 1e18, truncation toward zero everywhere —
 * `mul_div`, `wmul`, `wdiv`, `sqrtWad`, `expWad`, `gaussianL2Norm`, `lambda`,
 * `gaussianPdfScaled`, `sigmaFloor`). The shared conformance vectors in
 * `docs/test-vectors/*.json` are run against *both* sides; a mismatch fails CI
 * on Rust and TS (`web/test/curve.conformance.test.ts`).
 */

// --- constants (mirror contracts/crates/kaido-math/src/consts.rs) ----------

export const WAD = 1_000_000_000_000_000_000n;
const LN2 = 693_147_180_559_945_309n;
const HALF_LN2 = 346_573_590_279_972_655n;
const SQRT_PI = 1_772_453_850_905_516_027n;
const SQRT_2PI = 2_506_628_274_631_000_502n;
/** `2·WAD·√WAD` upper arg for `expWad` — `46·WAD` (see kaido-math `MAX_EXP_ARG`). */
const MAX_EXP_ARG = 46n * WAD;
const EXP_COEFFS: readonly bigint[] = [
  1_000_000_000_000_000_000n,
  1_000_000_000_000_000_000n,
  500_000_000_000_000_000n,
  166_666_666_666_666_667n,
  41_666_666_666_666_667n,
  8_333_333_333_333_333n,
  1_388_888_888_888_889n,
  198_412_698_412_698n,
  24_801_587_301_587n,
];

// --- fixed-point primitives (mirror src/fp.rs, src/exp.rs, src/gaussian.rs) -

function abs(v: bigint): bigint {
  return v < 0n ? -v : v;
}

/** Integer floor-sqrt of a non-negative bigint (Newton). */
function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("isqrt of negative");
  if (n < 2n) return n;
  let x = 1n << ((BigInt(n.toString(2).length) + 1n) / 2n);
  for (;;) {
    const next = (x + n / x) >> 1n;
    if (next >= x) break;
    x = next;
  }
  while (x * x > n) x -= 1n;
  while ((x + 1n) * (x + 1n) <= n) x += 1n;
  return x;
}

/** Signed `(a·b)/d`, truncated toward zero — `kaido_math::fp::mul_div`. */
export function mulDiv(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("mul_div by zero");
  if (a === 0n || b === 0n) return 0n;
  const neg = a < 0n !== b < 0n !== d < 0n;
  const q = (abs(a) * abs(b)) / abs(d); // BigInt `/` truncates toward zero
  return neg ? -q : q;
}

/** WAD multiply — `round_toward_zero(a·b / WAD)`. */
export function wmul(a: bigint, b: bigint): bigint {
  return mulDiv(a, b, WAD);
}

/** WAD divide — `round_toward_zero(a·WAD / b)`. */
export function wdiv(a: bigint, b: bigint): bigint {
  return mulDiv(a, WAD, b);
}

/** WAD square root — `floor(sqrt(x·WAD))`. Requires `x ≥ 0`. */
export function sqrtWad(x: bigint): bigint {
  if (x < 0n) throw new Error("sqrt_wad of a negative value");
  if (x === 0n) return 0n;
  return isqrt(x * WAD);
}

/** `v · 2^n`, truncating toward zero for `n < 0` — `kaido_math::fp::shl2`. */
function shl2(v: bigint, n: number): bigint {
  if (n === 0) return v;
  if (n > 0) {
    if (n >= 128) throw new Error("shl2 overflow");
    return v * (1n << BigInt(n));
  }
  const k = BigInt(-n);
  if (k >= 127n) return 0n;
  const r = abs(v) >> k;
  return v < 0n ? -r : r;
}

/** `exp(x/WAD)·WAD`, truncated toward zero — `kaido_math::exp::exp_wad`. */
export function expWad(x: bigint): bigint {
  if (x > MAX_EXP_ARG) throw new Error("exp_wad: argument out of domain");
  if (x === 0n) return WAD;
  // n = round(x / ln2), ties away from zero.
  const q =
    x >= 0n ? (2n * x + LN2) / (2n * LN2) : -((2n * -x + LN2) / (2n * LN2));
  const n = Number(q);
  const r = x - q * LN2; // |r| ≤ ln2/2
  if (abs(r) > HALF_LN2 + 1n) throw new Error("exp_wad: range reduction bug");
  // Horner: acc_k = EXP_COEFFS[k] + mulDiv(r, acc_{k+1}, WAD)
  let acc = EXP_COEFFS[8];
  for (let k = 7; k >= 0; k--) acc = EXP_COEFFS[k] + mulDiv(r, acc, WAD);
  return shl2(acc, n);
}

/** `‖φ_{μ,σ}‖₂ = √(1/(2σ√π))` — `kaido_math::gaussian::gaussian_l2_norm`. */
export function gaussianL2Norm(sigmaWad: bigint): bigint {
  if (sigmaWad <= 0n) throw new Error("gaussian_l2_norm: sigma must be > 0");
  const denom = wmul(2n * sigmaWad, SQRT_PI);
  if (denom <= 0n) throw new Error("gaussian_l2_norm: degenerate sigma");
  return wdiv(WAD, sqrtWad(denom));
}

/** `λ = k·√(2σ√π)` — `kaido_math::gaussian::lambda`. */
export function lambda(kWad: bigint, sigmaWad: bigint): bigint {
  if (kWad < 0n) throw new Error("lambda: k must be >= 0");
  if (sigmaWad <= 0n) throw new Error("lambda: sigma must be > 0");
  return wmul(kWad, sqrtWad(wmul(2n * sigmaWad, SQRT_PI)));
}

/** `λ·φ_{μ,σ}(x)` — `kaido_math::gaussian::gaussian_pdf_scaled`. */
export function gaussianPdfScaled(
  muWad: bigint,
  sigmaWad: bigint,
  lambdaWad: bigint,
  xWad: bigint,
): bigint {
  if (sigmaWad <= 0n) throw new Error("gaussian_pdf_scaled: sigma must be > 0");
  if (lambdaWad < 0n) throw new Error("gaussian_pdf_scaled: lambda must be >= 0");
  const dz = xWad - muWad;
  if (abs(dz) / sigmaWad >= 14n) return 0n;
  const z = wdiv(dz, sigmaWad);
  const halfZ2 = wmul(z, z) / 2n;
  const e = expWad(-halfZ2);
  const sigmaSqrt2pi = wmul(sigmaWad, SQRT_2PI);
  if (sigmaSqrt2pi <= 0n) throw new Error("gaussian_pdf_scaled: degenerate sigma");
  return wmul(wdiv(lambdaWad, sigmaSqrt2pi), e);
}

/** `σ_min(k,b) = (k/b)²/√π` — `kaido_math::gaussian::sigma_floor`. */
export function sigmaFloor(kWad: bigint, bWad: bigint): bigint {
  if (kWad < 0n) throw new Error("sigma_floor: k must be >= 0");
  if (bWad <= 0n) throw new Error("sigma_floor: b must be > 0");
  const ratio = wdiv(kWad, bWad);
  return wdiv(wmul(ratio, ratio), SQRT_PI);
}

/**
 * The σ a fit should snap to: `σ_min(k,b)` plus ~0.1% headroom. At exactly the
 * floor the market's `peak ≤ b` re-check sits on a fixed-point rounding edge
 * (`KaidoError::PeakExceedsB`); a sliver of slack avoids that, and a belief
 * riding exactly on the solvency boundary is fragile anyway — the UI never
 * produces one.
 */
export function effectiveSigmaFloor(kWad: bigint, bWad: bigint): bigint {
  const f = sigmaFloor(kWad, bWad);
  return f + (f >> 10n) + 1n;
}

// --- number ⇄ WAD helpers --------------------------------------------------

/** Convert a JS number to WAD-scaled bigint (round half away from zero). */
export function toWad(x: number): bigint {
  if (!Number.isFinite(x)) throw new Error("toWad: non-finite");
  const neg = x < 0;
  const scaled = Math.abs(x) * 1e18;
  // Avoid float error for the fractional ULP — go via string of the rounded int.
  const r = BigInt(Math.round(scaled));
  return neg ? -r : r;
}

/** Convert a WAD-scaled bigint back to a JS number (lossy — display only). */
export function fromWad(v: bigint): number {
  return Number(v) / 1e18;
}

// --- the actual curve fit --------------------------------------------------

/** A point the user drew, in *outcome* coordinates (x = outcome, y = freehand height). */
export interface DrawnPoint {
  x: number;
  y: number;
}

/** A fitted scalar belief: mean, std-dev (both WAD), clamped to the σ-floor. */
export interface GaussianFit {
  muWad: bigint;
  sigmaWad: bigint;
}

/**
 * Fit a Gaussian `(μ, σ)` to a freehand "hump" — the distribution-mode canvas.
 *
 * The drawn `y` values are treated as an (unnormalised) density sample: μ is the
 * y-weighted centroid of x, σ is the y-weighted RMS spread, both then snapped to
 * the market's `σ_min(k,b)` so the contract's solvency re-check can't reject it.
 * Deterministic: same points + same `(k,b)` ⇒ same WAD output, byte-for-byte.
 */
export function fitGaussianFromHump(
  points: readonly DrawnPoint[],
  market: { kWad: bigint; bWad: bigint },
): GaussianFit {
  if (points.length < 2) throw new Error("fitGaussianFromHump: need ≥ 2 points");
  let wSum = 0,
    wxSum = 0;
  for (const p of points) {
    const w = Math.max(0, p.y);
    wSum += w;
    wxSum += w * p.x;
  }
  if (wSum <= 0) throw new Error("fitGaussianFromHump: zero total height");
  const mu = wxSum / wSum;
  let varSum = 0;
  for (const p of points) {
    const w = Math.max(0, p.y);
    varSum += w * (p.x - mu) * (p.x - mu);
  }
  const sigmaRaw = Math.sqrt(varSum / wSum);
  const muWad = toWad(mu);
  const floor = effectiveSigmaFloor(market.kWad, market.bWad);
  let sigmaWad = toWad(sigmaRaw);
  if (sigmaWad < floor) sigmaWad = floor;
  if (sigmaWad <= 0n) sigmaWad = floor > 0n ? floor : 1n;
  return { muWad, sigmaWad };
}

/**
 * Resample a freehand path (a sorted-by-x polyline) at the market's checkpoint
 * x-coordinates, returning the interpolated outcome value at each checkpoint.
 * This is the "path → checkpoint values" step for trajectory markets.
 */
export function pathToCheckpointValues(
  path: readonly DrawnPoint[],
  checkpointXs: readonly number[],
): number[] {
  if (path.length < 2) throw new Error("pathToCheckpointValues: need ≥ 2 points");
  const pts = [...path].sort((a, b) => a.x - b.x);
  return checkpointXs.map((cx) => {
    if (cx <= pts[0].x) return pts[0].y;
    if (cx >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    let i = 0;
    while (i < pts.length - 1 && pts[i + 1].x < cx) i++;
    const a = pts[i],
      b = pts[i + 1];
    const t = (cx - a.x) / (b.x - a.x);
    return a.y + t * (b.y - a.y);
  });
}

/**
 * Build a per-checkpoint Gaussian fit for a trajectory market: each checkpoint's
 * μ is the path value there; its σ is derived from local path jitter (a confident,
 * smooth draw ⇒ small σ) and snapped to the market σ-floor. Returns parallel
 * arrays aligned to `checkpointXs`.
 */
export function fitTrajectory(
  path: readonly DrawnPoint[],
  checkpointXs: readonly number[],
  market: { kWad: bigint; bWad: bigint },
  opts: { jitterToSigma?: number; minSigma?: number } = {},
): { musWad: bigint[]; sigmasWad: bigint[] } {
  const values = pathToCheckpointValues(path, checkpointXs);
  const jitterScale = opts.jitterToSigma ?? 1;
  const floor = effectiveSigmaFloor(market.kWad, market.bWad);
  // Local jitter: residual of each drawn point from the straight chord through
  // its neighbours, RMS-aggregated near each checkpoint.
  const sorted = [...path].sort((a, b) => a.x - b.x);
  const localJitter = (cx: number): number => {
    let sum = 0,
      n = 0;
    for (let i = 1; i < sorted.length - 1; i++) {
      const p = sorted[i];
      if (Math.abs(p.x - cx) > Math.max(1e-9, (checkpointXs[1] ?? cx + 1) - cx)) continue;
      const a = sorted[i - 1],
        b = sorted[i + 1];
      const t = b.x === a.x ? 0.5 : (p.x - a.x) / (b.x - a.x);
      const chord = a.y + t * (b.y - a.y);
      sum += (p.y - chord) ** 2;
      n++;
    }
    return n > 0 ? Math.sqrt(sum / n) : 0;
  };
  const musWad: bigint[] = [];
  const sigmasWad: bigint[] = [];
  for (let i = 0; i < checkpointXs.length; i++) {
    musWad.push(toWad(values[i]));
    const raw = Math.max(opts.minSigma ?? 0, localJitter(checkpointXs[i]) * jitterScale);
    let s = toWad(raw);
    if (s < floor) s = floor;
    if (s <= 0n) s = floor > 0n ? floor : 1n;
    sigmasWad.push(s);
  }
  return { musWad, sigmasWad };
}

/**
 * Render a fitted Gaussian back as `(x, y)` samples in outcome coordinates so the
 * UI can draw the *exact* curve the contract will store. `λ` is the
 * `‖λφ‖₂ = k` scaling the AMM uses, so the rendered height is the real payout
 * curve, not a normalised bump.
 */
export function renderGaussian(
  fit: GaussianFit,
  market: { kWad: bigint },
  xs: readonly number[],
): DrawnPoint[] {
  const lam = lambda(market.kWad, fit.sigmaWad);
  return xs.map((x) => ({
    x,
    y: fromWad(gaussianPdfScaled(fit.muWad, fit.sigmaWad, lam, toWad(x))),
  }));
}
