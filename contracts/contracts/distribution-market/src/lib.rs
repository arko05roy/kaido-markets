//! `DistributionMarket` — the per-market AMM.
//!
//! Holds the market's seven-field tuple (whitepaper §15, [`MarketParams`]) and
//! its current aggregate belief curve `(μ, σ, λ)` stored as *parameters*, not a
//! histogram (ADR-2). A trader's position is `g − f` between the curve before
//! and after their trade; settlement pays `f(x₀)` (whitepaper §9–11).
//!
//! **Sprint 1 scope (build.md §5, Sprint 1):** storage layout, `init(...)`
//! (the scalar-Gaussian market tuple + initial `(μ₀, σ₀)`), `get_params()`,
//! `get_state()`, the `MarketCreated` event, and the σ-floor / solvency
//! validation. **No trading, LP, or resolution yet** — those land in Sprint 2
//! (`trade`, `add_liquidity`/`remove_liquidity`, `resolve`). All AMM math is
//! delegated to `kaido-math` (no `f64`; ADR-1); the conformance vectors in
//! `docs/test-vectors/` keep it in lockstep with the off-chain side.

#![no_std]
// `init` takes the full market tuple as flat primitives (so the Stellar CLI and
// `MarketFactory` can pass them without wrapping a `#[contracttype]` struct that
// the CLI's JSON→ScVal converter can't build) — that's 10 args, above clippy's
// default. The `#[contractimpl]` macro re-emits the signature, so the allow has
// to be crate-level rather than on the fn.
#![allow(clippy::too_many_arguments)]

use kaido_common::{
    Belief, KaidoError, MarketCreated, MarketParams, MarketState, MarketStatus, MarketWindow,
    OutcomeSpace, Parameterization, ResolverTier,
};
use kaido_math::{gaussian_pdf_scaled, lambda as lambda_of, sigma_floor, WAD as MATH_WAD};
use soroban_sdk::{contract, contractimpl, contracttype, panic_with_error, Address, Env};

// --- TTL bookkeeping --------------------------------------------------------
// Stellar ledgers close roughly every 5–6 s, so ~17 280 ledgers ≈ 1 day. A
// market keeps its (small) instance storage alive for a generous window; this
// is bumped on every entry point that mutates state. (Sprint 2 will also bump
// on `trade`; Sprint 7 wires governance over these constants.)
const LEDGERS_PER_DAY: u32 = 17_280;
const INSTANCE_TTL_TARGET: u32 = 60 * LEDGERS_PER_DAY; // ~60 days
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL_TARGET - 7 * LEDGERS_PER_DAY;

/// Protocol cap on the per-trade fee (build.md ADR-3 / §2: "fee ≤ cap"). 10%.
pub const MAX_FEE_BPS: u32 = 1_000;

/// Instance-storage keys. The whole market — config + live state — is a handful
/// of values, so it all lives in `instance` storage (always loaded with the
/// contract, cheap to read).
#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// [`MarketParams`] — the immutable seven-field tuple.
    Params,
    /// [`Belief`] — the current aggregate curve `(μ, σ, λ)`.
    Belief,
    /// [`MarketStatus`] — lifecycle state.
    Status,
    /// `i128` — `σ_min(k, b)`, computed once at `init` (ADR-3).
    SigmaMin,
}

#[contract]
pub struct DistributionMarket;

#[contractimpl]
impl DistributionMarket {
    /// Initialise a freshly-deployed market with a **scalar Gaussian** outcome
    /// space (the only kind in Sprint 1): record its tuple, seed it with the
    /// initial Gaussian `(μ₀, σ₀)` (deriving `λ₀ = k·√(2σ₀√π)`), and emit
    /// `MarketCreated`. Callable exactly once.
    ///
    /// Arguments are *primitives* (so the Stellar CLI / `MarketFactory` can pass
    /// them directly): `k`, `b`, `mu0`, `sigma0` are WAD-scaled `i128`
    /// (ADR-1/ADR-2 — money is converted from 7-dp USDC to WAD by the caller);
    /// `fee_bps` is basis points; `resolver` is the resolver contract
    /// (`Resolver` interface, Sprint 2+); `tier` is the resolver's declared
    /// trust tier as a code `0..=3` (see [`ResolverTier`]); `window_*` are Unix
    /// timestamps (seconds).
    ///
    /// Validation (all `KaidoError`):
    ///  * `k > 0`, `b > 0`, `fee_bps ≤ MAX_FEE_BPS`, `tier ∈ 0..=3`;
    ///  * window: `open ≤ lock ≤ resolve` and `resolve` in the future;
    ///  * `σ₀ > 0` and `σ₀ ≥ σ_min(k, b)` (the σ-floor — whitepaper §10);
    ///  * the seeded curve is solvent: `peak = λ₀/(σ₀√(2π)) ≤ b` (re-checked
    ///    after rounding — picking `σ₀` *exactly* at the floor may be rejected
    ///    by a ULP, in which case pick a hair larger).
    ///
    /// (Capped Gaussians — whitepaper §10 option 2 — and trajectory markets are
    /// Sprint 5 / Sprint 2 respectively; this constructor hard-codes
    /// `OutcomeSpace::Scalar`, `Parameterization::Gaussian`, `capped: false`.)
    pub fn init(
        env: Env,
        k: i128,
        b: i128,
        fee_bps: u32,
        resolver: Address,
        tier: u32,
        window_open: u64,
        window_lock: u64,
        window_resolve: u64,
        mu0: i128,
        sigma0: i128,
    ) {
        let storage = env.storage().instance();
        if storage.has(&DataKey::Params) {
            panic_with_error!(&env, KaidoError::AlreadyInitialized);
        }

        // --- validate the tuple ---
        if k <= 0 {
            panic_with_error!(&env, KaidoError::InvalidK);
        }
        if b <= 0 {
            panic_with_error!(&env, KaidoError::InvalidB);
        }
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, KaidoError::FeeTooHigh);
        }
        let tier = match tier {
            0 => ResolverTier::Reflector,
            1 => ResolverTier::Attested,
            2 => ResolverTier::Optimistic,
            3 => ResolverTier::Designated,
            _ => panic_with_error!(&env, KaidoError::InvalidTier),
        };
        if !(window_open <= window_lock && window_lock <= window_resolve)
            || window_resolve <= env.ledger().timestamp()
        {
            panic_with_error!(&env, KaidoError::InvalidWindow);
        }

        // --- σ-floor + solvency ---
        if sigma0 <= 0 {
            panic_with_error!(&env, KaidoError::InvalidSigma);
        }
        let sigma_min = sigma_floor(k, b);
        if sigma0 < sigma_min {
            panic_with_error!(&env, KaidoError::SigmaBelowFloor);
        }
        let lambda0 = lambda_of(k, sigma0);
        // the peak of λ₀·φ_{μ₀,σ₀} is its value at x = μ₀.
        let peak0 = gaussian_pdf_scaled(mu0, sigma0, lambda0, mu0);
        if peak0 > b {
            panic_with_error!(&env, KaidoError::PeakExceedsCollateral);
        }

        // --- persist ---
        let params = MarketParams {
            outcome_space: OutcomeSpace::Scalar,
            parameterization: Parameterization::Gaussian,
            capped: false,
            k,
            b,
            fee_bps,
            resolver,
            tier,
            window: MarketWindow {
                open: window_open,
                lock: window_lock,
                resolve: window_resolve,
            },
        };
        let belief = Belief {
            mu: mu0,
            sigma: sigma0,
            lambda: lambda0,
        };
        storage.set(&DataKey::Params, &params);
        storage.set(&DataKey::Belief, &belief);
        storage.set(&DataKey::Status, &MarketStatus::Open);
        storage.set(&DataKey::SigmaMin, &sigma_min);
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);

        // --- announce --- (topic: "market_created")
        MarketCreated {
            params,
            belief,
            sigma_min,
        }
        .publish(&env);
    }

    /// The market's immutable seven-field tuple. Panics with `NotInitialized` if
    /// `init` hasn't run.
    pub fn get_params(env: Env) -> MarketParams {
        env.storage()
            .instance()
            .get(&DataKey::Params)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized))
    }

    /// The market's live state: status, current belief curve, and the σ-floor.
    pub fn get_state(env: Env) -> MarketState {
        let storage = env.storage().instance();
        let belief: Belief = storage
            .get(&DataKey::Belief)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        let status: MarketStatus = storage.get(&DataKey::Status).unwrap();
        let sigma_min: i128 = storage.get(&DataKey::SigmaMin).unwrap();
        MarketState {
            status,
            belief,
            sigma_min,
        }
    }

    /// The internal fixed-point scale (`1e18`, ADR-1) — handy for off-chain
    /// callers and for asserting the SDK/contract agree on it.
    pub fn wad(_env: Env) -> i128 {
        MATH_WAD
    }
}

#[cfg(test)]
mod test;
