//! `erf_wad` / `erfc_wad` — the fixed-point error function and its complement.
//!
//! `erf` and `erfc` are used by the **capped-Gaussian** path (whitepaper §10
//! option 2, build.md E7, Sprint 5); they are implemented and pinned now per
//! build.md Sprint 1. Strategy (see ADR-1):
//!
//! * `|x| ≤ SERIES_THRESHOLD` — the convergent Maclaurin series for `erf`. In
//!   fixed point the per-term truncation is *absolute* (≤ 1 WAD ULP of the
//!   term's value), so even though the partial sums swing to `±` the peak term
//!   (`≈ 1200` at `x = 4`), the result's accumulated error stays `≲ 1e-14` —
//!   far below 1e-9. `erfc = 1 − erf`.
//! * `SERIES_THRESHOLD < |x| < SATURATION` — the Laplace continued fraction for
//!   `erfc(|x|)`
//!   (all-positive convergents → no cancellation), `erf = 1 − erfc`.
//! * `|x| ≥ SATURATION` (`= 7`) — `erf = ±WAD`, `erfc = 0` (or `2·WAD`);
//!   `erfc(7) ≈ 4e-23` already rounds to 0 in WAD.
//!
//! Accuracy: relative error ≤ 1e-9 over the supported domain `[-7, 7]`
//! (`|x| ≥ 7` returns the saturated value; `erfc`'s *relative* error degrades
//! only where `erfc` is so small it rounds to 0, and `erf` stays accurate
//! everywhere). Verified against 50-digit `mpmath` vectors in
//! `docs/test-vectors/erf.json`.

use crate::consts::{SQRT_PI, TWO_OVER_SQRT_PI};
use crate::exp::exp_wad;
use crate::fp::{mul_div, wmul, WAD};

const TWO_WAD: i128 = 2 * WAD;
/// `|x| ≤ this` ⇒ Maclaurin series; above ⇒ Laplace continued fraction. Set to
/// 4 so the CF is only used where it converges fast (at `|x| > 4` the CF needs
/// `≲ 30` iterations); the series is well-conditioned through `x = 4`.
const SERIES_THRESHOLD: i128 = 4 * WAD;
/// `|x| ≥ this` ⇒ `erf` is `±WAD` and `erfc` is `0` / `2·WAD` to within a ULP
/// (`erfc(7) ≈ 4e-23` → 0 in WAD, `erf(7)` → WAD). For `|x| < 7` the CF path
/// is still used so values like `erfc(6) ≈ 21.5 ULPs` come out right.
const SATURATION: i128 = 7 * WAD;
/// Iteration cap for the Maclaurin series. Convergence to a WAD ULP needs
/// `≈ 30` terms at `x = 2` and `≈ 80` at `x = 4`.
const SERIES_MAX_ITERS: i128 = 110;

/// `erf(x / WAD) · WAD`, rounded toward zero.
pub fn erf_wad(x: i128) -> i128 {
    let (erf_pos, _) = erf_erfc_abs(x.unsigned_abs());
    if x >= 0 {
        erf_pos
    } else {
        -erf_pos
    }
}

/// `erfc(x / WAD) · WAD = (1 − erf(x)) · WAD`, rounded toward zero.
pub fn erfc_wad(x: i128) -> i128 {
    let (_, erfc_pos) = erf_erfc_abs(x.unsigned_abs());
    if x >= 0 {
        erfc_pos
    } else {
        TWO_WAD - erfc_pos
    }
}

/// Returns `(erf(a)·WAD, erfc(a)·WAD)` for `a = |x|` given as a `u128` WAD value.
fn erf_erfc_abs(a_u: u128) -> (i128, i128) {
    // a ≤ 7·WAD comfortably fits i128.
    let a = a_u as i128;
    if a == 0 {
        return (0, WAD);
    }
    if a >= SATURATION {
        return (WAD, 0);
    }
    if a <= SERIES_THRESHOLD {
        let erf = erf_series(a);
        (erf, WAD - erf)
    } else {
        let erfc = erfc_cf(a);
        (WAD - erfc, erfc)
    }
}

/// `erf(a)·WAD` via the Maclaurin series, for `0 < a ≤ SERIES_THRESHOLD`.
///
/// `erf(a) = (2/√π) · Σ_{n≥0} (−1)^n a^{2n+1} / (n!·(2n+1))`.
/// Iterate `t_n = t_{n-1} · (−a²) · (2n−1) / (n·(2n+1))` with `t_0 = a`.
fn erf_series(a: i128) -> i128 {
    let a2 = wmul(a, a); // a² in WAD
    let mut term = a; // t_0 = a
    let mut sum = a;
    let mut n: i128 = 1;
    loop {
        // t_n = t_{n-1} · (−a²) · (2n−1) / (n·(2n+1))
        let t = wmul(term, a2); // |t_{n-1}|·a²
        let t = mul_div(t, 2 * n - 1, n * (2 * n + 1));
        term = -t; // the (−1)^n alternation
        sum += term;
        if term == 0 {
            break;
        }
        n += 1;
        if n > SERIES_MAX_ITERS {
            break; // safety; see SERIES_MAX_ITERS
        }
    }
    // erf = (2/√π) · sum
    wmul(TWO_OVER_SQRT_PI, sum)
}

/// `erfc(a)·WAD` via the Laplace continued fraction, for `SERIES_THRESHOLD < a < SATURATION`.
///
/// `√π · e^{a²} · erfc(a) = F`, where (DLMF 7.9.1)
/// `F = a + (1/2)/(a + 1/(a + (3/2)/(a + 2/(a + …))))`,  i.e. the continued
/// fraction with `b_0 = b_k = a` and `a_k = k/2`. Evaluated by modified Lentz.
fn erfc_cf(a: i128) -> i128 {
    let tiny: i128 = 1; // Lentz's "epsilon substitute", in WAD ULPs
    let mut f = a; // b_0
    let mut c = f;
    let mut d: i128 = 0;
    let mut k: i128 = 1;
    loop {
        // a_k = k/2  ⇒  a_k·d = d·k/2 ;  a_k/c = (k·WAD)/(2·c)
        // D_k = b_k + a_k·D_{k-1}
        // a_k·D_{k-1} in WAD = (k/2)·d  ⇒  k·d / 2  (a_k is a pure number, so
        // multiplying the WAD value `d` by k/2 needs no extra WAD factor).
        d = a + mul_div(d, k, 2);
        if d == 0 {
            d = tiny;
        }
        // a_k/C_{k-1} in WAD = ((k/2)·WAD / c)·WAD = k·WAD² / (2·c)
        // (256-bit intermediate handles the WAD²).
        c = a + mul_div(k * WAD, WAD, 2 * c);
        if c == 0 {
            c = tiny;
        }
        d = mul_div(WAD, WAD, d); // D_k ← 1/D_k
        let delta = mul_div(c, d, WAD); // Δ_k = C_k·D_k
        f = mul_div(f, delta, WAD); // f ← f·Δ_k
        if (delta - WAD).abs() <= 1 {
            break;
        }
        k += 1;
        if k > 300 {
            break; // safety; the CF is slowest near a = 4 (≈ 150 iters) and
                   // fast above (≈ 30 at a = 5, ≈ 20 at a = 5.9). Even an
                   // unconverged tail leaves `erf = 1 − erfc` accurate, since
                   // `erfc` is already tiny there.
        }
    }
    // erfc(a) = e^{-a²} / (√π · F)
    let a2 = wmul(a, a); // a² in WAD (a < 7 ⇒ a² < 49); exp_wad accepts any
                         // non-positive arg and underflows to 0 in the tail.
    let exp_neg_a2 = exp_wad(-a2);
    let denom = wmul(SQRT_PI, f); // √π · F
    if denom <= 0 {
        return 0;
    }
    mul_div(exp_neg_a2, WAD, denom)
}
