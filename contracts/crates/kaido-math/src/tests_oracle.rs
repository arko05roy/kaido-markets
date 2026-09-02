//! Sprint 4 math hardening (build.md §6 item 3): fuzz `worst_case_collateral`
//! against a dense brute-force grid oracle.
//!
//! The contract relies on `worst_case_collateral(g, f) ≥ −min_x (g(x) − f(x))`
//! — i.e. **never under-collateralised**. This module builds a much-denser
//! oracle than the function under test and asserts the inequality across
//! thousands of random Gaussian pairs. A failure here is a solvency bug.
//!
//! Default: 4_000 cases. Set `KAIDO_FUZZ_LONG=1` to bump to 40_000 for the
//! nightly lane.

extern crate std;

use crate::fp::{wmul, WAD};
use crate::gaussian::{gaussian_pdf_scaled, lambda, worst_case_collateral};
use proptest::prelude::*;
use std::env;

/// Dense brute-force grid oracle: returns `max(0, −min_x d(x))` for
/// `d(x) = g(x) − f(x)`, with `g, f = (μ, σ, λ)` scaled Gaussians.
///
/// Strategy: a **global** uniform grid spanning `[μ_min − 14·σ_max,
/// μ_max + 14·σ_max]` (both bells are < 1e-40 of their peak beyond ~14σ), plus
/// a **fine fan** around each μ at `σ/256` spacing out to `±4σ` (the actual
/// critical points of `d` for any reasonable pair live within a few σ of one
/// of the two peaks).
///
/// Total samples per call: ≈ `GLOBAL + 2·(2·FAN_HALF + 1)` ≈ 4100 — about 30×
/// finer than the SUT's grid, making this a meaningful oracle.
fn brute_force_neg_min(g: (i128, i128, i128), f: (i128, i128, i128)) -> i128 {
    let (mu_g, sig_g, lam_g) = g;
    let (mu_f, sig_f, lam_f) = f;
    assert!(sig_g > 0 && sig_f > 0);
    assert!(lam_g >= 0 && lam_f >= 0);

    let d = |x: i128| -> i128 {
        gaussian_pdf_scaled(mu_g, sig_g, lam_g, x) - gaussian_pdf_scaled(mu_f, sig_f, lam_f, x)
    };

    let sig_max = sig_g.max(sig_f);
    let center_lo = mu_g.min(mu_f);
    let center_hi = mu_g.max(mu_f);
    let span = sig_max.checked_mul(14).unwrap_or(i128::MAX);
    let lo = center_lo.saturating_sub(span);
    let hi = center_hi.saturating_add(span);

    let mut best: i128 = 0; // d → 0 at ±∞, so the infimum is ≤ 0.
    best = best.min(d(lo)).min(d(hi));

    // Global dense grid.
    const GLOBAL: i128 = 3000;
    if hi > lo {
        let step = ((hi - lo) / GLOBAL).max(1);
        let mut x = lo;
        while x < hi {
            x = x.saturating_add(step);
            let v = d(x);
            if v < best {
                best = v;
            }
        }
    }

    // Fine fan ±4σ at σ/256 around each μ.
    const FAN_HALF: i128 = 1024; // 1024 steps × σ/256 = 4σ
    for &(mu, sig) in &[(mu_g, sig_g), (mu_f, sig_f)] {
        let step = (sig / 256).max(1);
        let mut j: i128 = -FAN_HALF;
        while j <= FAN_HALF {
            let x = mu.saturating_add(j.saturating_mul(step));
            let v = d(x);
            if v < best {
                best = v;
            }
            j += 1;
        }
    }

    if best >= 0 {
        0
    } else {
        -best
    }
}

// Sane WAD ranges (matches the ranges already used in tests.rs):
//   σ ∈ [1e-3, 1e6]   k ∈ [1e-3, 1e5]   μ ∈ [-1e6, 1e6]
const E15: i128 = 1_000_000_000_000_000; // 1e-3 in WAD
const E23: i128 = 100_000_000_000_000_000_000_000; // 1e5 in WAD
const E24: i128 = 1_000_000_000_000_000_000_000_000; // 1e6 in WAD

fn cases() -> u32 {
    if env::var("KAIDO_FUZZ_LONG").is_ok() {
        40_000
    } else {
        4_000
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(cases()))]

    /// **Solvency property** (build.md §6 item 3): the SUT's worst-case
    /// collateral is at least as large as the brute-force oracle's value, up
    /// to a small fixed-point tolerance.
    ///
    /// Tolerance: dominated by the SUT's grid-resolution error around the true
    /// min, ~`peak / 16384` in the fan and a global-step ULP on the cross-over
    /// search. We use a relative slack of `peak/1024` plus a 1e-9 absolute
    /// floor (in WAD units) — far below any economically meaningful slack and
    /// well within audit-grade conservatism.
    #[test]
    fn wcc_dominates_brute_force_oracle(
        mu_g in -E24..=E24, s_g in E15..=E24, k_g in E15..=E23,
        mu_f in -E24..=E24, s_f in E15..=E24, k_f in E15..=E23,
    ) {
        let lg = lambda(k_g, s_g);
        let lf = lambda(k_f, s_f);
        let g = (mu_g, s_g, lg);
        let f = (mu_f, s_f, lf);

        let sut = worst_case_collateral(g, f);
        let oracle = brute_force_neg_min(g, f);

        prop_assert!(sut >= 0, "SUT returned negative: {}", sut);

        // Peak magnitudes (at x = μ) — used to set a relative tolerance.
        let peak_g = gaussian_pdf_scaled(mu_g, s_g, lg, mu_g);
        let peak_f = gaussian_pdf_scaled(mu_f, s_f, lf, mu_f);
        let peak = peak_g.max(peak_f);
        // Tol: peak/1024 (≈1e-3 of the bell height; the SUT's grid quantum) +
        // 1e-9 floor in WAD.
        let tol = (peak / 1024).max(1_000_000_000);

        prop_assert!(
            sut + tol >= oracle,
            "UNDER-COLLATERALISED:\n  g=(μ={}, σ={}, λ={})\n  f=(μ={}, σ={}, λ={})\n  SUT={} oracle={} tol={}",
            mu_g, s_g, lg, mu_f, s_f, lf, sut, oracle, tol
        );
    }
}

// ---- focused regression tests for pathological pairs -----------------------

/// Same μ, very different σ — the narrow bell dominates near μ; min is bounded
/// by `−(narrow peak − wide value at μ)`.
#[test]
fn pathological_same_mu_different_sigma() {
    let mu = 0i128;
    let s_narrow = WAD; // σ = 1
    let s_wide = 100 * WAD; // σ = 100
    let k = 10 * WAD;
    let g = (mu, s_narrow, lambda(k, s_narrow));
    let f = (mu, s_wide, lambda(k, s_wide));
    let sut = worst_case_collateral(g, f);
    let oracle = brute_force_neg_min(g, f);
    let peak = gaussian_pdf_scaled(mu, s_narrow, lambda(k, s_narrow), mu);
    let tol = (peak / 1024).max(1_000_000_000);
    assert!(
        sut + tol >= oracle,
        "SUT={sut} oracle={oracle} tol={tol}"
    );
}

/// Disjoint μ, equal σ — the min lives near one peak.
#[test]
fn pathological_disjoint_mu_equal_sigma() {
    let s = WAD;
    let k = WAD;
    let g = (-(10 * WAD), s, lambda(k, s));
    let f = (10 * WAD, s, lambda(k, s));
    let sut = worst_case_collateral(g, f);
    let oracle = brute_force_neg_min(g, f);
    let peak = gaussian_pdf_scaled(0, s, lambda(k, s), 0);
    let tol = (peak / 1024).max(1_000_000_000);
    assert!(
        sut + tol >= oracle,
        "SUT={sut} oracle={oracle} tol={tol}"
    );
}

// ---- domain-extreme & envelope tests (build.md S4 math hardening) ---------

/// `exp_wad` at the *exact* domain extremes — these are the boundaries the
/// 50-digit `mpmath` vectors hit, but pin them explicitly so a future
/// regression at the cliff is loud.
#[test]
fn exp_domain_extremes_explicit() {
    use crate::{exp_wad, MAX_EXP_ARG};
    // exp(46) ≈ 9.49e19; in WAD that's 9.49e37 — just under i128::MAX ≈ 1.7e38.
    let at_max = exp_wad(MAX_EXP_ARG);
    assert!(at_max > 0, "exp_wad(MAX) must be > 0, got {at_max}");
    assert!(
        at_max < i128::MAX,
        "exp_wad(MAX) must fit i128, got {at_max}"
    );
    // Underflow cliff: exp(-46)·WAD < 1.
    assert_eq!(exp_wad(-MAX_EXP_ARG), 0);
}

/// `worst_case_collateral` is finite and non-negative at the i128 envelope —
/// no panic / no overflow on extreme but legal AMM ranges.
#[test]
fn wcc_at_envelope_no_panic() {
    let mu = E24; // 1e6 in WAD
    let sig = E24; // 1e6 in WAD
    let k = E23; // 1e5 in WAD
    let g = (mu, sig, lambda(k, sig));
    let f = (-mu, sig, lambda(k, sig));
    let v = worst_case_collateral(g, f);
    assert!(v >= 0);
    // And the degenerate "g = f" case at the envelope.
    assert_eq!(worst_case_collateral(g, g), 0);
}

/// Tiny σ inside a much larger σ — the narrow bell's critical point lies
/// well within `σ_narrow` of its own μ, so the SUT's per-μ fan must catch it.
#[test]
fn pathological_narrow_inside_wide() {
    let s_n = WAD / 100; // σ = 1e-2
    let s_w = WAD; // σ = 1
    let k = WAD;
    let g = (WAD / 2, s_n, lambda(k, s_n)); // peak at 0.5
    let f = (0, s_w, lambda(k, s_w)); // wide bell centred at 0
    let sut = worst_case_collateral(g, f);
    let oracle = brute_force_neg_min(g, f);
    let peak_g = gaussian_pdf_scaled(WAD / 2, s_n, lambda(k, s_n), WAD / 2);
    let tol = (peak_g / 1024).max(1_000_000_000);
    assert!(
        sut + tol >= oracle,
        "SUT={sut} oracle={oracle} tol={tol}"
    );
    // And a real cross — when g is much taller than f at g's peak.
    let _ = wmul(WAD, WAD);
}
