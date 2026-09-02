//! WAD-scaled (`1e18`) compile-time constants.
//!
//! Each value is `round_half_away_from_zero(exact · WAD)`. They are mirrored in
//! `docs/test-vectors/constants.json` (the cross-language source of truth) and
//! re-derived in this module's tests so a typo can't slip through. **No `f64`**
//! — every literal here is an exact decimal integer.

/// Natural log of 2:  `ln 2 ≈ 0.693147180559945309…`
pub const LN2: i128 = 693_147_180_559_945_309;
/// `ln 2 / 2` — the half-width of `exp_wad`'s range-reduced interval.
pub const HALF_LN2: i128 = 346_573_590_279_972_655;

/// `√π ≈ 1.772453850905516027…`
pub const SQRT_PI: i128 = 1_772_453_850_905_516_027;
/// `√(2π) ≈ 2.506628274631000502…`
pub const SQRT_2PI: i128 = 2_506_628_274_631_000_502;
/// `2/√π ≈ 1.128379167095512574…` — the prefactor in the `erf` Maclaurin series.
pub const TWO_OVER_SQRT_PI: i128 = 1_128_379_167_095_512_574;
/// `π ≈ 3.141592653589793238…`
pub const PI: i128 = 3_141_592_653_589_793_238;

/// Taylor coefficients of `exp` in WAD: `EXP_COEFFS[k] = round(WAD / k!)`.
///
/// Used by [`crate::exp::exp_wad`] in Horner form on the range-reduced argument
/// `r ∈ [-ln2/2, ln2/2]`. Degree 8 is enough for ≤ 1e-9 relative error there:
/// the first dropped term is `r⁹/9! ≤ (ln2/2)⁹/362880 ≈ 5.4e-11`.
pub const EXP_COEFFS: [i128; 9] = [
    1_000_000_000_000_000_000, // 1/0!
    1_000_000_000_000_000_000, // 1/1!
    500_000_000_000_000_000,   // 1/2!
    166_666_666_666_666_667,   // 1/3!
    41_666_666_666_666_667,    // 1/4!
    8_333_333_333_333_333,     // 1/5!
    1_388_888_888_888_889,     // 1/6!
    198_412_698_412_698,       // 1/7!
    24_801_587_301_587,        // 1/8!
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fp::WAD;

    fn round_half_away(num: i128, den: i128) -> i128 {
        // round(num/den) toward the nearer integer, ties away from zero, for
        // positive den.
        debug_assert!(den > 0);
        if num >= 0 {
            (2 * num + den) / (2 * den)
        } else {
            -((2 * (-num) + den) / (2 * den))
        }
    }

    #[test]
    fn exp_coeffs_are_wad_over_factorial() {
        let mut fact: i128 = 1;
        for (k, &c) in EXP_COEFFS.iter().enumerate() {
            if k > 0 {
                fact *= k as i128;
            }
            assert_eq!(c, round_half_away(WAD, fact), "EXP_COEFFS[{k}]");
        }
    }

    #[test]
    fn half_ln2_is_ln2_over_two() {
        assert_eq!(HALF_LN2, round_half_away(LN2, 2));
    }

    /// Spot-check the irrational constants against the committed JSON source of
    /// truth (`docs/test-vectors/constants.json`).
    #[test]
    fn constants_match_committed_vectors() {
        let src = include_str!("../../../../docs/test-vectors/constants.json");
        let v: serde_json::Value = serde_json::from_str(src).unwrap();
        let c = &v["constants"];
        let get = |k: &str| c[k].as_str().unwrap().parse::<i128>().unwrap();
        assert_eq!(WAD, get("WAD"));
        assert_eq!(LN2, get("LN2"));
        assert_eq!(SQRT_PI, get("SQRT_PI"));
        assert_eq!(SQRT_2PI, get("SQRT_2PI"));
        assert_eq!(TWO_OVER_SQRT_PI, get("TWO_OVER_SQRT_PI"));
        assert_eq!(PI, get("PI"));
    }
}
