//! Capped-Gaussian primitives (whitepaper §10 option 2, ADR-3).
//!
//! `f(x) = min(b, λ·φ_{μ,σ}(x))` with `λ` chosen so `‖f‖₂ = k`. The λ-solve is
//! a fixed-point bisection over `capped_l2_norm_squared`; the norm itself is a
//! trapezoidal quadrature (same ±14σ bracket as `worst_case_collateral`).

use crate::consts::SQRT_2PI;
use crate::fp::{sqrt_wad, wdiv, wmul, WAD};
use crate::gaussian::{gaussian_pdf_scaled, lambda as uncapped_lambda};

/// `min(b, λ·φ_{μ,σ}(x))` — the capped payout density (WAD).
pub fn capped_gaussian_pdf_scaled(
    mu_wad: i128,
    sigma_wad: i128,
    lambda_wad: i128,
    b_wad: i128,
    x_wad: i128,
) -> i128 {
    let raw = gaussian_pdf_scaled(mu_wad, sigma_wad, lambda_wad, x_wad);
    raw.min(b_wad)
}

/// `‖min(b, λ·φ_{μ,σ})‖₂²` — the squared L² norm (WAD² outcome-units).
///
/// Integrated by trapezoidal rule over `[μ − 14σ, μ + 14σ]`; both tails are
/// `< 1e-40` of the peak beyond that bracket.
pub fn capped_l2_norm_squared(mu_wad: i128, sigma_wad: i128, lambda_wad: i128, b_wad: i128) -> i128 {
    assert!(sigma_wad > 0, "capped_l2_norm_squared: sigma must be > 0");
    assert!(lambda_wad >= 0, "capped_l2_norm_squared: lambda must be >= 0");
    assert!(b_wad > 0, "capped_l2_norm_squared: b must be > 0");
    let span = sigma_wad.saturating_mul(14);
    let lo = mu_wad.saturating_sub(span);
    let hi = mu_wad.saturating_add(span);
    const N: i128 = 256;
    let step = if hi > lo { (hi - lo) / N } else { 1 };
    let pdf = |x: i128| capped_gaussian_pdf_scaled(mu_wad, sigma_wad, lambda_wad, b_wad, x);
    let mut sum = pdf(lo) * pdf(lo) + pdf(hi) * pdf(hi);
    let mut x = lo;
    let mut i = 0;
    while i < N - 1 {
        x = x.saturating_add(step);
        if x > hi {
            break;
        }
        let p = pdf(x);
        sum += 2 * p * p;
        i += 1;
    }
    // trapezoid: (step/2) · Σ; outcome-units are WAD so the integral of f²
    // is in WAD² — multiply by step (already WAD) and divide by 2.
    (sum * step) / (2 * WAD)
}

/// `λ` such that `‖min(b, λ·φ_{μ,σ})‖₂ = k`. Bisection when the uncapped peak
/// exceeds `b`; otherwise defers to the closed-form uncapped `lambda(k, σ)`.
pub fn capped_lambda(k_wad: i128, sigma_wad: i128, b_wad: i128) -> i128 {
    assert!(k_wad >= 0, "capped_lambda: k must be >= 0");
    assert!(sigma_wad > 0, "capped_lambda: sigma must be > 0");
    assert!(b_wad > 0, "capped_lambda: b must be > 0");
    let mu = 0i128; // norm is translation-invariant
    let uncapped_lam = uncapped_lambda(k_wad, sigma_wad);
    let peak = wdiv(uncapped_lam, wmul(sigma_wad, SQRT_2PI));
    if peak <= b_wad {
        return uncapped_lam;
    }
    let target = wmul(k_wad, k_wad); // k²
    // λ large enough that the cap is never hit ⇒ ‖f‖₂² ≈ b² · width_cap
    let mut hi = uncapped_lam;
    while capped_l2_norm_squared(mu, sigma_wad, hi, b_wad) < target {
        hi = hi.saturating_mul(2);
        if hi <= 0 || hi > i128::MAX / 4 {
            break;
        }
    }
    let mut lo = 0i128;
    for _ in 0..96 {
        let mid = lo + (hi - lo) / 2;
        if mid == lo {
            break;
        }
        if capped_l2_norm_squared(mu, sigma_wad, mid, b_wad) < target {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    hi
}

/// Worst-case collateral for a capped-Gaussian trade `f → g`.
pub fn capped_worst_case_collateral(
    g: (i128, i128, i128),
    f: (i128, i128, i128),
    b_wad: i128,
) -> i128 {
    let (mu_g, sig_g, lam_g) = g;
    let (mu_f, sig_f, lam_f) = f;
    assert!(sig_g > 0 && sig_f > 0, "capped_worst_case_collateral: sigma > 0");
    assert!(b_wad > 0, "capped_worst_case_collateral: b > 0");

    let d = |x: i128| -> i128 {
        capped_gaussian_pdf_scaled(mu_g, sig_g, lam_g, b_wad, x)
            - capped_gaussian_pdf_scaled(mu_f, sig_f, lam_f, b_wad, x)
    };

    let sig_max = sig_g.max(sig_f);
    let center_lo = mu_g.min(mu_f);
    let center_hi = mu_g.max(mu_f);
    let span = sig_max.saturating_mul(14);
    let lo = center_lo.saturating_sub(span);
    let hi = center_hi.saturating_add(span);

    let mut best_x = lo;
    let mut best_v = d(lo);
    macro_rules! consider {
        ($x:expr) => {{
            let x = $x;
            if x >= lo && x <= hi {
                let v = d(x);
                if v < best_v {
                    best_v = v;
                    best_x = x;
                }
            }
        }};
    }
    consider!(hi);
    const GLOBAL_GRID: i128 = 128;
    if hi > lo {
        let step = ((hi - lo) / GLOBAL_GRID).max(1);
        let mut x = lo;
        while x < hi {
            x = x.saturating_add(step);
            consider!(x);
        }
    }
    for &(mu, sig) in &[(mu_g, sig_g), (mu_f, sig_f)] {
        let step = (sig / 8).max(1);
        let mut j: i128 = -8;
        while j <= 8 {
            consider!(mu.saturating_add(j.saturating_mul(step)));
            j += 1;
        }
    }
    let sig_min = sig_g.min(sig_f);
    let win = {
        let gstep = if hi > lo {
            ((hi - lo) / GLOBAL_GRID).max(1)
        } else {
            1
        };
        gstep.max((sig_min / 8).max(1)).max(1)
    };
    let mut a = best_x.saturating_sub(win);
    let mut b = best_x.saturating_add(win);
    const INV_PHI: i128 = 618_033_988_749_894_848;
    let frac = |a: i128, b: i128| crate::fp::mul_div(b - a, INV_PHI, WAD);
    let mut c = b - frac(a, b);
    let mut e = a + frac(a, b);
    let mut fc = d(c);
    let mut fe = d(e);
    let mut iter = 0;
    while b - a > 1 && iter < 64 {
        if fc < fe {
            b = e;
            e = c;
            fe = fc;
            c = b - frac(a, b);
            fc = d(c);
        } else {
            a = c;
            c = e;
            fc = fe;
            e = a + frac(a, b);
            fe = d(e);
        }
        iter += 1;
    }
    let interior_min = best_v.min(fc).min(fe).min(d(a)).min(d(b)).min(d(best_x));
    if interior_min >= 0 {
        0
    } else {
        -interior_min
    }
}

/// `‖min(b, λ·φ)‖₂` (WAD).
pub fn capped_l2_norm(mu_wad: i128, sigma_wad: i128, lambda_wad: i128, b_wad: i128) -> i128 {
    sqrt_wad(capped_l2_norm_squared(mu_wad, sigma_wad, lambda_wad, b_wad))
}
