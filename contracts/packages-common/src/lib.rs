//! `kaido-common` — the on-chain vocabulary every Kaido contract agrees on:
//! the market tuple, the belief/position shapes, the error space, the resolver
//! tier badge, and the event topic constants. **No business logic here** — the
//! AMM math lives in `kaido-math`, the contract logic in the `contracts/*`
//! crates.
//!
//! Conventions (ADR-1, ADR-2):
//!  * Every numeric field is **WAD-scaled (`1e18`) signed `i128`** — money is
//!    converted to/from 7-dp at the `distribution-market` boundary, never here.
//!  * `μ`, `σ`, `λ` are the Gaussian parameters of a belief curve (whitepaper
//!    §11); `k` is the L²-norm liquidity constant; `b` the per-outcome
//!    collateral; `fee_bps` the trade fee in basis points.
//!
//! The `Resolver` trait itself is finalised in Sprint 2 (ADR-5); Sprint 1 ships
//! only the [`ResolverTier`] badge (which is stored on-chain so the UI can't
//! lie about it) and the address the market points at.

#![no_std]

use soroban_sdk::{contractclient, contracterror, contractevent, contracttype, Address, Env, Vec};

// --------------------------------------------------------------------------- //
// Errors
// --------------------------------------------------------------------------- //

/// Canonical error space for the Kaido contracts. Numeric values are stable —
/// off-chain code (SDK, indexer) maps them to messages, so **never renumber an
/// existing variant**; only append.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum KaidoError {
    // --- lifecycle / auth (1–9) ---
    /// The contract has already been constructed/initialised.
    AlreadyInitialized = 1,
    /// The contract has not been constructed/initialised yet.
    NotInitialized = 2,
    /// The caller is not authorised for this action.
    Unauthorized = 3,

    // --- market parameter validation (10–29) ---
    /// `k` must be strictly positive.
    InvalidK = 10,
    /// `b` (collateral) must be strictly positive.
    InvalidB = 11,
    /// `fee_bps` exceeds the protocol cap.
    FeeTooHigh = 12,
    /// Window timestamps are out of order (need `open ≤ lock ≤ resolve`) or in
    /// the past.
    InvalidWindow = 13,
    /// The initial / submitted `σ` is not strictly positive.
    InvalidSigma = 14,
    /// The submitted belief's `σ` is below the market's `σ_min` floor
    /// (whitepaper §10 option 1; ADR-3).
    SigmaBelowFloor = 15,
    /// The resulting payout curve would exceed the collateral `b` at some point
    /// — i.e. the solvency invariant `max_x f(x) ≤ b` would be violated.
    PeakExceedsCollateral = 16,
    /// The capped-Gaussian parameterisation is not available yet (Sprint 5).
    CappedNotSupported = 17,
    /// The trajectory outcome space is not available yet (Sprint 2, ADR-4).
    TrajectoryNotSupported = 18,
    /// The numeric resolver-tier code is not one of `0..=3` (see [`ResolverTier`]).
    InvalidTier = 19,

    // --- trading / lifecycle gates (30–49) — used from Sprint 2 on ---
    /// The market is not in the `Open` state (trading window not active).
    MarketNotOpen = 30,
    /// The market is locked (no more trades) or already resolved.
    MarketClosed = 31,
    /// `resolve()` was called before `resolve_time`.
    NotYetResolveTime = 32,
    /// The market is already resolved.
    AlreadyResolved = 33,
    /// Slippage guard: the required collateral exceeds the caller's `max`.
    SlippageExceeded = 34,

    // --- trading / settlement / LP (35–49) — Sprint 2 ---
    /// The resolver has no value yet (still `Pending`) — too early to resolve.
    ResolverNotReady = 35,
    /// The resolver's underlying oracle is stale / missing — market is paused
    /// (`Disputable`), never a bad payout.
    OracleStale = 36,
    /// `claim` / `remove_liquidity` called when there is nothing to withdraw.
    NothingToWithdraw = 37,
    /// Not enough free (unlocked) collateral in the pool for this LP withdrawal.
    InsufficientLiquidity = 38,
    /// No position with the given id.
    PositionNotFound = 39,
    /// The caller does not own this position.
    NotPositionOwner = 40,
    /// The market is not in the `Resolved` state (so claims aren't open yet).
    MarketNotResolved = 41,
    /// The submitted belief's peak exceeds the market's collateral `b` even
    /// though `σ ≥ σ_min` — a rounding-edge solvency reject.
    PeakExceedsB = 42,
    /// A non-positive amount was passed where a strictly-positive one is needed.
    InvalidAmount = 43,
    /// Reserved (legacy error slot — was HouseVault).
    Reserved44 = 44,
    /// Reserved (legacy error slot — was HouseVault).
    Reserved45 = 45,
    /// BlendTap: the requested borrow exceeds per-market cap or pool depth.
    BlendDepthExceeded = 46,
    /// BlendTap: the caller is not an authorized `DistributionMarket`.
    BlendMarketNotAuthorized = 47,

    // --- arithmetic (50+) ---
    /// A fixed-point computation overflowed `i128` (a bug / out-of-envelope
    /// input — see `kaido_math::fp`).
    MathOverflow = 50,
    /// A market parameter (`k`, `b`, `μ`, `σ`) is outside the protocol envelope.
    OutOfEnvelope = 51,
}

// --------------------------------------------------------------------------- //
// Resolver interface (ADR-5) — a generated client, since Soroban has no
// dynamic-dispatch traits. A market only knows its resolver's `Address` + tier.
// --------------------------------------------------------------------------- //

/// Status a resolver reports for its market's outcome.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ResolverStatus {
    /// Not available yet (e.g. before `resolve_time`).
    Pending,
    /// Available — carries the realised outcome `x₀` (WAD).
    Resolved(i128),
    /// Available for a trajectory market — the realised value at each
    /// checkpoint, in checkpoint order (all WAD).
    ResolvedVec(Vec<i128>),
    /// The underlying source is stale/garbage; the market should pause
    /// (`Disputable`), not pay out.
    Stale,
}

/// The `Resolver` interface (ADR-5). Implemented by `resolver-reflector` (T0)
/// and, in later sprints, the T1/T2/T3 resolvers. `#[contractclient]` generates
/// `ResolverClient` which `DistributionMarket` uses to cross-call.
#[contractclient(name = "ResolverClient")]
pub trait Resolver {
    /// The realised outcome `x₀` in WAD. Panics/errors if not yet available or
    /// stale — callers should check [`Resolver::status`] first.
    fn resolve(env: Env) -> i128;
    /// Non-trapping status query.
    fn status(env: Env) -> ResolverStatus;
}

// --------------------------------------------------------------------------- //
// Resolver tier (the non-negotiable UI badge — ADR-5)
// --------------------------------------------------------------------------- //

/// Trust tier a resolver declares. Stored on-chain in [`MarketParams`] so the
/// frontend renders the badge from the source of truth, not from off-chain
/// metadata. Numeric values match the `T0…T3` naming in ADR-5 / whitepaper §17.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ResolverTier {
    /// **T0** — reads a robust on-chain price feed (Reflector SEP-40). The
    /// default tier for on-chain price feeds (e.g. Reflector BTC/USD).
    Reflector = 0,
    /// **T1** — a signed report from a permissioned poster, with a challenge
    /// window.
    Attested = 1,
    /// **T2** — optimistic propose/dispute with bonds; undisputed-after-window
    /// ⇒ final.
    Optimistic = 2,
    /// **T3** — a single named party reports. Pure trust, clearly flagged.
    Designated = 3,
}

// --------------------------------------------------------------------------- //
// Market tuple — M = (OutcomeSpace, Parameterization, k, b, fee, Resolver, Window)
// --------------------------------------------------------------------------- //

/// The shape of a market's outcome. Sprint 1 ships **scalar** markets only;
/// trajectory markets (a path sampled at checkpoints) land in Sprint 2 (ADR-4)
/// as an additional variant — adding it is non-breaking for existing markets.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OutcomeSpace {
    /// The outcome is a single real number (a price at `T`, an election margin,
    /// a rainfall in mm, …). The belief is one [`Belief`].
    Scalar,
    /// The outcome is a path sampled at N checkpoint timestamps (Unix
    /// seconds, ascending). The belief is one [`Belief`] per checkpoint; the
    /// checkpoints share one collateral pool (whitepaper §16; ADR-4). v1
    /// treats the per-checkpoint Gaussians as independent.
    Trajectory(Vec<u64>),
}

/// How a belief is parameterised. Sprint 1 ships `Gaussian` only; richer
/// families (right-skewed, multi-modal — build.md E18, post-M3) are added as
/// further variants. (`#[contracttype]` enum variants can't carry named fields,
/// so the σ-floor-vs-capped choice is a separate `capped: bool` on
/// [`MarketParams`], not a payload here.)
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Parameterization {
    /// `N(μ, σ)` — the two-number belief (whitepaper §11).
    Gaussian,
}

/// Trading window — Unix timestamps (ledger time, seconds). Requires
/// `open ≤ lock ≤ resolve` and `resolve` in the future at construction time.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct MarketWindow {
    /// When trading opens.
    pub open: u64,
    /// When trading locks (no more trades).
    pub lock: u64,
    /// When `resolve()` becomes callable.
    pub resolve: u64,
}

/// `M = ( OutcomeSpace, Parameterization, k, b, fee, Resolver, Window )`
/// (whitepaper §15). All numeric fields are WAD-scaled (ADR-2).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketParams {
    /// Scalar vs. trajectory.
    pub outcome_space: OutcomeSpace,
    /// Belief parameterisation (Gaussian in v1).
    pub parameterization: Parameterization,
    /// `false` ⇒ σ-floor enforcement (default; ADR-3). `true` ⇒ capped Gaussian
    /// `f(x) = min(b, λφ(x))` — reserved for Sprint 5; `init` rejects it now.
    pub capped: bool,
    /// L²-norm liquidity constant `k` (`‖f‖₂ = k`). WAD. Must be `> 0`.
    pub k: i128,
    /// Per-outcome collateral `b`. WAD. Must be `> 0`. (Converted from a 7-dp
    /// USDC deposit at the contract boundary.)
    pub b: i128,
    /// Trade fee in basis points (1 bp = 0.01%). Capped by the contract.
    pub fee_bps: u32,
    /// The resolver contract (implements the `Resolver` interface; Sprint 2+).
    pub resolver: Address,
    /// The resolver's declared trust tier — rendered as a badge everywhere
    /// (ADR-5).
    pub tier: ResolverTier,
    /// Open / lock / resolve timestamps.
    pub window: MarketWindow,
}

// --------------------------------------------------------------------------- //
// Belief & position
// --------------------------------------------------------------------------- //

/// A Gaussian belief curve, stored as parameters (ADR-2): `f(x) = λ · φ_{μ,σ}(x)`
/// with `λ = k·√(2σ√π)` so `‖f‖₂ = k`. All WAD. `λ` is derived and stored
/// redundantly so reads never recompute a square root.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct Belief {
    /// Center `μ` (outcome units, WAD).
    pub mu: i128,
    /// Width `σ` (outcome units, WAD). Must satisfy `σ ≥ σ_min` for the market.
    pub sigma: i128,
    /// Scale `λ = k·√(2σ√π)` (WAD). Derived from `(k, σ)`.
    pub lambda: i128,
}

/// A trader's position: the market curve immediately *before* the trade (`f`)
/// and immediately *after* (`g`), the collateral locked, and the owner —
/// everything needed to compute the payout `g(x₀) − f(x₀)` at resolution
/// without storing any curve array (ADR-2, whitepaper §11). Used from Sprint 2.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PositionData {
    /// Market belief just before this trade (`f`).
    pub before: Belief,
    /// Market belief just after this trade (`g`).
    pub after: Belief,
    /// Collateral the trader locked = worst-case loss `−min_x(g−f)` (WAD).
    pub collateral: i128,
    /// Who owns the claim.
    pub owner: Address,
}

/// Lifecycle status of a market. Sprint 1 only ever sets `Open` (no
/// trading/resolution yet); `Locked` / `Resolved` and the oracle-failure
/// `Disputable` state arrive in Sprint 2.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum MarketStatus {
    /// Trading window active.
    Open,
    /// Past `lock`, before `resolve` — no more trades.
    Locked,
    /// Resolved; payouts settled. (Carries the realised outcome value, WAD.)
    Resolved(i128),
    /// A trajectory market, resolved; the realised per-checkpoint values are
    /// stored alongside (see `DistributionMarket::resolved_outcomes`).
    ResolvedVec,
    /// The resolver returned a stale/garbage value — market is paused pending a
    /// dispute, never a bad payout (ADR-5; Sprint 2).
    Disputable,
}

/// What `DistributionMarket::get_state()` returns: the live belief, the status,
/// and the (constructor-computed) σ-floor.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketState {
    /// Current lifecycle status.
    pub status: MarketStatus,
    /// Current aggregate belief curve `(μ, σ, λ)`.
    pub belief: Belief,
    /// `σ_min(k, b)` for this market — the smallest `σ` a trade may set (ADR-3).
    pub sigma_min: i128,
}

// --------------------------------------------------------------------------- //
// Events  (`#[contractevent]` — the fixed topic is the struct name in
// snake_case, e.g. `MarketCreated` → topic `"market_created"`)
// --------------------------------------------------------------------------- //

/// Emitted by `DistributionMarket::init` (and, from Sprint 3, by `MarketFactory`
/// when it deploys + initialises one): a new market exists, seeded with `belief`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketCreated {
    /// The market's immutable seven-field tuple.
    pub params: MarketParams,
    /// The initial aggregate curve `(μ₀, σ₀, λ₀)`.
    pub belief: Belief,
    /// `σ_min(k, b)` for the market.
    pub sigma_min: i128,
}

/// Emitted by `DistributionMarket::trade` (topic `"trade"`).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Trade {
    /// Position id minted.
    pub id: u64,
    /// The trader.
    pub trader: Address,
    /// Collateral locked (WAD).
    pub collateral: i128,
    /// Fee paid (WAD).
    pub fee: i128,
    /// The new aggregate belief after the trade.
    pub belief: Belief,
}

/// Emitted by `DistributionMarket::add_liquidity` (topic `"liquidity_added"`).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityAdded {
    /// The LP.
    pub lp: Address,
    /// USDC added (7-dp).
    pub amount: i128,
    /// Shares minted.
    pub shares: i128,
}

/// Emitted by `DistributionMarket::remove_liquidity` (topic `"liquidity_removed"`).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityRemoved {
    /// The LP.
    pub lp: Address,
    /// Shares burned.
    pub shares: i128,
    /// USDC returned (7-dp).
    pub amount: i128,
}

/// Emitted by `DistributionMarket::resolve` (topic `"resolved"`).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Resolved {
    /// Realised outcome `x₀` (WAD).
    pub x0: i128,
}

// --------------------------------------------------------------------------- //
// Trajectory markets (ADR-4) — N independent per-checkpoint Gaussians sharing
// one collateral pool (whitepaper §16).
// --------------------------------------------------------------------------- //

/// A trajectory trader's position: the per-checkpoint curves before and after
/// the trade, the aggregate collateral locked, and the owner. At resolution the
/// payout is `Σ_i (g_i(x_i) − f_i(x_i))` over the N checkpoints, returned (with
/// the collateral) clamped at `0`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TrajectoryPositionData {
    /// Per-checkpoint market beliefs just before this trade.
    pub before: Vec<Belief>,
    /// Per-checkpoint market beliefs just after this trade.
    pub after: Vec<Belief>,
    /// Aggregate collateral locked = `Σ_i −min_x(g_i − f_i)` (WAD).
    pub collateral: i128,
    /// Who owns the claim.
    pub owner: Address,
}

/// Emitted by `DistributionMarket::trade_trajectory` (topic `"trade_trajectory"`).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TradeTrajectory {
    /// Position id minted.
    pub id: u64,
    /// The trader.
    pub trader: Address,
    /// Aggregate collateral locked (WAD).
    pub collateral: i128,
    /// Fee paid (WAD).
    pub fee: i128,
}

/// Emitted by `DistributionMarket::resolve` for a trajectory market
/// (topic `"resolved_trajectory"`).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedTrajectory {
    /// Realised value at each checkpoint, in checkpoint order (WAD).
    pub x0s: Vec<i128>,
}

// --------------------------------------------------------------------------- //
// Registry (Sprint 3) — the frontend's index of live markets.
// --------------------------------------------------------------------------- //

/// The summary the [`Registry`] indexes for each market — enough for the
/// frontend's market list without a per-market `get_params` round-trip. The
/// market contract itself stays the source of truth for live state (belief,
/// status, pool).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketInfo {
    /// The deployed `DistributionMarket` contract.
    pub market: Address,
    /// Scalar vs. trajectory.
    pub outcome_space: OutcomeSpace,
    /// Belief parameterisation.
    pub parameterization: Parameterization,
    /// Capped-Gaussian flag.
    pub capped: bool,
    /// The resolver contract.
    pub resolver: Address,
    /// The resolver's declared trust tier (the UI badge — ADR-5).
    pub tier: ResolverTier,
    /// Open / lock / resolve timestamps.
    pub window: MarketWindow,
    /// Who created the market (called `MarketFactory::create_market`).
    pub creator: Address,
}

/// Emitted by `Registry::register` (topic `"market_registered"`).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketRegistered {
    /// The newly-indexed market.
    pub market: Address,
    /// Its summary.
    pub info: MarketInfo,
}
