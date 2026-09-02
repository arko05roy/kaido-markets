//! `kaido-common` — types shared across the Kaido contracts.
//!
//! Scope (filled in over Sprints 1–2, see build.md ADR-5 and §1):
//!   * `Resolver` trait — `resolve(env) -> Vec<i128>`, `dispute(...)`, `status(...)`.
//!   * `ResolverTier` (T0 Reflector / T1 attested / T2 optimistic / T3 designated)
//!     — the tier badge is a non-negotiable UI element, so it lives on-chain.
//!   * `MarketParams`, `Belief`, `PositionData` tuple/struct types.
//!   * `MarketError` and event topic constants.
//!
//! No business logic here — just the vocabulary the contracts agree on.

#![no_std]

use soroban_sdk::contracterror;

/// Canonical error space for Kaido contracts. Concrete variants are added as
/// the contracts grow; the enum exists now so callers can `?`-propagate.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum KaidoError {
    /// Placeholder until real error branches land in Sprint 1.
    NotImplemented = 1,
}

/// Trust tier a resolver declares. Surfaced verbatim in the UI as a badge.
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ResolverTier {
    /// T0 — reads a robust on-chain price feed (Reflector SEP-40).
    Reflector = 0,
    /// T1 — signed report from a permissioned poster + challenge window.
    Attested = 1,
    /// T2 — optimistic propose/dispute with bonds.
    Optimistic = 2,
    /// T3 — a single named party reports.
    Designated = 3,
}

/// Sprint-0 placeholder so the crate compiles and links.
#[doc(hidden)]
pub const fn __scaffold_noop() {}
