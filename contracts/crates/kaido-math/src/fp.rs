//! Fixed-point primitives — the foundation every Gaussian function is built on.
//!
//! ## Convention
//!
//! Everything is **WAD-scaled `i128`**: a value `v: i128` represents the real
//! number `v / WAD` with `WAD = 10^18` (ADR-1, ADR-2). Rounding is **truncation
//! toward zero** everywhere — this matches Rust's integer `/`, JS `BigInt` `/`,
//! and Python `int(...)` on the magnitude, so the TypeScript conformance side
//! (`web/lib/curve`, Sprint 3) reproduces these results for free.
//!
//! ## 256-bit intermediates
//!
//! Products of two WAD values can need up to ~256 bits before the divide-back.
//! `i128` can't hold that, so [`mul_div`] widens to an unsigned 256-bit
//! intermediate (`u256` here = a `(hi: u128, lo: u128)` pair), divides, and
//! narrows. There is no `unsafe`, no float, and no external dependency — this is
//! deliberately small and auditable (see ADR-1; this replaces the script3
//! `soroban-fixed-point-math` 256-bit path, which needs a Soroban `Env`).

/// The fixed-point scale: a value `v` represents `v / WAD`.
pub const WAD: i128 = 1_000_000_000_000_000_000; // 1e18

const U64_MASK: u128 = u64::MAX as u128;

/// 128×128 → 256-bit unsigned product, schoolbook with 64-bit limbs.
///
/// Returns `(hi, lo)` such that `a * b == (hi as u256) << 128 | lo`.
///
/// *Why the limb columns never overflow `u128`* — let `B = 2^64`. With
/// `a = a1·B + a0`, `b = b1·B + b0` (`ai, bi < B`), the partial products
/// `p00, p01, p10, p11` are each `< B²= 2^128`. Column sums:
/// `t1 = (p00>>64) + (p01 & M) + (p10 & M) < 3B`  (fits);
/// `t2 = (t1>>64) + (p01>>64) + (p10>>64) + (p11 & M) < 3B`  (fits);
/// `c3 = (t2>>64) + (p11>>64)`. `t2 < 3B ⇒ t2>>64 ≤ 2`, and `p11 = a1·b1 ≤
/// (B-1)² ⇒ p11>>64 ≤ B-2`; if `p11>>64 = B-2` then `a1=b1=B-1`, which forces
/// `t2 < 2B` (the `p0*` cross terms can't both be near `B`), so `t2>>64 ≤ 1`
/// and `c3 ≤ B-1 < B`. Hence `c3 << 64` fits `u128` and `hi = c2 | (c3<<64)`
/// is exact. Mathematically `hi < 2^128` always (it's the high half of a
/// 256-bit product), consistent with the above.
fn mul_u128_u256(a: u128, b: u128) -> (u128, u128) {
    let a0 = a & U64_MASK;
    let a1 = a >> 64;
    let b0 = b & U64_MASK;
    let b1 = b >> 64;

    let p00 = a0 * b0; // < 2^128
    let p01 = a0 * b1;
    let p10 = a1 * b0;
    let p11 = a1 * b1;

    let t1 = (p00 >> 64) + (p01 & U64_MASK) + (p10 & U64_MASK); // < 3·2^64
    let c1 = t1 & U64_MASK;
    let t2 = (t1 >> 64) + (p01 >> 64) + (p10 >> 64) + (p11 & U64_MASK); // < 3·2^64
    let c2 = t2 & U64_MASK;
    let c3 = (t2 >> 64) + (p11 >> 64); // < 2^64 (see doc comment)

    let lo = (p00 & U64_MASK) | (c1 << 64);
    let hi = c2 | (c3 << 64);
    (hi, lo)
}

/// `floor((hi·2^128 + lo) / d)` as a `u128`, by restoring binary long division.
///
/// Precondition: `d != 0` and `hi < d` (which bounds the quotient to `≤ 2^128`;
/// for every call site in this crate the true quotient is far smaller than
/// `2^128`, so the `quo << 1` below cannot overflow — `overflow-checks = true`
/// turns any violation into a panic, which is the right behaviour for a bug).
fn div_u256_u128(hi: u128, lo: u128, d: u128) -> u128 {
    assert!(d != 0, "division by zero");
    assert!(hi < d, "fp::mul_div quotient overflows i128");

    // Fast path: when the numerator already fits `u128`, this is just `lo / d`
    // (the long division below would compute the same thing, 256 iterations the
    // slow way). Most WAD-scale `mul_div` calls land here — and on Soroban the
    // CPU-instruction budget makes the difference between an `add_liquidity` /
    // `trade` simulation fitting or not.
    if hi == 0 {
        return lo / d;
    }

    // General case: start the bit scan at the numerator's true MSB rather than
    // bit 255 — for ~1e38-scale numerators that's ~127 iterations, not 256.
    let mut rem: u128 = 0;
    let mut quo: u128 = 0;
    let mut i: i32 = (255 - hi.leading_zeros()) as i32;
    while i >= 0 {
        let bit = if i >= 128 {
            (hi >> (i - 128)) & 1
        } else {
            (lo >> i) & 1
        };
        // rem' = rem·2 + bit  (a 129-bit value; `carry` is its bit 128).
        let carry = rem >> 127;
        rem = (rem << 1) | bit; // the dropped bit is captured in `carry`
        if carry == 1 || rem >= d {
            // rem'' = rem' - d, valid because rem' ∈ [d, 2·d) here.
            rem = rem.wrapping_sub(d);
            quo = (quo << 1) | 1;
        } else {
            quo <<= 1;
        }
        i -= 1;
    }
    quo
}

/// `floor(sqrt(hi·2^128 + lo))` as a `u128`, via Newton's method.
///
/// The argument is at most `i128::MAX · WAD ≈ 1.7e56 < 2^186`, so the result is
/// `< 2^93` and fits comfortably. Starting from an over-estimate, Newton
/// converges monotonically down to the floor of the square root.
fn isqrt_u256(hi: u128, lo: u128) -> u128 {
    if hi == 0 {
        return isqrt_u128(lo);
    }
    // bit length of N = hi·2^128 + lo (here hi != 0, so it's 128 + bits(hi)).
    let bits = 256 - hi.leading_zeros(); // in (128, 256]
                                         // x0 = 2^ceil(bits/2) ≥ sqrt(N).
    let mut x: u128 = 1u128 << bits.div_ceil(2);
    loop {
        // next = (x + floor(N / x)) / 2
        let q = div_u256_u128(hi, lo, x);
        let next = (x + q) / 2;
        if next >= x {
            // Converged (or oscillating by one). `x` is now floor(sqrt(N)),
            // but Newton from above can land one short of the floor on the
            // final step for some N — verify and bump if needed.
            return adjust_sqrt_u256(hi, lo, x);
        }
        x = next;
    }
}

/// `floor(sqrt(n))` for a `u128`, via Newton's method. `n < 2^128 ⇒ result < 2^64`.
fn isqrt_u128(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    let bits = 128 - n.leading_zeros();
    let mut x: u128 = 1u128 << bits.div_ceil(2);
    loop {
        let next = (x + n / x) / 2;
        if next >= x {
            // x is >= floor(sqrt(n)); step down while x*x > n.
            let mut r = x;
            while r > 0 && r > n / r {
                r -= 1;
            }
            return r;
        }
        x = next;
    }
}

/// Final clamp for [`isqrt_u256`]: ensure `r` is exactly `floor(sqrt(N))`.
fn adjust_sqrt_u256(hi: u128, lo: u128, mut r: u128) -> u128 {
    // r·r vs N: compare via the 256-bit product.
    let cmp = |r: u128| -> core::cmp::Ordering {
        let (rh, rl) = mul_u128_u256(r, r);
        match rh.cmp(&hi) {
            core::cmp::Ordering::Equal => rl.cmp(&lo),
            ord => ord,
        }
    };
    // step down while r² > N
    while r > 0 && cmp(r) == core::cmp::Ordering::Greater {
        r -= 1;
    }
    // step up while (r+1)² ≤ N
    while cmp(r + 1) != core::cmp::Ordering::Greater {
        r += 1;
    }
    r
}

/// Signed `floor`-toward-zero `(a * b) / d` over a 256-bit intermediate.
///
/// Rounds **toward zero** (truncation), so `mul_div(-7, 3, 2) == -10`. Panics
/// on `d == 0` or if the mathematically-correct result does not fit `i128`
/// (both are precondition violations / bugs at every call site here).
pub fn mul_div(a: i128, b: i128, d: i128) -> i128 {
    debug_assert!(d != 0, "fp::mul_div by zero");
    if a == 0 || b == 0 {
        return 0;
    }
    let neg = (a < 0) ^ (b < 0) ^ (d < 0);
    let ua = a.unsigned_abs();
    let ub = b.unsigned_abs();
    let ud = d.unsigned_abs();
    let (hi, lo) = mul_u128_u256(ua, ub);
    let q = div_u256_u128(hi, lo, ud);
    assert!(q <= i128::MAX as u128, "fp::mul_div result overflows i128");
    let q = q as i128;
    if neg {
        -q
    } else {
        q
    }
}

/// WAD multiply: `a ⊗ b = round_toward_zero(a · b / WAD)`.
#[inline]
pub fn wmul(a: i128, b: i128) -> i128 {
    mul_div(a, b, WAD)
}

/// WAD divide: `a ⊘ b = round_toward_zero(a · WAD / b)`.
#[inline]
pub fn wdiv(a: i128, b: i128) -> i128 {
    mul_div(a, WAD, b)
}

/// WAD square root: returns the WAD value `r` with `r ≈ sqrt(x / WAD) · WAD`,
/// i.e. `r = floor(sqrt(x · WAD))`. Requires `x ≥ 0`.
pub fn sqrt_wad(x: i128) -> i128 {
    assert!(x >= 0, "sqrt_wad of a negative value");
    if x == 0 {
        return 0;
    }
    let (hi, lo) = mul_u128_u256(x as u128, WAD as u128);
    let r = isqrt_u256(hi, lo);
    debug_assert!(r <= i128::MAX as u128);
    r as i128
}

/// Multiply a WAD value by `2^n` for `n: i32` (positive or negative), rounding
/// the negative-shift case toward zero. Panics if a positive `n` makes the
/// result overflow `i128` (the documented domain limit of `exp_wad`).
pub fn shl2(v: i128, n: i32) -> i128 {
    if n == 0 {
        return v;
    }
    if n > 0 {
        // v · 2^n via the 256-bit path, then narrow.
        let pow: u128 = if n < 128 {
            1u128 << n
        } else {
            panic!("shl2 overflow")
        };
        mul_div(v, pow as i128, 1)
    } else {
        let k = (-n) as u32;
        if k >= 127 {
            return 0;
        }
        // truncation toward zero (matches the rest of the module).
        let neg = v < 0;
        let r = (v.unsigned_abs() >> k) as i128;
        if neg {
            -r
        } else {
            r
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    // Independent 256-bit multiply (32-bit limbs) for cross-checking the
    // 64-bit-limb implementation in `mul_u128_u256`.
    fn mul_u128_alt(a: u128, b: u128) -> (u128, u128) {
        let mut al = [0u64; 4];
        let mut bl = [0u64; 4];
        for i in 0..4 {
            al[i] = ((a >> (32 * i)) & 0xffff_ffff) as u64;
            bl[i] = ((b >> (32 * i)) & 0xffff_ffff) as u64;
        }
        let mut acc = [0u64; 8];
        for i in 0..4 {
            let mut carry: u64 = 0;
            for j in 0..4 {
                let prod = al[i] * bl[j] + acc[i + j] + carry;
                acc[i + j] = prod & 0xffff_ffff;
                carry = prod >> 32;
            }
            acc[i + 4] += carry;
        }
        let pack = |limbs: &[u64]| {
            limbs
                .iter()
                .rev()
                .fold(0u128, |h, &x| (h << 32) | x as u128)
        };
        (pack(&acc[4..8]), pack(&acc[0..4]))
    }

    #[test]
    fn mul_u128_u256_matches_alt() {
        let vals: [u128; 9] = [
            0,
            1,
            2,
            u64::MAX as u128,
            (u64::MAX as u128) + 1,
            u128::MAX,
            u128::MAX - 1,
            0x1234_5678_9abc_def0_1122_3344_5566_7788,
            0xffff_ffff_0000_0000_ffff_ffff_0000_0001,
        ];
        for &a in &vals {
            for &b in &vals {
                assert_eq!(mul_u128_u256(a, b), mul_u128_alt(a, b), "a={a} b={b}");
            }
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(20_000))]

        #[test]
        fn mul_u128_u256_random_matches_alt(a in any::<u128>(), b in any::<u128>()) {
            prop_assert_eq!(mul_u128_u256(a, b), mul_u128_alt(a, b));
        }

        #[test]
        fn div_u256_u128_matches_u128_when_small(n in any::<u128>(), d in 1u128..=u128::MAX) {
            // a 256-bit numerator with hi==0 reduces to plain u128 division
            prop_assert_eq!(div_u256_u128(0, n, d), n / d);
        }

        #[test]
        fn mul_div_small_matches_i128(a in -1_000_000_000_000i128..1_000_000_000_000, b in -1_000_000i128..1_000_000, d in 1i128..1_000_000) {
            // when it fits i128 natively, our result must agree (truncation toward zero)
            let expect = (a * b) / d;
            prop_assert_eq!(mul_div(a, b, d), expect);
        }

        #[test]
        fn mul_div_identities(a in -1_000_000_000_000_000_000_000_000i128..1_000_000_000_000_000_000_000_000i128,
                              d in 1i128..1_000_000_000_000_000_000_000_000i128) {
            // mul_div(a, d, d) == a   (exact, both signs of a)
            prop_assert_eq!(mul_div(a, d, d), a);
            prop_assert_eq!(mul_div(a, -d, -d), a);
            // wmul/wdiv by WAD are the identity
            prop_assert_eq!(wmul(a, WAD), a);
            prop_assert_eq!(wmul(WAD, a), a);
            prop_assert_eq!(wdiv(a, WAD), a);
            // sign rule: result sign is xor of input signs
            let r = mul_div(a, 7, d);
            prop_assert_eq!(r.signum() == 0 || r.signum() == a.signum(), true);
        }

        #[test]
        fn sqrt_wad_squared(x in 0i128..(i128::MAX / WAD)) {
            let r = sqrt_wad(x);
            // r = floor(sqrt(x·WAD)); so r² ≤ x·WAD < (r+1)²
            let (lo_ok, hi_ok) = {
                let (h1, l1) = mul_u128_u256(r as u128, r as u128);
                let (h2, l2) = mul_u128_u256((r + 1) as u128, (r + 1) as u128);
                let (xh, xl) = mul_u128_u256(x as u128, WAD as u128);
                let le = (h1, l1) <= (xh, xl);
                let gt = (xh, xl) < (h2, l2);
                (le, gt)
            };
            prop_assert!(lo_ok && hi_ok, "sqrt_wad({}) = {} not floor", x, r);
        }

        #[test]
        fn shl2_inverse(v in 1i128..(WAD * 1000), n in 1i32..40) {
            let up = shl2(v, n);
            let down = shl2(up, -n);
            prop_assert_eq!(down, v);
        }
    }
}
