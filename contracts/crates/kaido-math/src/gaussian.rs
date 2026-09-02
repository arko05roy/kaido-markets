//! Gaussian primitives — the L²-norm, the λ-scaling, the scaled density, the
//! σ-floor, and the worst-case collateral of a Gaussian→Gaussian trade.
//!
//! All quantities are WAD-scaled `i128` (ADR-1, ADR-2). "Outcome units" (the
//! domain of the distribution) and "money units" share the same WAD scale here;
//! the contract converts money to/from 7-dp at its boundary.

use crate::consts::{SQRT_2PI, SQRT_PI};
use crate::exp::exp_wad;
use crate::fp::{sqrt_wad, wdiv, wmul, WAD};

/// L²-norm of the `N(μ, σ)` density: `‖φ_{μ,σ}‖₂ = √( 1 / (2σ√π) )`.
///
/// Depends only on `σ` (whitepaper §11 — "you can slide the mean for free").
/// Strictly decreasing in `σ`. Requires `σ > 0`.
pub fn gaussian_l2_norm(sigma_wad: i128) -> i128 {
    assert!(sigma_wad > 0, "gaussian_l2_norm: sigma must be > 0");
    let two_sigma = sigma_wad.checked_mul(2).expect("sigma too large");
    let denom = wmul(two_sigma, SQRT_PI); // 2σ√π
    assert!(denom > 0, "gaussian_l2_norm: degenerate sigma");
    // √(1/(2σ√π)) = 1/√(2σ√π).  Computing it this way (one sqrt, then one
    // divide) keeps far more precision than `sqrt_wad(wdiv(WAD, denom))` —
    // `wdiv(WAD, denom)` would truncate `1/(2σ√π)` to ~12 digits for large σ.
    wdiv(WAD, sqrt_wad(denom))
}

/// λ such that `‖λ · φ_{μ,σ}‖₂ = k`:  `λ = k · √(2σ√π)`  (whitepaper §11).
///
/// A *narrower* belief (smaller `σ`) has a larger L²-norm, so `λ` is smaller —
/// confident traders take mechanically smaller positions. Requires `k ≥ 0`,
/// `σ > 0`.
pub fn lambda(k_wad: i128, sigma_wad: i128) -> i128 {
    assert!(k_wad >= 0, "lambda: k must be >= 0");
    assert!(sigma_wad > 0, "lambda: sigma must be > 0");
    let two_sigma = sigma_wad.checked_mul(2).expect("sigma too large");
    let inner = wmul(two_sigma, SQRT_PI); // 2σ√π
    let root = sqrt_wad(inner); // √(2σ√π)
    wmul(k_wad, root)
}

/// `λ · φ_{μ,σ}(x) = (λ / (σ√(2π))) · exp( −(x−μ)² / (2σ²) )`.
///
/// The peak (at `x = μ`) is `λ / (σ√(2π))`. Returns `0` in the deep tail where
/// `exp` underflows below a WAD ULP. Requires `σ > 0`, `λ ≥ 0`.
pub fn gaussian_pdf_scaled(mu_wad: i128, sigma_wad: i128, lambda_wad: i128, x_wad: i128) -> i128 {
    assert!(sigma_wad > 0, "gaussian_pdf_scaled: sigma must be > 0");
    assert!(lambda_wad >= 0, "gaussian_pdf_scaled: lambda must be >= 0");
    // |z| = |x − μ| / σ ≥ 14  ⇒  exp(−z²/2) < exp(−98) < 0.5 / i128::MAX, so
    // `peak · exp(−z²/2)` rounds to 0 for *any* λ that fits i128. Bailing here
    // also keeps z² inside i128 (|z| < 14 ⇒ z² < 1.96e38, fits the 256-bit
    // intermediate and narrows fine).
    let dz = x_wad - mu_wad;
    if dz.unsigned_abs() / (sigma_wad as u128) >= 14 {
        return 0;
    }
    let z = wdiv(dz, sigma_wad); // (x − μ) / σ  (256-bit intermediate; safe)
    let z2 = wmul(z, z); // z²
    let half_z2 = z2 / 2; // z²/2 (truncates; the ≲1-ULP error is immaterial)
    let e = exp_wad(-half_z2); // exp(−z²/2) ∈ [0, WAD]  (underflows to 0 in the deep tail)
    let sigma_sqrt_2pi = wmul(sigma_wad, SQRT_2PI); // σ√(2π)
    assert!(sigma_sqrt_2pi > 0, "gaussian_pdf_scaled: degenerate sigma");
    let peak = wdiv(lambda_wad, sigma_sqrt_2pi); // λ / (σ√2π)
    wmul(peak, e)
}

/// σ-floor: the smallest `σ` for which a scaled-Gaussian payout curve still
/// satisfies `max_x f(x) ≤ b` — i.e. `σ_min(k, b) = k² / (b² · √π)`
/// (whitepaper §10 option 1). Independent of `μ`. Requires `k ≥ 0`, `b > 0`.
///
/// Computed as `(k/b)² / √π` to avoid forming `k²` (which can overflow `i128`
/// for money-scale `k`); the early truncation costs ≲ a few ULPs of relative
/// error — far below any threshold this gates.
pub fn sigma_floor(k_wad: i128, b_wad: i128) -> i128 {
    assert!(k_wad >= 0, "sigma_floor: k must be >= 0");
    assert!(b_wad > 0, "sigma_floor: b must be > 0");
    let ratio = wdiv(k_wad, b_wad); // k / b
    let ratio2 = wmul(ratio, ratio); // (k/b)²
    wdiv(ratio2, SQRT_PI) // (k/b)² / √π
}

/// Production grid density for `worst_case_collateral` (matches release-gate oracle).
const WCC_GLOBAL: i128 = 3000;
const WCC_FAN_HALF: i128 = 1024;
const WCC_FAN_DIV: i128 = 256;

/// Minimum of `d(x) = g(x) − f(x)` over the ±14σ bracket via a dense global
/// grid plus a fine fan around each μ. Used by `worst_case_collateral` and the
/// property-test oracle (at a coarser density).
pub(crate) fn neg_min_diff_grid(
    g: (i128, i128, i128),
    f: (i128, i128, i128),
    global: i128,
    fan_half: i128,
    fan_div: i128,
) -> i128 {
    let (mu_g, sig_g, lam_g) = g;
    let (mu_f, sig_f, lam_f) = f;

    let d = |x: i128| -> i128 {
        gaussian_pdf_scaled(mu_g, sig_g, lam_g, x) - gaussian_pdf_scaled(mu_f, sig_f, lam_f, x)
    };

    let sig_max = sig_g.max(sig_f);
    let center_lo = mu_g.min(mu_f);
    let center_hi = mu_g.max(mu_f);
    let span = sig_max.checked_mul(14).unwrap_or(i128::MAX);
    let lo = center_lo.saturating_sub(span);
    let hi = center_hi.saturating_add(span);

    let mut best = d(lo).min(d(hi));

    if hi > lo {
        let step = ((hi - lo) / global).max(1);
        let mut x = lo;
        while x < hi {
            x = x.saturating_add(step);
            let v = d(x);
            if v < best {
                best = v;
            }
        }
    }

    for &(mu, sig) in &[(mu_g, sig_g), (mu_f, sig_f)] {
        let step = (sig / fan_div).max(1);
        let mut j: i128 = -fan_half;
        while j <= fan_half {
            let v = d(mu.saturating_add(j.saturating_mul(step)));
            if v < best {
                best = v;
            }
            j += 1;
        }
    }

    best
}

/// Worst-case collateral for a trade that moves the market curve from `f` to
/// `g`: `max( 0, −min_x ( g(x) − f(x) ) )` — the largest amount the trader
/// could owe at resolution (whitepaper §11, step 3). `g` and `f` are scaled
/// Gaussians `(μ, σ, λ)`.
///
/// Both bells vanish at `±∞`, so the infimum over ℝ is `min(0, interior min)`.
/// The interior min is found by a dense global grid over `[μ_min − 14σ_max,
/// μ_max + 14σ_max]` plus a fine fan around each μ at `σ/256` out to `±4σ`.
/// Validated against the same grid in `tests_oracle` (release gate).
pub fn worst_case_collateral(g: (i128, i128, i128), f: (i128, i128, i128)) -> i128 {
    let (_, sig_g, _) = g;
    let (_, sig_f, _) = f;
    assert!(
        sig_g > 0 && sig_f > 0,
        "worst_case_collateral: sigma must be > 0"
    );
    assert!(
        g.2 >= 0 && f.2 >= 0,
        "worst_case_collateral: lambda must be >= 0"
    );

    let interior_min = neg_min_diff_grid(g, f, WCC_GLOBAL, WCC_FAN_HALF, WCC_FAN_DIV);
    if interior_min >= 0 {
        0
    } else {
        -interior_min
    }
}
