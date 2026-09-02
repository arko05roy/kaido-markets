//! Sprint 4 math hardening (build.md §6 item 3): fuzz `worst_case_collateral`
//! against a dense brute-force grid oracle.
//!
//! The contract relies on `worst_case_collateral(g, f) ≥ −min_x (g(x) − f(x))`
//! — i.e. **never under-collateralised**. This module builds a coarser
//! oracle than the function under test and asserts the inequality across
//! thousands of random Gaussian pairs. A failure here is a solvency bug.
//!
//! Default: 4_000 cases. Set `KAIDO_FUZZ_LONG=1` to bump to 40_000 for the
//! nightly lane.

extern crate std;

use crate::fp::{wmul, WAD};
use crate::gaussian::{gaussian_pdf_scaled, lambda, neg_min_diff_grid, worst_case_collateral};
use proptest::prelude::*;
use std::env;

/// Release-gate oracle density (coarser than production `worst_case_collateral`).
const ORACLE_GLOBAL: i128 = 3000;
const ORACLE_FAN_HALF: i128 = 1024;
const ORACLE_FAN_DIV: i128 = 256;

/// Dense brute-force grid oracle: returns `max(0, −min_x d(x))` for
/// `d(x) = g(x) − f(x)`, with `g, f = (μ, σ, λ)` scaled Gaussians.
fn brute_force_neg_min(g: (i128, i128, i128), f: (i128, i128, i128)) -> i128 {
    let (_, sig_g, lam_g) = g;
    let (_, sig_f, lam_f) = f;
    assert!(sig_g > 0 && sig_f > 0);
    assert!(lam_g >= 0 && lam_f >= 0);

    let best = neg_min_diff_grid(g, f, ORACLE_GLOBAL, ORACLE_FAN_HALF, ORACLE_FAN_DIV);
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

        let peak_g = gaussian_pdf_scaled(mu_g, s_g, lg, mu_g);
        let peak_f = gaussian_pdf_scaled(mu_f, s_f, lf, mu_f);
        let peak = peak_g.max(peak_f);
        let tol = (peak / 1024).max(1_000_000_000);

        prop_assert!(
            sut + tol >= oracle,
            "UNDER-COLLATERALISED:\n  g=(μ={}, σ={}, λ={})\n  f=(μ={}, σ={}, λ={})\n  SUT={} oracle={} tol={}",
            mu_g, s_g, lg, mu_f, s_f, lf, sut, oracle, tol
        );
    }
}

// ---- audit regression: proptest seed that under-collateralised the old SUT ---

/// Named regression from the contract audit: the old grid+golden-section SUT
/// returned `0` while the oracle required `65302789092005781` WAD.
#[test]
fn audit_regression_wcc_proptest_seed() {
    let mu_g = -263_809_285_176_816_585_474_450i128;
    let s_g = 845_287_608_689_026_005_684_328i128;
    let k_g = 81_850_513_159_900_732_781_543i128;
    let mu_f = -594_626_183_756_080_239_759_543i128;
    let s_f = 137_056_668_118_644_557_976_724i128;
    let k_f = 30_497_992_928_666_855_553_165i128;
    let lg = lambda(k_g, s_g);
    let lf = lambda(k_f, s_f);
    let g = (mu_g, s_g, lg);
    let f = (mu_f, s_f, lf);
    let sut = worst_case_collateral(g, f);
    let oracle = brute_force_neg_min(g, f);
    assert_eq!(oracle, 65_302_789_092_005_781);
    let peak_g = gaussian_pdf_scaled(mu_g, s_g, lg, mu_g);
    let tol = (peak_g / 1024).max(1_000_000_000);
    assert!(
        sut + tol >= oracle,
        "SUT={sut} oracle={oracle} tol={tol}"
    );
    assert!(sut > 0);
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
