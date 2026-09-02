//! `exp_wad` — the fixed-point natural exponential.

use crate::consts::{EXP_COEFFS, HALF_LN2, LN2};
use crate::fp::{mul_div, shl2, WAD};

/// Largest argument [`exp_wad`] accepts: `46 · WAD`. Beyond it `exp(x)·WAD`
/// no longer fits `i128` (`exp(46) ≈ 9.5e19`, `·1e18 ≈ 9.5e37 < i128::MAX ≈
/// 1.7e38`; `exp(47)` would overflow). Calling with `x > MAX_EXP_ARG` panics.
pub const MAX_EXP_ARG: i128 = 46 * WAD;

/// `exp(x / WAD) · WAD`, rounded toward zero.
///
/// * **Domain:** `x ≤ MAX_EXP_ARG`. There is no lower bound — for sufficiently
///   negative `x` the result is `0` (`exp(x)·WAD < 1` once `x < ln(5e-19)·WAD ≈
///   -42.14·WAD`), and `0` is returned.
/// * **Accuracy:** relative error ≤ 1e-9 over the supported domain (in practice
///   ≈ 3e-10, dominated by the degree-8 Taylor truncation; rounding adds ≲ 1
///   ULP), verified against 50-digit `mpmath` reference vectors in
///   `docs/test-vectors/exp.json`.
///
/// Method: range-reduce `x = n·ln2 + r` with `n = round(x/ln2)`, `|r| ≤ ln2/2`;
/// evaluate `exp(r)` by the degree-8 Taylor polynomial in Horner form; scale by
/// `2ⁿ`.
pub fn exp_wad(x: i128) -> i128 {
    assert!(x <= MAX_EXP_ARG, "exp_wad: argument out of domain");
    if x == 0 {
        return WAD;
    }

    // n = round(x / ln2), ties away from zero.
    let n: i32 = {
        let q = if x >= 0 {
            (2 * x + LN2) / (2 * LN2)
        } else {
            -((2 * (-x) + LN2) / (2 * LN2))
        };
        // |x| ≤ 46·WAD ⇒ |q| ≤ 67, fits i32.
        q as i32
    };

    // r = x - n·ln2,  with |r| ≤ ln2/2.
    let r = x - (n as i128) * LN2;
    debug_assert!(r.abs() <= HALF_LN2 + 1);

    // exp(r) ≈ Σ_{k=0..8} EXP_COEFFS[k] · (r/WAD)^k  via Horner:
    //   acc_k = EXP_COEFFS[k] + r · acc_{k+1} / WAD
    let mut acc: i128 = EXP_COEFFS[8];
    let mut k = 7i32;
    while k >= 0 {
        acc = EXP_COEFFS[k as usize] + mul_div(r, acc, WAD);
        k -= 1;
    }
    // acc = exp(r)·WAD ∈ [exp(-ln2/2), exp(ln2/2)]·WAD ⊂ [0.707, 1.415]·WAD > 0.
    debug_assert!(acc > 0);

    shl2(acc, n)
}
