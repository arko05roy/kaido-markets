//! Protocol envelope for WAD-scaled market parameters.
//!
//! Until `worst_case_collateral` is proven over the full `i128` domain, markets
//! and trades must stay inside these bounds.

/// `1e-3` WAD — minimum strictly-positive `k`, `b`, `σ`.
pub const MIN_POSITIVE_WAD: i128 = 1_000_000_000_000_000;
/// `1e5` WAD — maximum `k` and `b`.
pub const MAX_K_B_WAD: i128 = 100_000_000_000_000_000_000_000;
/// `1e6` WAD — maximum `σ` and `|μ|`.
pub const MAX_SIGMA_MU_WAD: i128 = 1_000_000_000_000_000_000_000_000;

#[inline]
pub fn k_in_envelope(k: i128) -> bool {
    k >= MIN_POSITIVE_WAD && k <= MAX_K_B_WAD
}

#[inline]
pub fn b_in_envelope(b: i128) -> bool {
    b >= MIN_POSITIVE_WAD && b <= MAX_K_B_WAD
}

#[inline]
pub fn sigma_in_envelope(sigma: i128) -> bool {
    sigma >= MIN_POSITIVE_WAD && sigma <= MAX_SIGMA_MU_WAD
}

#[inline]
pub fn mu_in_envelope(mu: i128) -> bool {
    mu >= -MAX_SIGMA_MU_WAD && mu <= MAX_SIGMA_MU_WAD
}
