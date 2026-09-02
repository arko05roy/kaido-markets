//! `kaido-math` — deterministic fixed-point math core for Kaido.
//!
//! Scope (filled in over Sprints 1–2, see build.md E1):
//!   * `exp(x)`, `erf(x)`, `erfc(x)` as fixed-point series/rational
//!     approximations with documented max relative error (target ≤ 1e-9).
//!   * `gaussian_l2_norm(σ)`, `lambda(k, σ)`, `gaussian_pdf_scaled(μ, σ, λ, x)`.
//!   * `sigma_floor(k, b)` and `worst_case_collateral(g, f)`.
//!
//! Hard rule (ADR-1): **no `f64` anywhere** — everything is integer/fixed-point.
//! Cross-language conformance is enforced against `docs/test-vectors/`, run by
//! both this crate and `web/lib/curve`.

#![no_std]
#![forbid(unsafe_code)]

/// Sprint-0 placeholder so the crate compiles and links. Replaced by the real
/// math API in Sprint 1.
#[doc(hidden)]
pub const fn __scaffold_noop() {}
