//! Tests for `kaido-math`:
//!  * **conformance** against the 50-digit `mpmath` reference vectors in
//!    `docs/test-vectors/` (the cross-language source of truth, ADR-1/ADR-8);
//!  * **property tests** (`proptest`, ≥ 10k cases) for the invariants the
//!    AMM relies on (build.md §4, §6 item 2).
//!
//! Tests always link `std`, so `serde_json` and `proptest` are fine here even
//! though the crate proper is `#![no_std]`.

extern crate std;

use crate::consts::SQRT_2PI;
use crate::fp::{wdiv, wmul, WAD};
use crate::*;
use proptest::prelude::*;
use serde_json::Value;
use std::string::String;
use std::vec::Vec;

// ---- vector-file helpers ---------------------------------------------------

const EXP_JSON: &str = include_str!("../../../../docs/test-vectors/exp.json");
const ERF_JSON: &str = include_str!("../../../../docs/test-vectors/erf.json");
const GAUSSIAN_JSON: &str = include_str!("../../../../docs/test-vectors/gaussian.json");
const WORST_JSON: &str = include_str!("../../../../docs/test-vectors/worst_case_collateral.json");

fn parse(src: &str) -> Value {
    serde_json::from_str(src).expect("vector file is valid JSON")
}

/// Read a stringified integer field.
fn vi(v: &Value, key: &str) -> i128 {
    v[key]
        .as_str()
        .unwrap_or_else(|| panic!("missing field {key} in {v}"))
        .parse()
        .unwrap_or_else(|_| panic!("field {key} is not an i128 in {v}"))
}

fn note(v: &Value) -> String {
    v.get("note")
        .or_else(|| v.get("label"))
        .and_then(|n| n.as_str())
        .unwrap_or("")
        .into()
}

fn check(name: &str, note: &str, got: i128, expected: i128, tol: i128) {
    let diff = (got - expected).abs();
    assert!(
        diff <= tol,
        "{name} [{note}]: got {got}, expected {expected}, |Δ|={diff} > tol {tol}"
    );
}

// ---- conformance: exp ------------------------------------------------------

#[test]
fn conformance_exp() {
    let v = parse(EXP_JSON);
    // sanity: the vector file's WAD matches ours
    assert_eq!(vi(&v, "_wad"), WAD);
    let vecs = v["vectors"].as_array().unwrap();
    assert!(vecs.len() >= 20);
    for tc in vecs {
        let x = vi(tc, "x_wad");
        let got = exp_wad(x);
        check(
            "exp_wad",
            &note(tc),
            got,
            vi(tc, "expected_wad"),
            vi(tc, "tol_abs"),
        );
    }
}

#[test]
#[should_panic(expected = "out of domain")]
fn exp_wad_panics_above_domain() {
    let _ = exp_wad(MAX_EXP_ARG + 1);
}

// ---- conformance: erf / erfc ----------------------------------------------

#[test]
fn conformance_erf() {
    let v = parse(ERF_JSON);
    for (key, f) in [
        ("erf", erf_wad as fn(i128) -> i128),
        ("erfc", erfc_wad as fn(i128) -> i128),
    ] {
        let vecs = v[key].as_array().unwrap();
        assert!(vecs.len() >= 20);
        for tc in vecs {
            let x = vi(tc, "x_wad");
            check(
                key,
                &note(tc),
                f(x),
                vi(tc, "expected_wad"),
                vi(tc, "tol_abs"),
            );
        }
    }
}

// ---- conformance: gaussian -------------------------------------------------

#[test]
fn conformance_gaussian() {
    let v = parse(GAUSSIAN_JSON);

    for tc in v["l2_norm"].as_array().unwrap() {
        let got = gaussian_l2_norm(vi(tc, "sigma_wad"));
        check(
            "gaussian_l2_norm",
            &note(tc),
            got,
            vi(tc, "expected_wad"),
            vi(tc, "tol_abs"),
        );
    }
    for tc in v["lambda"].as_array().unwrap() {
        let got = lambda(vi(tc, "k_wad"), vi(tc, "sigma_wad"));
        check(
            "lambda",
            &note(tc),
            got,
            vi(tc, "expected_wad"),
            vi(tc, "tol_abs"),
        );
    }
    for tc in v["pdf_scaled"].as_array().unwrap() {
        let got = gaussian_pdf_scaled(
            vi(tc, "mu_wad"),
            vi(tc, "sigma_wad"),
            vi(tc, "lambda_wad"),
            vi(tc, "x_wad"),
        );
        check(
            "gaussian_pdf_scaled",
            &note(tc),
            got,
            vi(tc, "expected_wad"),
            vi(tc, "tol_abs"),
        );
    }
    for tc in v["sigma_floor"].as_array().unwrap() {
        let got = sigma_floor(vi(tc, "k_wad"), vi(tc, "b_wad"));
        check(
            "sigma_floor",
            &note(tc),
            got,
            vi(tc, "expected_wad"),
            vi(tc, "tol_abs"),
        );
    }
}

// ---- conformance: worst_case_collateral -----------------------------------

#[test]
fn conformance_worst_case_collateral() {
    let v = parse(WORST_JSON);
    let vecs = v["vectors"].as_array().unwrap();
    assert!(vecs.len() >= 10);
    for tc in vecs {
        let g = (
            vi(&tc["g"], "mu_wad"),
            vi(&tc["g"], "sigma_wad"),
            vi(&tc["g"], "lambda_wad"),
        );
        let f = (
            vi(&tc["f"], "mu_wad"),
            vi(&tc["f"], "sigma_wad"),
            vi(&tc["f"], "lambda_wad"),
        );
        let got = worst_case_collateral(g, f);
        assert!(
            got >= 0,
            "worst_case_collateral must be >= 0 [{}]",
            note(tc)
        );
        check(
            "worst_case_collateral",
            &note(tc),
            got,
            vi(tc, "expected_wad"),
            vi(tc, "tol_abs"),
        );
    }
}

// ---- property tests: AMM invariants ---------------------------------------

// Sane WAD ranges (real magnitudes in the comments):
//   σ ∈ [1e-3, 1e6]   k ∈ [1e-3, 1e5]   b ∈ [1e-2, 1e6]   μ,x ∈ [-1e6, 1e6]
// Wide enough to be a real stress test; bounded so every product stays inside
// the i128 WAD envelope.
const E15: i128 = 1_000_000_000_000_000; // 1e-3 in WAD
const E23: i128 = 100_000_000_000_000_000_000_000; // 1e5 in WAD
const E16: i128 = 10_000_000_000_000_000; // 1e-2 in WAD
const E24: i128 = 1_000_000_000_000_000_000_000_000; // 1e6 in WAD
fn sigma() -> impl Strategy<Value = i128> {
    E15..=E24
}
fn k_val() -> impl Strategy<Value = i128> {
    E15..=E23
}
fn b_val() -> impl Strategy<Value = i128> {
    E16..=E24
}
fn coord() -> impl Strategy<Value = i128> {
    -E24..=E24
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(15_000))]

    /// `l2_norm` is monotonically non-increasing in σ (strictly decreasing in
    /// exact arithmetic; ties only where truncation collapses two very close
    /// inputs).
    #[test]
    fn l2_norm_monotone_in_sigma(s1 in sigma(), s2 in sigma()) {
        let (lo, hi) = if s1 <= s2 { (s1, s2) } else { (s2, s1) };
        prop_assert!(gaussian_l2_norm(lo) >= gaussian_l2_norm(hi),
            "l2_norm not monotone: σ={} -> {}, σ={} -> {}", lo, gaussian_l2_norm(lo), hi, gaussian_l2_norm(hi));
    }

    /// `‖λ·φ_{μ,σ}‖₂ = k` (whitepaper §11), within fixed-point slack.
    #[test]
    fn lambda_makes_norm_equal_k(k in k_val(), s in sigma()) {
        let lam = lambda(k, s);
        let norm = wmul(lam, gaussian_l2_norm(s));
        let tol = (k / 1_000_000_000i128).max(16); // 1e-9 relative + floor
        prop_assert!((norm - k).abs() <= tol, "‖f‖₂={} != k={} (tol {})", norm, k, tol);
    }

    /// The peak of `λ·φ_{μ,σ}` is at `x = μ` and equals `λ/(σ√(2π))` exactly
    /// (`exp_wad(0) == WAD` ⇒ the multiply is exact), and no other point
    /// exceeds it.
    #[test]
    fn pdf_peak_at_mu(mu in coord(), s in sigma(), k in k_val(), dx in coord()) {
        let lam = lambda(k, s);
        let peak = wdiv(lam, wmul(s, SQRT_2PI));
        prop_assert_eq!(gaussian_pdf_scaled(mu, s, lam, mu), peak);
        prop_assert!(gaussian_pdf_scaled(mu, s, lam, mu.saturating_add(dx)) <= peak);
    }

    /// At `σ = σ_min(k, b)` the peak of `λ·φ` is `≈ b` (whitepaper §10 option 1;
    /// the *exact* solvency guarantee `peak ≤ b` is enforced by the
    /// `distribution-market` constructor, which re-checks it after rounding).
    #[test]
    fn sigma_floor_caps_peak_near_b(k in k_val(), b in b_val()) {
        let s_min = sigma_floor(k, b);
        prop_assume!(s_min > 0);
        let lam = lambda(k, s_min);
        let peak = wdiv(lam, wmul(s_min, SQRT_2PI));
        // `σ_min` is `⌊(k/b)²/√π⌋` in WAD ULPs — for extreme `k/b` it rounds to
        // a small integer, so it carries up to `~1/s_min` relative error, which
        // propagates (halved) to `peak ≈ b`. Slack ≈ `b/s_min`, plus a floor.
        // (The *exact* `peak ≤ b` solvency guarantee is the constructor's
        // re-check, not this approximate property.)
        let tol = (b / s_min) * 4 + 1_000_000_000i128;
        prop_assert!((peak - b).abs() <= tol, "peak={} != b={} (tol {}, s_min={})", peak, b, tol, s_min);
    }
}

proptest! {
    // `worst_case_collateral` runs a grid + golden-section search, so each case
    // is ~10³ Gaussian evaluations — keep the count modest.
    #![proptest_config(ProptestConfig::with_cases(400))]

    /// `worst_case_collateral` is never negative (build.md §6 item 3; the
    /// "never *under*-collateralised" direction is hardened in Sprint 4), and
    /// it is exactly `0` when the curve doesn't move.
    #[test]
    fn worst_case_collateral_nonneg(
        mu_g in coord(), s_g in sigma(), k_g in k_val(),
        mu_f in coord(), s_f in sigma(), k_f in k_val(),
    ) {
        let g = (mu_g, s_g, lambda(k_g, s_g));
        let f = (mu_f, s_f, lambda(k_f, s_f));
        prop_assert!(worst_case_collateral(g, f) >= 0);
        prop_assert_eq!(worst_case_collateral(g, g), 0);
        prop_assert_eq!(worst_case_collateral(f, f), 0);
    }
}

// ---- a couple of plain unit tests for the obvious cases --------------------

#[test]
fn exp_zero_is_one() {
    assert_eq!(exp_wad(0), WAD);
}

#[test]
fn erf_zero_is_zero_erfc_zero_is_one() {
    assert_eq!(erf_wad(0), 0);
    assert_eq!(erfc_wad(0), WAD);
    assert_eq!(erf_wad(7 * WAD), WAD);
    assert_eq!(erf_wad(-7 * WAD), -WAD);
}

#[test]
fn l2_norm_strictly_decreasing_on_separated_inputs() {
    let mut prev = i128::MAX;
    for e in 0..12 {
        // σ = 10^e in WAD-ish steps:  σ = 10^(e-3) · WAD  → [1e-3, 1e8]
        let sigma = WAD / 1000 * 10i128.pow(e);
        let n = gaussian_l2_norm(sigma);
        assert!(n < prev, "l2_norm({sigma}) = {n} not < {prev}");
        prev = n;
    }
}

#[test]
fn worst_case_zero_when_g_equals_f() {
    let g = (123 * WAD, 7 * WAD, lambda(50 * WAD, 7 * WAD));
    assert_eq!(worst_case_collateral(g, g), 0);
}

#[test]
fn no_f64_in_public_api() {
    // A compile-time-ish smoke check: every public fn takes/returns i128 only.
    // (Documented invariant ADR-1; this just exercises the surface.)
    let _: i128 = exp_wad(WAD);
    let _: i128 = erf_wad(WAD);
    let _: i128 = erfc_wad(WAD);
    let _: i128 = gaussian_l2_norm(WAD);
    let _: i128 = lambda(WAD, WAD);
    let _: i128 = gaussian_pdf_scaled(0, WAD, WAD, 0);
    let _: i128 = sigma_floor(WAD, WAD);
    let _: i128 = worst_case_collateral((0, WAD, WAD), (0, WAD, WAD));
    let _: i128 = mul_div(WAD, WAD, WAD);
    let _: i128 = wmul(WAD, WAD);
    let _: i128 = wdiv(WAD, WAD);
    let _: i128 = sqrt_wad(WAD);
    let _: i128 = shl2(WAD, 3);
    let _: Vec<i128> = Vec::new();
}
