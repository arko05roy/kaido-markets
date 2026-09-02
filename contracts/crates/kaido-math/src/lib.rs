//! `kaido-math` — deterministic fixed-point math core for Kaido.
//!
//! Everything here is **WAD-scaled (`1e18`) signed `i128`**, computed with
//! integer arithmetic only — **no `f64`, no float, anywhere** (ADR-1, ADR-2).
//! Results are deterministic across the Soroban host/guest boundary and across
//! re-execution, and reproducible byte-for-byte in TypeScript (`web/lib/curve`,
//! `packages/sdk` — Sprint 3) via the shared conformance vectors in
//! `docs/test-vectors/`.
//!
//! ## Modules
//!
//! * [`fp`] — fixed-point primitives: 256-bit-intermediate `mul_div`, `wmul`,
//!   `wdiv`, `sqrt_wad`, `shl2`, and the `WAD` constant.
//! * [`consts`] — WAD-scaled compile-time constants (`ln2`, `√π`, `√(2π)`, …)
//!   and the `exp` Taylor coefficients.
//! * [`exp`] — `exp_wad(x)` (range reduction + degree-8 Taylor; ≤ 1e-9 rel.).
//! * [`erf`] — `erf_wad(x)` / `erfc_wad(x)` (Maclaurin for `|x| ≤ 2`, Laplace
//!   continued fraction beyond; used by capped Gaussians in Sprint 5).
//! * [`gaussian`] — `gaussian_l2_norm`, `lambda`, `gaussian_pdf_scaled`,
//!   `sigma_floor`, `worst_case_collateral` (whitepaper §10–11).

#![no_std]
#![forbid(unsafe_code)]

pub mod bounds;
pub mod capped;
pub mod consts;
pub mod erf;
pub mod exp;
pub mod fp;
pub mod gaussian;

// The public surface — flat re-exports so callers write `kaido_math::exp_wad`.
pub use erf::{erf_wad, erfc_wad};
pub use exp::{exp_wad, MAX_EXP_ARG};
pub use fp::{mul_div, shl2, sqrt_wad, wdiv, wmul, WAD};
pub use capped::{
    capped_gaussian_pdf_scaled, capped_l2_norm, capped_l2_norm_squared, capped_lambda,
    capped_worst_case_collateral,
};
pub use bounds::{b_in_envelope, k_in_envelope, mu_in_envelope, sigma_in_envelope};
pub use gaussian::{
    gaussian_l2_norm, gaussian_pdf_scaled, lambda, sigma_floor, worst_case_collateral,
};

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_oracle;
