import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}






/**
 * A Gaussian belief curve, stored as parameters (ADR-2): `f(x) = λ · φ_{μ,σ}(x)`
 * with `λ = k·√(2σ√π)` so `‖f‖₂ = k`. All WAD. `λ` is derived and stored
 * redundantly so reads never recompute a square root.
 */
export interface Belief {
  /**
 * Scale `λ = k·√(2σ√π)` (WAD). Derived from `(k, σ)`.
 */
lambda: i128;
  /**
 * Center `μ` (outcome units, WAD).
 */
mu: i128;
  /**
 * Width `σ` (outcome units, WAD). Must satisfy `σ ≥ σ_min` for the market.
 */
sigma: i128;
}


/**
 * Canonical error space for the Kaido contracts. Numeric values are stable —
 * off-chain code (SDK, indexer) maps them to messages, so **never renumber an
 * existing variant**; only append.
 */
export const KaidoError = {
  /**
   * The contract has already been constructed/initialised.
   */
  1: {message:"AlreadyInitialized"},
  /**
   * The contract has not been constructed/initialised yet.
   */
  2: {message:"NotInitialized"},
  /**
   * The caller is not authorised for this action.
   */
  3: {message:"Unauthorized"},
  /**
   * `k` must be strictly positive.
   */
  10: {message:"InvalidK"},
  /**
   * `b` (collateral) must be strictly positive.
   */
  11: {message:"InvalidB"},
  /**
   * `fee_bps` exceeds the protocol cap.
   */
  12: {message:"FeeTooHigh"},
  /**
   * Window timestamps are out of order (need `open ≤ lock ≤ resolve`) or in
   * the past.
   */
  13: {message:"InvalidWindow"},
  /**
   * The initial / submitted `σ` is not strictly positive.
   */
  14: {message:"InvalidSigma"},
  /**
   * The submitted belief's `σ` is below the market's `σ_min` floor
   * (whitepaper §10 option 1; ADR-3).
   */
  15: {message:"SigmaBelowFloor"},
  /**
   * The resulting payout curve would exceed the collateral `b` at some point
   * — i.e. the solvency invariant `max_x f(x) ≤ b` would be violated.
   */
  16: {message:"PeakExceedsCollateral"},
  /**
   * The capped-Gaussian parameterisation is not available yet (Sprint 5).
   */
  17: {message:"CappedNotSupported"},
  /**
   * The trajectory outcome space is not available yet (Sprint 2, ADR-4).
   */
  18: {message:"TrajectoryNotSupported"},
  /**
   * The numeric resolver-tier code is not one of `0..=3` (see [`ResolverTier`]).
   */
  19: {message:"InvalidTier"},
  /**
   * The market is not in the `Open` state (trading window not active).
   */
  30: {message:"MarketNotOpen"},
  /**
   * The market is locked (no more trades) or already resolved.
   */
  31: {message:"MarketClosed"},
  /**
   * `resolve()` was called before `resolve_time`.
   */
  32: {message:"NotYetResolveTime"},
  /**
   * The market is already resolved.
   */
  33: {message:"AlreadyResolved"},
  /**
   * Slippage guard: the required collateral exceeds the caller's `max`.
   */
  34: {message:"SlippageExceeded"},
  /**
   * The resolver has no value yet (still `Pending`) — too early to resolve.
   */
  35: {message:"ResolverNotReady"},
  /**
   * The resolver's underlying oracle is stale / missing — market is paused
   * (`Disputable`), never a bad payout.
   */
  36: {message:"OracleStale"},
  /**
   * `claim` / `remove_liquidity` called when there is nothing to withdraw.
   */
  37: {message:"NothingToWithdraw"},
  /**
   * Not enough free (unlocked) collateral in the pool for this LP withdrawal.
   */
  38: {message:"InsufficientLiquidity"},
  /**
   * No position with the given id.
   */
  39: {message:"PositionNotFound"},
  /**
   * The caller does not own this position.
   */
  40: {message:"NotPositionOwner"},
  /**
   * The market is not in the `Resolved` state (so claims aren't open yet).
   */
  41: {message:"MarketNotResolved"},
  /**
   * The submitted belief's peak exceeds the market's collateral `b` even
   * though `σ ≥ σ_min` — a rounding-edge solvency reject.
   */
  42: {message:"PeakExceedsB"},
  /**
   * A non-positive amount was passed where a strictly-positive one is needed.
   */
  43: {message:"InvalidAmount"},
  /**
   * HouseVault: the proposed seed would push cumulative exposure to this
   * market above the on-chain per-market cap. Set the cap explicitly via
   * `set_cap` before seeding.
   */
  44: {message:"CapExceeded"},
  /**
   * HouseVault: cap for this market is not configured (defaults to 0). The
   * admin must call `set_cap` before seeding the market.
   */
  45: {message:"CapNotSet"},
  /**
   * A fixed-point computation overflowed `i128` (a bug / out-of-envelope
   * input — see `kaido_math::fp`).
   */
  50: {message:"MathOverflow"}
}


/**
 * The summary the [`Registry`] indexes for each market — enough for the
 * frontend's market list without a per-market `get_params` round-trip. The
 * market contract itself stays the source of truth for live state (belief,
 * status, pool).
 */
export interface MarketInfo {
  /**
 * Capped-Gaussian flag.
 */
capped: boolean;
  /**
 * Who created the market (called `MarketFactory::create_market`).
 */
creator: string;
  /**
 * The deployed `DistributionMarket` contract.
 */
market: string;
  /**
 * Scalar vs. trajectory.
 */
outcome_space: OutcomeSpace;
  /**
 * Belief parameterisation.
 */
parameterization: Parameterization;
  /**
 * The resolver contract.
 */
resolver: string;
  /**
 * The resolver's declared trust tier (the UI badge — ADR-5).
 */
tier: ResolverTier;
  /**
 * Open / lock / resolve timestamps.
 */
window: MarketWindow;
}


/**
 * What `DistributionMarket::get_state()` returns: the live belief, the status,
 * and the (constructor-computed) σ-floor.
 */
export interface MarketState {
  /**
 * Current aggregate belief curve `(μ, σ, λ)`.
 */
belief: Belief;
  /**
 * `σ_min(k, b)` for this market — the smallest `σ` a trade may set (ADR-3).
 */
sigma_min: i128;
  /**
 * Current lifecycle status.
 */
status: MarketStatus;
}


/**
 * `M = ( OutcomeSpace, Parameterization, k, b, fee, Resolver, Window )`
 * (whitepaper §15). All numeric fields are WAD-scaled (ADR-2).
 */
export interface MarketParams {
  /**
 * Per-outcome collateral `b`. WAD. Must be `> 0`. (Converted from a 7-dp
 * USDC deposit at the contract boundary.)
 */
b: i128;
  /**
 * `false` ⇒ σ-floor enforcement (default; ADR-3). `true` ⇒ capped Gaussian
 * `f(x) = min(b, λφ(x))` — reserved for Sprint 5; `init` rejects it now.
 */
capped: boolean;
  /**
 * Trade fee in basis points (1 bp = 0.01%). Capped by the contract.
 */
fee_bps: u32;
  /**
 * L²-norm liquidity constant `k` (`‖f‖₂ = k`). WAD. Must be `> 0`.
 */
k: i128;
  /**
 * Scalar vs. trajectory.
 */
outcome_space: OutcomeSpace;
  /**
 * Belief parameterisation (Gaussian in v1).
 */
parameterization: Parameterization;
  /**
 * The resolver contract (implements the `Resolver` interface; Sprint 2+).
 */
resolver: string;
  /**
 * The resolver's declared trust tier — rendered as a badge everywhere
 * (ADR-5).
 */
tier: ResolverTier;
  /**
 * Open / lock / resolve timestamps.
 */
window: MarketWindow;
}

/**
 * Lifecycle status of a market. Sprint 1 only ever sets `Open` (no
 * trading/resolution yet); `Locked` / `Resolved` and the oracle-failure
 * `Disputable` state arrive in Sprint 2.
 */
export type MarketStatus = {tag: "Open", values: void} | {tag: "Locked", values: void} | {tag: "Resolved", values: readonly [i128]} | {tag: "ResolvedVec", values: void} | {tag: "Disputable", values: void};


/**
 * Trading window — Unix timestamps (ledger time, seconds). Requires
 * `open ≤ lock ≤ resolve` and `resolve` in the future at construction time.
 */
export interface MarketWindow {
  /**
 * When trading locks (no more trades).
 */
lock: u64;
  /**
 * When trading opens.
 */
open: u64;
  /**
 * When `resolve()` becomes callable.
 */
resolve: u64;
}

/**
 * The shape of a market's outcome. Sprint 1 ships **scalar** markets only;
 * trajectory markets (a path sampled at checkpoints) land in Sprint 2 (ADR-4)
 * as an additional variant — adding it is non-breaking for existing markets.
 */
export type OutcomeSpace = {tag: "Scalar", values: void} | {tag: "Trajectory", values: readonly [Array<u64>]};


/**
 * A trader's position: the market curve immediately *before* the trade (`f`)
 * and immediately *after* (`g`), the collateral locked, and the owner —
 * everything needed to compute the payout `g(x₀) − f(x₀)` at resolution
 * without storing any curve array (ADR-2, whitepaper §11). Used from Sprint 2.
 */
export interface PositionData {
  /**
 * Market belief just after this trade (`g`).
 */
after: Belief;
  /**
 * Market belief just before this trade (`f`).
 */
before: Belief;
  /**
 * Collateral the trader locked = worst-case loss `−min_x(g−f)` (WAD).
 */
collateral: i128;
  /**
 * Who owns the claim.
 */
owner: string;
}

/**
 * Trust tier a resolver declares. Stored on-chain in [`MarketParams`] so the
 * frontend renders the badge from the source of truth, not from off-chain
 * metadata. Numeric values match the `T0…T3` naming in ADR-5 / whitepaper §17.
 */
export enum ResolverTier {
  Reflector = 0,
  Attested = 1,
  Optimistic = 2,
  Designated = 3,
}


/**
 * Status a resolver reports for its market's outcome.
 */
export type ResolverStatus = {tag: "Pending", values: void} | {tag: "Resolved", values: readonly [i128]} | {tag: "ResolvedVec", values: readonly [Array<i128>]} | {tag: "Stale", values: void};



/**
 * How a belief is parameterised. Sprint 1 ships `Gaussian` only; richer
 * families (right-skewed, multi-modal — build.md E18, post-M3) are added as
 * further variants. (`#[contracttype]` enum variants can't carry named fields,
 * so the σ-floor-vs-capped choice is a separate `capped: bool` on
 * [`MarketParams`], not a payload here.)
 */
export type Parameterization = {tag: "Gaussian", values: void};





/**
 * A trajectory trader's position: the per-checkpoint curves before and after
 * the trade, the aggregate collateral locked, and the owner. At resolution the
 * payout is `Σ_i (g_i(x_i) − f_i(x_i))` over the N checkpoints, returned (with
 * the collateral) clamped at `0`.
 */
export interface TrajectoryPositionData {
  /**
 * Per-checkpoint market beliefs just after this trade.
 */
after: Array<Belief>;
  /**
 * Per-checkpoint market beliefs just before this trade.
 */
before: Array<Belief>;
  /**
 * Aggregate collateral locked = `Σ_i −min_x(g_i − f_i)` (WAD).
 */
collateral: i128;
  /**
 * Who owns the claim.
 */
owner: string;
}

export interface Client {
  /**
   * Construct and simulate a wad transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  wad: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a init transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialise a freshly-deployed scalar-Gaussian market. See the Sprint-1
   * docs; Sprint 2 appends the `usdc` SAC contract id (the settlement asset,
   * resolved per-network at deploy time — never hardcoded).
   */
  init: ({k, b, fee_bps, resolver, tier, window_open, window_lock, window_resolve, mu0, sigma0, usdc}: {k: i128, b: i128, fee_bps: u32, resolver: string, tier: u32, window_open: u64, window_lock: u64, window_resolve: u64, mu0: i128, sigma0: i128, usdc: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claim a resolved position: returns `collateral + (g(x₀) − f(x₀))`
   * clamped at `0` in USDC (floor 7-dp), deletes the position.
   */
  claim: ({position_id}: {position_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a trade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Submit a belief `(μ₂, σ₂)`: scale to `λ₂ = k·√(2σ₂√π)`, compute the
   * position `g − f` and worst-case collateral, add the fee, pull USDC, mint
   * a position, advance the curve to `g`, return the position id.
   * `max_collateral_7dp` guards slippage (total = collateral + fee, 7-dp).
   */
  trade: ({trader, mu2, sigma2, max_collateral_7dp}: {trader: string, mu2: i128, sigma2: i128, max_collateral_7dp: i128}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a resolve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * After `window.resolve`, pull `x₀` from the resolver. `Stale` ⇒ market
   * becomes `Disputable` (no payouts). `Pending` ⇒ reverts
   * `ResolverNotReady`. Otherwise `Resolved(x₀)` and `claim` opens.
   */
  resolve: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_state transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_state: (options?: MethodOptions) => Promise<AssembledTransaction<MarketState>>

  /**
   * Construct and simulate a lp_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * LP shares held by `lp`.
   */
  lp_shares: ({lp}: {lp: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_params transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_params: (options?: MethodOptions) => Promise<AssembledTransaction<MarketParams>>

  /**
   * Construct and simulate a pool_state transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * `(collateral_pool_wad, lp_total_shares, fee_pool_wad)`.
   */
  pool_state: (options?: MethodOptions) => Promise<AssembledTransaction<readonly [i128, i128, i128]>>

  /**
   * Construct and simulate a get_beliefs transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Live per-checkpoint curves (trajectory markets only).
   */
  get_beliefs: (options?: MethodOptions) => Promise<AssembledTransaction<Array<Belief>>>

  /**
   * Construct and simulate a get_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A stored position (panics `PositionNotFound` if claimed/unknown).
   */
  get_position: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<PositionData>>

  /**
   * Construct and simulate a add_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposit USDC into the LP collateral pool; mint shares pro-rata
   * (`shares = amount` for the first LP, else `amount · total_shares /
   * pool`). Allowed only while the market is `Open`. The `y·(b−f)`
   * curve-scaling LP design is Sprint 5.
   */
  add_liquidity: ({lp, amount_7dp}: {lp: string, amount_7dp: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_checkpoints transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The checkpoint timestamps (trajectory markets only).
   */
  get_checkpoints: (options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

  /**
   * Construct and simulate a init_trajectory transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialise a freshly-deployed trajectory market. `checkpoints` are Unix
   * timestamps (ascending, ≤ `window.resolve`); `mus0`/`sigmas0` are the
   * initial per-checkpoint Gaussian params (WAD), one per checkpoint. The
   * σ-floor + `peak ≤ b` solvency checks apply to every checkpoint.
   */
  init_trajectory: ({k, b, fee_bps, resolver, tier, checkpoints, window_open, window_lock, window_resolve, mus0, sigmas0, usdc}: {k: i128, b: i128, fee_bps: u32, resolver: string, tier: u32, checkpoints: Array<u64>, window_open: u64, window_lock: u64, window_resolve: u64, mus0: Array<i128>, sigmas0: Array<i128>, usdc: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim_trajectory transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claim a resolved trajectory position: returns `collateral +
   * Σ_i (g_i(x_i) − f_i(x_i))` clamped at `0` in USDC (floor 7-dp), deletes
   * the position.
   */
  claim_trajectory: ({position_id}: {position_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a remove_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Burn LP `shares` and withdraw the proportional slice of `pool +
   * fee_pool` in USDC. Allowed once the market is `Resolved`/`Disputable`
   * (pool exposure settled) — minimal scope; mid-life partial withdrawal of
   * *free* collateral is Sprint 5.
   */
  remove_liquidity: ({lp, shares}: {lp: string, shares: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a trade_trajectory transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Submit per-checkpoint beliefs `(μ_i, σ_i)`: for each checkpoint compute
   * the position `g_i − f_i` and its worst-case collateral; the trade's
   * collateral is the sum (the checkpoints are independent ⇒ worst-case of
   * the sum is the sum of worst-cases). Adds the fee, pulls USDC, mints a
   * trajectory position, advances every checkpoint curve to `g_i`.
   */
  trade_trajectory: ({trader, mus2, sigmas2, max_collateral_7dp}: {trader: string, mus2: Array<i128>, sigmas2: Array<i128>, max_collateral_7dp: i128}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a resolved_outcomes transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The realised per-checkpoint outcomes once resolved (trajectory markets).
   */
  resolved_outcomes: (options?: MethodOptions) => Promise<AssembledTransaction<Array<i128>>>

  /**
   * Construct and simulate a get_trajectory_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A stored trajectory position (panics `PositionNotFound` if unknown).
   */
  get_trajectory_position: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<TrajectoryPositionData>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAAAAAAADd2FkAAAAAAAAAAABAAAACw==",
        "AAAAAAAAAMlJbml0aWFsaXNlIGEgZnJlc2hseS1kZXBsb3llZCBzY2FsYXItR2F1c3NpYW4gbWFya2V0LiBTZWUgdGhlIFNwcmludC0xCmRvY3M7IFNwcmludCAyIGFwcGVuZHMgdGhlIGB1c2RjYCBTQUMgY29udHJhY3QgaWQgKHRoZSBzZXR0bGVtZW50IGFzc2V0LApyZXNvbHZlZCBwZXItbmV0d29yayBhdCBkZXBsb3kgdGltZSDigJQgbmV2ZXIgaGFyZGNvZGVkKS4AAAAAAAAEaW5pdAAAAAsAAAAAAAAAAWsAAAAAAAALAAAAAAAAAAFiAAAAAAAACwAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAAAAAAhyZXNvbHZlcgAAABMAAAAAAAAABHRpZXIAAAAEAAAAAAAAAAt3aW5kb3dfb3BlbgAAAAAGAAAAAAAAAAt3aW5kb3dfbG9jawAAAAAGAAAAAAAAAA53aW5kb3dfcmVzb2x2ZQAAAAAABgAAAAAAAAADbXUwAAAAAAsAAAAAAAAABnNpZ21hMAAAAAAACwAAAAAAAAAEdXNkYwAAABMAAAAA",
        "AAAAAAAAAIJDbGFpbSBhIHJlc29sdmVkIHBvc2l0aW9uOiByZXR1cm5zIGBjb2xsYXRlcmFsICsgKGcoeOKCgCkg4oiSIGYoeOKCgCkpYApjbGFtcGVkIGF0IGAwYCBpbiBVU0RDIChmbG9vciA3LWRwKSwgZGVsZXRlcyB0aGUgcG9zaXRpb24uAAAAAAAFY2xhaW0AAAAAAAABAAAAAAAAAAtwb3NpdGlvbl9pZAAAAAAGAAAAAQAAAAs=",
        "AAAAAAAAASVTdWJtaXQgYSBiZWxpZWYgYCjOvOKCgiwgz4PigoIpYDogc2NhbGUgdG8gYM674oKCID0ga8K34oiaKDLPg+KCguKIms+AKWAsIGNvbXB1dGUgdGhlCnBvc2l0aW9uIGBnIOKIkiBmYCBhbmQgd29yc3QtY2FzZSBjb2xsYXRlcmFsLCBhZGQgdGhlIGZlZSwgcHVsbCBVU0RDLCBtaW50CmEgcG9zaXRpb24sIGFkdmFuY2UgdGhlIGN1cnZlIHRvIGBnYCwgcmV0dXJuIHRoZSBwb3NpdGlvbiBpZC4KYG1heF9jb2xsYXRlcmFsXzdkcGAgZ3VhcmRzIHNsaXBwYWdlICh0b3RhbCA9IGNvbGxhdGVyYWwgKyBmZWUsIDctZHApLgAAAAAAAAV0cmFkZQAAAAAAAAQAAAAAAAAABnRyYWRlcgAAAAAAEwAAAAAAAAADbXUyAAAAAAsAAAAAAAAABnNpZ21hMgAAAAAACwAAAAAAAAASbWF4X2NvbGxhdGVyYWxfN2RwAAAAAAALAAAAAQAAAAY=",
        "AAAAAAAAAMRBZnRlciBgd2luZG93LnJlc29sdmVgLCBwdWxsIGB44oKAYCBmcm9tIHRoZSByZXNvbHZlci4gYFN0YWxlYCDih5IgbWFya2V0CmJlY29tZXMgYERpc3B1dGFibGVgIChubyBwYXlvdXRzKS4gYFBlbmRpbmdgIOKHkiByZXZlcnRzCmBSZXNvbHZlck5vdFJlYWR5YC4gT3RoZXJ3aXNlIGBSZXNvbHZlZCh44oKAKWAgYW5kIGBjbGFpbWAgb3BlbnMuAAAAB3Jlc29sdmUAAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAJZ2V0X3N0YXRlAAAAAAAAAAAAAAEAAAfQAAAAC01hcmtldFN0YXRlAA==",
        "AAAAAAAAABdMUCBzaGFyZXMgaGVsZCBieSBgbHBgLgAAAAAJbHBfc2hhcmVzAAAAAAAAAQAAAAAAAAACbHAAAAAAABMAAAABAAAACw==",
        "AAAAAAAAAAAAAAAKZ2V0X3BhcmFtcwAAAAAAAAAAAAEAAAfQAAAADE1hcmtldFBhcmFtcw==",
        "AAAAAAAAADdgKGNvbGxhdGVyYWxfcG9vbF93YWQsIGxwX3RvdGFsX3NoYXJlcywgZmVlX3Bvb2xfd2FkKWAuAAAAAApwb29sX3N0YXRlAAAAAAAAAAAAAQAAA+0AAAADAAAACwAAAAsAAAAL",
        "AAAAAAAAADVMaXZlIHBlci1jaGVja3BvaW50IGN1cnZlcyAodHJhamVjdG9yeSBtYXJrZXRzIG9ubHkpLgAAAAAAAAtnZXRfYmVsaWVmcwAAAAAAAAAAAQAAA+oAAAfQAAAABkJlbGllZgAA",
        "AAAAAAAAAEFBIHN0b3JlZCBwb3NpdGlvbiAocGFuaWNzIGBQb3NpdGlvbk5vdEZvdW5kYCBpZiBjbGFpbWVkL3Vua25vd24pLgAAAAAAAAxnZXRfcG9zaXRpb24AAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAfQAAAADFBvc2l0aW9uRGF0YQ==",
        "AAAAAAAAAOlEZXBvc2l0IFVTREMgaW50byB0aGUgTFAgY29sbGF0ZXJhbCBwb29sOyBtaW50IHNoYXJlcyBwcm8tcmF0YQooYHNoYXJlcyA9IGFtb3VudGAgZm9yIHRoZSBmaXJzdCBMUCwgZWxzZSBgYW1vdW50IMK3IHRvdGFsX3NoYXJlcyAvCnBvb2xgKS4gQWxsb3dlZCBvbmx5IHdoaWxlIHRoZSBtYXJrZXQgaXMgYE9wZW5gLiBUaGUgYHnCtyhi4oiSZilgCmN1cnZlLXNjYWxpbmcgTFAgZGVzaWduIGlzIFNwcmludCA1LgAAAAAAAA1hZGRfbGlxdWlkaXR5AAAAAAAAAgAAAAAAAAACbHAAAAAAABMAAAAAAAAACmFtb3VudF83ZHAAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAADRUaGUgY2hlY2twb2ludCB0aW1lc3RhbXBzICh0cmFqZWN0b3J5IG1hcmtldHMgb25seSkuAAAAD2dldF9jaGVja3BvaW50cwAAAAAAAAAAAQAAA+oAAAAG",
        "AAAAAAAAARdJbml0aWFsaXNlIGEgZnJlc2hseS1kZXBsb3llZCB0cmFqZWN0b3J5IG1hcmtldC4gYGNoZWNrcG9pbnRzYCBhcmUgVW5peAp0aW1lc3RhbXBzIChhc2NlbmRpbmcsIOKJpCBgd2luZG93LnJlc29sdmVgKTsgYG11czBgL2BzaWdtYXMwYCBhcmUgdGhlCmluaXRpYWwgcGVyLWNoZWNrcG9pbnQgR2F1c3NpYW4gcGFyYW1zIChXQUQpLCBvbmUgcGVyIGNoZWNrcG9pbnQuIFRoZQrPgy1mbG9vciArIGBwZWFrIOKJpCBiYCBzb2x2ZW5jeSBjaGVja3MgYXBwbHkgdG8gZXZlcnkgY2hlY2twb2ludC4AAAAAD2luaXRfdHJhamVjdG9yeQAAAAAMAAAAAAAAAAFrAAAAAAAACwAAAAAAAAABYgAAAAAAAAsAAAAAAAAAB2ZlZV9icHMAAAAABAAAAAAAAAAIcmVzb2x2ZXIAAAATAAAAAAAAAAR0aWVyAAAABAAAAAAAAAALY2hlY2twb2ludHMAAAAD6gAAAAYAAAAAAAAAC3dpbmRvd19vcGVuAAAAAAYAAAAAAAAAC3dpbmRvd19sb2NrAAAAAAYAAAAAAAAADndpbmRvd19yZXNvbHZlAAAAAAAGAAAAAAAAAARtdXMwAAAD6gAAAAsAAAAAAAAAB3NpZ21hczAAAAAD6gAAAAsAAAAAAAAABHVzZGMAAAATAAAAAA==",
        "AAAAAAAAAJRDbGFpbSBhIHJlc29sdmVkIHRyYWplY3RvcnkgcG9zaXRpb246IHJldHVybnMgYGNvbGxhdGVyYWwgKwrOo19pIChnX2koeF9pKSDiiJIgZl9pKHhfaSkpYCBjbGFtcGVkIGF0IGAwYCBpbiBVU0RDIChmbG9vciA3LWRwKSwgZGVsZXRlcwp0aGUgcG9zaXRpb24uAAAAEGNsYWltX3RyYWplY3RvcnkAAAABAAAAAAAAAAtwb3NpdGlvbl9pZAAAAAAGAAAAAQAAAAs=",
        "AAAAAAAAAO5CdXJuIExQIGBzaGFyZXNgIGFuZCB3aXRoZHJhdyB0aGUgcHJvcG9ydGlvbmFsIHNsaWNlIG9mIGBwb29sICsKZmVlX3Bvb2xgIGluIFVTREMuIEFsbG93ZWQgb25jZSB0aGUgbWFya2V0IGlzIGBSZXNvbHZlZGAvYERpc3B1dGFibGVgCihwb29sIGV4cG9zdXJlIHNldHRsZWQpIOKAlCBtaW5pbWFsIHNjb3BlOyBtaWQtbGlmZSBwYXJ0aWFsIHdpdGhkcmF3YWwgb2YKKmZyZWUqIGNvbGxhdGVyYWwgaXMgU3ByaW50IDUuAAAAAAAQcmVtb3ZlX2xpcXVpZGl0eQAAAAIAAAAAAAAAAmxwAAAAAAATAAAAAAAAAAZzaGFyZXMAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAV1TdWJtaXQgcGVyLWNoZWNrcG9pbnQgYmVsaWVmcyBgKM68X2ksIM+DX2kpYDogZm9yIGVhY2ggY2hlY2twb2ludCBjb21wdXRlCnRoZSBwb3NpdGlvbiBgZ19pIOKIkiBmX2lgIGFuZCBpdHMgd29yc3QtY2FzZSBjb2xsYXRlcmFsOyB0aGUgdHJhZGUncwpjb2xsYXRlcmFsIGlzIHRoZSBzdW0gKHRoZSBjaGVja3BvaW50cyBhcmUgaW5kZXBlbmRlbnQg4oeSIHdvcnN0LWNhc2Ugb2YKdGhlIHN1bSBpcyB0aGUgc3VtIG9mIHdvcnN0LWNhc2VzKS4gQWRkcyB0aGUgZmVlLCBwdWxscyBVU0RDLCBtaW50cyBhCnRyYWplY3RvcnkgcG9zaXRpb24sIGFkdmFuY2VzIGV2ZXJ5IGNoZWNrcG9pbnQgY3VydmUgdG8gYGdfaWAuAAAAAAAAEHRyYWRlX3RyYWplY3RvcnkAAAAEAAAAAAAAAAZ0cmFkZXIAAAAAABMAAAAAAAAABG11czIAAAPqAAAACwAAAAAAAAAHc2lnbWFzMgAAAAPqAAAACwAAAAAAAAASbWF4X2NvbGxhdGVyYWxfN2RwAAAAAAALAAAAAQAAAAY=",
        "AAAAAAAAAEhUaGUgcmVhbGlzZWQgcGVyLWNoZWNrcG9pbnQgb3V0Y29tZXMgb25jZSByZXNvbHZlZCAodHJhamVjdG9yeSBtYXJrZXRzKS4AAAARcmVzb2x2ZWRfb3V0Y29tZXMAAAAAAAAAAAAAAQAAA+oAAAAL",
        "AAAAAAAAAERBIHN0b3JlZCB0cmFqZWN0b3J5IHBvc2l0aW9uIChwYW5pY3MgYFBvc2l0aW9uTm90Rm91bmRgIGlmIHVua25vd24pLgAAABdnZXRfdHJhamVjdG9yeV9wb3NpdGlvbgAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAfQAAAAFlRyYWplY3RvcnlQb3NpdGlvbkRhdGEAAA==",
        "AAAABQAAADlFbWl0dGVkIGJ5IGBEaXN0cmlidXRpb25NYXJrZXQ6OnRyYWRlYCAodG9waWMgYCJ0cmFkZSJgKS4AAAAAAAAAAAAABVRyYWRlAAAAAAAAAQAAAAV0cmFkZQAAAAAAAAUAAAATUG9zaXRpb24gaWQgbWludGVkLgAAAAACaWQAAAAAAAYAAAAAAAAAC1RoZSB0cmFkZXIuAAAAAAZ0cmFkZXIAAAAAABMAAAAAAAAAGENvbGxhdGVyYWwgbG9ja2VkIChXQUQpLgAAAApjb2xsYXRlcmFsAAAAAAALAAAAAAAAAA9GZWUgcGFpZCAoV0FEKS4AAAAAA2ZlZQAAAAALAAAAAAAAAClUaGUgbmV3IGFnZ3JlZ2F0ZSBiZWxpZWYgYWZ0ZXIgdGhlIHRyYWRlLgAAAAAAAAZiZWxpZWYAAAAAB9AAAAAGQmVsaWVmAAAAAAAAAAAAAg==",
        "AAAAAQAAAN1BIEdhdXNzaWFuIGJlbGllZiBjdXJ2ZSwgc3RvcmVkIGFzIHBhcmFtZXRlcnMgKEFEUi0yKTogYGYoeCkgPSDOuyDCtyDPhl97zrwsz4N9KHgpYAp3aXRoIGDOuyA9IGvCt+KImigyz4PiiJrPgClgIHNvIGDigJZm4oCW4oKCID0ga2AuIEFsbCBXQUQuIGDOu2AgaXMgZGVyaXZlZCBhbmQgc3RvcmVkCnJlZHVuZGFudGx5IHNvIHJlYWRzIG5ldmVyIHJlY29tcHV0ZSBhIHNxdWFyZSByb290LgAAAAAAAAAAAAAGQmVsaWVmAAAAAAADAAAAPFNjYWxlIGDOuyA9IGvCt+KImigyz4PiiJrPgClgIChXQUQpLiBEZXJpdmVkIGZyb20gYChrLCDPgylgLgAAAAZsYW1iZGEAAAAAAAsAAAAhQ2VudGVyIGDOvGAgKG91dGNvbWUgdW5pdHMsIFdBRCkuAAAAAAAAAm11AAAAAAALAAAATVdpZHRoIGDPg2AgKG91dGNvbWUgdW5pdHMsIFdBRCkuIE11c3Qgc2F0aXNmeSBgz4Mg4omlIM+DX21pbmAgZm9yIHRoZSBtYXJrZXQuAAAAAAAABXNpZ21hAAAAAAAACw==",
        "AAAABQAAAD5FbWl0dGVkIGJ5IGBEaXN0cmlidXRpb25NYXJrZXQ6OnJlc29sdmVgICh0b3BpYyBgInJlc29sdmVkImApLgAAAAAAAAAAAAhSZXNvbHZlZAAAAAEAAAAIcmVzb2x2ZWQAAAABAAAAHlJlYWxpc2VkIG91dGNvbWUgYHjigoBgIChXQUQpLgAAAAAAAngwAAAAAAALAAAAAAAAAAI=",
        "AAAABAAAALlDYW5vbmljYWwgZXJyb3Igc3BhY2UgZm9yIHRoZSBLYWlkbyBjb250cmFjdHMuIE51bWVyaWMgdmFsdWVzIGFyZSBzdGFibGUg4oCUCm9mZi1jaGFpbiBjb2RlIChTREssIGluZGV4ZXIpIG1hcHMgdGhlbSB0byBtZXNzYWdlcywgc28gKipuZXZlciByZW51bWJlciBhbgpleGlzdGluZyB2YXJpYW50Kio7IG9ubHkgYXBwZW5kLgAAAAAAAAAAAAAKS2FpZG9FcnJvcgAAAAAAHgAAADZUaGUgY29udHJhY3QgaGFzIGFscmVhZHkgYmVlbiBjb25zdHJ1Y3RlZC9pbml0aWFsaXNlZC4AAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAEAAAA2VGhlIGNvbnRyYWN0IGhhcyBub3QgYmVlbiBjb25zdHJ1Y3RlZC9pbml0aWFsaXNlZCB5ZXQuAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAIAAAAtVGhlIGNhbGxlciBpcyBub3QgYXV0aG9yaXNlZCBmb3IgdGhpcyBhY3Rpb24uAAAAAAAADFVuYXV0aG9yaXplZAAAAAMAAAAeYGtgIG11c3QgYmUgc3RyaWN0bHkgcG9zaXRpdmUuAAAAAAAISW52YWxpZEsAAAAKAAAAK2BiYCAoY29sbGF0ZXJhbCkgbXVzdCBiZSBzdHJpY3RseSBwb3NpdGl2ZS4AAAAACEludmFsaWRCAAAACwAAACNgZmVlX2Jwc2AgZXhjZWVkcyB0aGUgcHJvdG9jb2wgY2FwLgAAAAAKRmVlVG9vSGlnaAAAAAAADAAAAFVXaW5kb3cgdGltZXN0YW1wcyBhcmUgb3V0IG9mIG9yZGVyIChuZWVkIGBvcGVuIOKJpCBsb2NrIOKJpCByZXNvbHZlYCkgb3IgaW4KdGhlIHBhc3QuAAAAAAAADUludmFsaWRXaW5kb3cAAAAAAAANAAAANlRoZSBpbml0aWFsIC8gc3VibWl0dGVkIGDPg2AgaXMgbm90IHN0cmljdGx5IHBvc2l0aXZlLgAAAAAADEludmFsaWRTaWdtYQAAAA4AAABjVGhlIHN1Ym1pdHRlZCBiZWxpZWYncyBgz4NgIGlzIGJlbG93IHRoZSBtYXJrZXQncyBgz4NfbWluYCBmbG9vcgood2hpdGVwYXBlciDCpzEwIG9wdGlvbiAxOyBBRFItMykuAAAAAA9TaWdtYUJlbG93Rmxvb3IAAAAADwAAAI5UaGUgcmVzdWx0aW5nIHBheW91dCBjdXJ2ZSB3b3VsZCBleGNlZWQgdGhlIGNvbGxhdGVyYWwgYGJgIGF0IHNvbWUgcG9pbnQK4oCUIGkuZS4gdGhlIHNvbHZlbmN5IGludmFyaWFudCBgbWF4X3ggZih4KSDiiaQgYmAgd291bGQgYmUgdmlvbGF0ZWQuAAAAAAAVUGVha0V4Y2VlZHNDb2xsYXRlcmFsAAAAAAAAEAAAAEVUaGUgY2FwcGVkLUdhdXNzaWFuIHBhcmFtZXRlcmlzYXRpb24gaXMgbm90IGF2YWlsYWJsZSB5ZXQgKFNwcmludCA1KS4AAAAAAAASQ2FwcGVkTm90U3VwcG9ydGVkAAAAAAARAAAARFRoZSB0cmFqZWN0b3J5IG91dGNvbWUgc3BhY2UgaXMgbm90IGF2YWlsYWJsZSB5ZXQgKFNwcmludCAyLCBBRFItNCkuAAAAFlRyYWplY3RvcnlOb3RTdXBwb3J0ZWQAAAAAABIAAABMVGhlIG51bWVyaWMgcmVzb2x2ZXItdGllciBjb2RlIGlzIG5vdCBvbmUgb2YgYDAuLj0zYCAoc2VlIFtgUmVzb2x2ZXJUaWVyYF0pLgAAAAtJbnZhbGlkVGllcgAAAAATAAAAQlRoZSBtYXJrZXQgaXMgbm90IGluIHRoZSBgT3BlbmAgc3RhdGUgKHRyYWRpbmcgd2luZG93IG5vdCBhY3RpdmUpLgAAAAAADU1hcmtldE5vdE9wZW4AAAAAAAAeAAAAOlRoZSBtYXJrZXQgaXMgbG9ja2VkIChubyBtb3JlIHRyYWRlcykgb3IgYWxyZWFkeSByZXNvbHZlZC4AAAAAAAxNYXJrZXRDbG9zZWQAAAAfAAAALWByZXNvbHZlKClgIHdhcyBjYWxsZWQgYmVmb3JlIGByZXNvbHZlX3RpbWVgLgAAAAAAABFOb3RZZXRSZXNvbHZlVGltZQAAAAAAACAAAAAfVGhlIG1hcmtldCBpcyBhbHJlYWR5IHJlc29sdmVkLgAAAAAPQWxyZWFkeVJlc29sdmVkAAAAACEAAABDU2xpcHBhZ2UgZ3VhcmQ6IHRoZSByZXF1aXJlZCBjb2xsYXRlcmFsIGV4Y2VlZHMgdGhlIGNhbGxlcidzIGBtYXhgLgAAAAAQU2xpcHBhZ2VFeGNlZWRlZAAAACIAAABJVGhlIHJlc29sdmVyIGhhcyBubyB2YWx1ZSB5ZXQgKHN0aWxsIGBQZW5kaW5nYCkg4oCUIHRvbyBlYXJseSB0byByZXNvbHZlLgAAAAAAABBSZXNvbHZlck5vdFJlYWR5AAAAIwAAAGxUaGUgcmVzb2x2ZXIncyB1bmRlcmx5aW5nIG9yYWNsZSBpcyBzdGFsZSAvIG1pc3Npbmcg4oCUIG1hcmtldCBpcyBwYXVzZWQKKGBEaXNwdXRhYmxlYCksIG5ldmVyIGEgYmFkIHBheW91dC4AAAALT3JhY2xlU3RhbGUAAAAAJAAAAEZgY2xhaW1gIC8gYHJlbW92ZV9saXF1aWRpdHlgIGNhbGxlZCB3aGVuIHRoZXJlIGlzIG5vdGhpbmcgdG8gd2l0aGRyYXcuAAAAAAARTm90aGluZ1RvV2l0aGRyYXcAAAAAAAAlAAAASU5vdCBlbm91Z2ggZnJlZSAodW5sb2NrZWQpIGNvbGxhdGVyYWwgaW4gdGhlIHBvb2wgZm9yIHRoaXMgTFAgd2l0aGRyYXdhbC4AAAAAAAAVSW5zdWZmaWNpZW50TGlxdWlkaXR5AAAAAAAAJgAAAB5ObyBwb3NpdGlvbiB3aXRoIHRoZSBnaXZlbiBpZC4AAAAAABBQb3NpdGlvbk5vdEZvdW5kAAAAJwAAACZUaGUgY2FsbGVyIGRvZXMgbm90IG93biB0aGlzIHBvc2l0aW9uLgAAAAAAEE5vdFBvc2l0aW9uT3duZXIAAAAoAAAARlRoZSBtYXJrZXQgaXMgbm90IGluIHRoZSBgUmVzb2x2ZWRgIHN0YXRlIChzbyBjbGFpbXMgYXJlbid0IG9wZW4geWV0KS4AAAAAABFNYXJrZXROb3RSZXNvbHZlZAAAAAAAACkAAACAVGhlIHN1Ym1pdHRlZCBiZWxpZWYncyBwZWFrIGV4Y2VlZHMgdGhlIG1hcmtldCdzIGNvbGxhdGVyYWwgYGJgIGV2ZW4KdGhvdWdoIGDPgyDiiaUgz4NfbWluYCDigJQgYSByb3VuZGluZy1lZGdlIHNvbHZlbmN5IHJlamVjdC4AAAAMUGVha0V4Y2VlZHNCAAAAKgAAAElBIG5vbi1wb3NpdGl2ZSBhbW91bnQgd2FzIHBhc3NlZCB3aGVyZSBhIHN0cmljdGx5LXBvc2l0aXZlIG9uZSBpcyBuZWVkZWQuAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAArAAAAo0hvdXNlVmF1bHQ6IHRoZSBwcm9wb3NlZCBzZWVkIHdvdWxkIHB1c2ggY3VtdWxhdGl2ZSBleHBvc3VyZSB0byB0aGlzCm1hcmtldCBhYm92ZSB0aGUgb24tY2hhaW4gcGVyLW1hcmtldCBjYXAuIFNldCB0aGUgY2FwIGV4cGxpY2l0bHkgdmlhCmBzZXRfY2FwYCBiZWZvcmUgc2VlZGluZy4AAAAAC0NhcEV4Y2VlZGVkAAAAACwAAAB7SG91c2VWYXVsdDogY2FwIGZvciB0aGlzIG1hcmtldCBpcyBub3QgY29uZmlndXJlZCAoZGVmYXVsdHMgdG8gMCkuIFRoZQphZG1pbiBtdXN0IGNhbGwgYHNldF9jYXBgIGJlZm9yZSBzZWVkaW5nIHRoZSBtYXJrZXQuAAAAAAlDYXBOb3RTZXQAAAAAAAAtAAAAZUEgZml4ZWQtcG9pbnQgY29tcHV0YXRpb24gb3ZlcmZsb3dlZCBgaTEyOGAgKGEgYnVnIC8gb3V0LW9mLWVudmVsb3BlCmlucHV0IOKAlCBzZWUgYGthaWRvX21hdGg6OmZwYCkuAAAAAAAADE1hdGhPdmVyZmxvdwAAADI=",
        "AAAAAQAAAOhUaGUgc3VtbWFyeSB0aGUgW2BSZWdpc3RyeWBdIGluZGV4ZXMgZm9yIGVhY2ggbWFya2V0IOKAlCBlbm91Z2ggZm9yIHRoZQpmcm9udGVuZCdzIG1hcmtldCBsaXN0IHdpdGhvdXQgYSBwZXItbWFya2V0IGBnZXRfcGFyYW1zYCByb3VuZC10cmlwLiBUaGUKbWFya2V0IGNvbnRyYWN0IGl0c2VsZiBzdGF5cyB0aGUgc291cmNlIG9mIHRydXRoIGZvciBsaXZlIHN0YXRlIChiZWxpZWYsCnN0YXR1cywgcG9vbCkuAAAAAAAAAApNYXJrZXRJbmZvAAAAAAAIAAAAFUNhcHBlZC1HYXVzc2lhbiBmbGFnLgAAAAAAAAZjYXBwZWQAAAAAAAEAAAA/V2hvIGNyZWF0ZWQgdGhlIG1hcmtldCAoY2FsbGVkIGBNYXJrZXRGYWN0b3J5OjpjcmVhdGVfbWFya2V0YCkuAAAAAAdjcmVhdG9yAAAAABMAAAArVGhlIGRlcGxveWVkIGBEaXN0cmlidXRpb25NYXJrZXRgIGNvbnRyYWN0LgAAAAAGbWFya2V0AAAAAAATAAAAFlNjYWxhciB2cy4gdHJhamVjdG9yeS4AAAAAAA1vdXRjb21lX3NwYWNlAAAAAAAH0AAAAAxPdXRjb21lU3BhY2UAAAAYQmVsaWVmIHBhcmFtZXRlcmlzYXRpb24uAAAAEHBhcmFtZXRlcml6YXRpb24AAAfQAAAAEFBhcmFtZXRlcml6YXRpb24AAAAWVGhlIHJlc29sdmVyIGNvbnRyYWN0LgAAAAAACHJlc29sdmVyAAAAEwAAADxUaGUgcmVzb2x2ZXIncyBkZWNsYXJlZCB0cnVzdCB0aWVyICh0aGUgVUkgYmFkZ2Ug4oCUIEFEUi01KS4AAAAEdGllcgAAB9AAAAAMUmVzb2x2ZXJUaWVyAAAAIU9wZW4gLyBsb2NrIC8gcmVzb2x2ZSB0aW1lc3RhbXBzLgAAAAAAAAZ3aW5kb3cAAAAAB9AAAAAMTWFya2V0V2luZG93",
        "AAAAAQAAAHVXaGF0IGBEaXN0cmlidXRpb25NYXJrZXQ6OmdldF9zdGF0ZSgpYCByZXR1cm5zOiB0aGUgbGl2ZSBiZWxpZWYsIHRoZSBzdGF0dXMsCmFuZCB0aGUgKGNvbnN0cnVjdG9yLWNvbXB1dGVkKSDPgy1mbG9vci4AAAAAAAAAAAAAC01hcmtldFN0YXRlAAAAAAMAAAAuQ3VycmVudCBhZ2dyZWdhdGUgYmVsaWVmIGN1cnZlIGAozrwsIM+DLCDOuylgLgAAAAAABmJlbGllZgAAAAAH0AAAAAZCZWxpZWYAAAAAAE1gz4NfbWluKGssIGIpYCBmb3IgdGhpcyBtYXJrZXQg4oCUIHRoZSBzbWFsbGVzdCBgz4NgIGEgdHJhZGUgbWF5IHNldCAoQURSLTMpLgAAAAAAAAlzaWdtYV9taW4AAAAAAAALAAAAGUN1cnJlbnQgbGlmZWN5Y2xlIHN0YXR1cy4AAAAAAAAGc3RhdHVzAAAAAAfQAAAADE1hcmtldFN0YXR1cw==",
        "AAAAAQAAAINgTSA9ICggT3V0Y29tZVNwYWNlLCBQYXJhbWV0ZXJpemF0aW9uLCBrLCBiLCBmZWUsIFJlc29sdmVyLCBXaW5kb3cgKWAKKHdoaXRlcGFwZXIgwqcxNSkuIEFsbCBudW1lcmljIGZpZWxkcyBhcmUgV0FELXNjYWxlZCAoQURSLTIpLgAAAAAAAAAADE1hcmtldFBhcmFtcwAAAAkAAABuUGVyLW91dGNvbWUgY29sbGF0ZXJhbCBgYmAuIFdBRC4gTXVzdCBiZSBgPiAwYC4gKENvbnZlcnRlZCBmcm9tIGEgNy1kcApVU0RDIGRlcG9zaXQgYXQgdGhlIGNvbnRyYWN0IGJvdW5kYXJ5LikAAAAAAAFiAAAAAAAACwAAAJhgZmFsc2VgIOKHkiDPgy1mbG9vciBlbmZvcmNlbWVudCAoZGVmYXVsdDsgQURSLTMpLiBgdHJ1ZWAg4oeSIGNhcHBlZCBHYXVzc2lhbgpgZih4KSA9IG1pbihiLCDOu8+GKHgpKWAg4oCUIHJlc2VydmVkIGZvciBTcHJpbnQgNTsgYGluaXRgIHJlamVjdHMgaXQgbm93LgAAAAZjYXBwZWQAAAAAAAEAAABBVHJhZGUgZmVlIGluIGJhc2lzIHBvaW50cyAoMSBicCA9IDAuMDElKS4gQ2FwcGVkIGJ5IHRoZSBjb250cmFjdC4AAAAAAAAHZmVlX2JwcwAAAAAEAAAAR0zCsi1ub3JtIGxpcXVpZGl0eSBjb25zdGFudCBga2AgKGDigJZm4oCW4oKCID0ga2ApLiBXQUQuIE11c3QgYmUgYD4gMGAuAAAAAAFrAAAAAAAACwAAABZTY2FsYXIgdnMuIHRyYWplY3RvcnkuAAAAAAANb3V0Y29tZV9zcGFjZQAAAAAAB9AAAAAMT3V0Y29tZVNwYWNlAAAAKUJlbGllZiBwYXJhbWV0ZXJpc2F0aW9uIChHYXVzc2lhbiBpbiB2MSkuAAAAAAAAEHBhcmFtZXRlcml6YXRpb24AAAfQAAAAEFBhcmFtZXRlcml6YXRpb24AAABHVGhlIHJlc29sdmVyIGNvbnRyYWN0IChpbXBsZW1lbnRzIHRoZSBgUmVzb2x2ZXJgIGludGVyZmFjZTsgU3ByaW50IDIrKS4AAAAACHJlc29sdmVyAAAAEwAAAE5UaGUgcmVzb2x2ZXIncyBkZWNsYXJlZCB0cnVzdCB0aWVyIOKAlCByZW5kZXJlZCBhcyBhIGJhZGdlIGV2ZXJ5d2hlcmUKKEFEUi01KS4AAAAAAAR0aWVyAAAH0AAAAAxSZXNvbHZlclRpZXIAAAAhT3BlbiAvIGxvY2sgLyByZXNvbHZlIHRpbWVzdGFtcHMuAAAAAAAABndpbmRvdwAAAAAH0AAAAAxNYXJrZXRXaW5kb3c=",
        "AAAAAgAAAK1MaWZlY3ljbGUgc3RhdHVzIG9mIGEgbWFya2V0LiBTcHJpbnQgMSBvbmx5IGV2ZXIgc2V0cyBgT3BlbmAgKG5vCnRyYWRpbmcvcmVzb2x1dGlvbiB5ZXQpOyBgTG9ja2VkYCAvIGBSZXNvbHZlZGAgYW5kIHRoZSBvcmFjbGUtZmFpbHVyZQpgRGlzcHV0YWJsZWAgc3RhdGUgYXJyaXZlIGluIFNwcmludCAyLgAAAAAAAAAAAAAMTWFya2V0U3RhdHVzAAAABQAAAAAAAAAWVHJhZGluZyB3aW5kb3cgYWN0aXZlLgAAAAAABE9wZW4AAAAAAAAAMVBhc3QgYGxvY2tgLCBiZWZvcmUgYHJlc29sdmVgIOKAlCBubyBtb3JlIHRyYWRlcy4AAAAAAAAGTG9ja2VkAAAAAAABAAAARVJlc29sdmVkOyBwYXlvdXRzIHNldHRsZWQuIChDYXJyaWVzIHRoZSByZWFsaXNlZCBvdXRjb21lIHZhbHVlLCBXQUQuKQAAAAAAAAhSZXNvbHZlZAAAAAEAAAALAAAAAAAAAIVBIHRyYWplY3RvcnkgbWFya2V0LCByZXNvbHZlZDsgdGhlIHJlYWxpc2VkIHBlci1jaGVja3BvaW50IHZhbHVlcyBhcmUKc3RvcmVkIGFsb25nc2lkZSAoc2VlIGBEaXN0cmlidXRpb25NYXJrZXQ6OnJlc29sdmVkX291dGNvbWVzYCkuAAAAAAAAC1Jlc29sdmVkVmVjAAAAAAAAAAB5VGhlIHJlc29sdmVyIHJldHVybmVkIGEgc3RhbGUvZ2FyYmFnZSB2YWx1ZSDigJQgbWFya2V0IGlzIHBhdXNlZCBwZW5kaW5nIGEKZGlzcHV0ZSwgbmV2ZXIgYSBiYWQgcGF5b3V0IChBRFItNTsgU3ByaW50IDIpLgAAAAAAAApEaXNwdXRhYmxlAAA=",
        "AAAAAQAAAJFUcmFkaW5nIHdpbmRvdyDigJQgVW5peCB0aW1lc3RhbXBzIChsZWRnZXIgdGltZSwgc2Vjb25kcykuIFJlcXVpcmVzCmBvcGVuIOKJpCBsb2NrIOKJpCByZXNvbHZlYCBhbmQgYHJlc29sdmVgIGluIHRoZSBmdXR1cmUgYXQgY29uc3RydWN0aW9uIHRpbWUuAAAAAAAAAAAAAAxNYXJrZXRXaW5kb3cAAAADAAAAJFdoZW4gdHJhZGluZyBsb2NrcyAobm8gbW9yZSB0cmFkZXMpLgAAAARsb2NrAAAABgAAABNXaGVuIHRyYWRpbmcgb3BlbnMuAAAAAARvcGVuAAAABgAAACJXaGVuIGByZXNvbHZlKClgIGJlY29tZXMgY2FsbGFibGUuAAAAAAAHcmVzb2x2ZQAAAAAG",
        "AAAAAgAAAOFUaGUgc2hhcGUgb2YgYSBtYXJrZXQncyBvdXRjb21lLiBTcHJpbnQgMSBzaGlwcyAqKnNjYWxhcioqIG1hcmtldHMgb25seTsKdHJhamVjdG9yeSBtYXJrZXRzIChhIHBhdGggc2FtcGxlZCBhdCBjaGVja3BvaW50cykgbGFuZCBpbiBTcHJpbnQgMiAoQURSLTQpCmFzIGFuIGFkZGl0aW9uYWwgdmFyaWFudCDigJQgYWRkaW5nIGl0IGlzIG5vbi1icmVha2luZyBmb3IgZXhpc3RpbmcgbWFya2V0cy4AAAAAAAAAAAAADE91dGNvbWVTcGFjZQAAAAIAAAAAAAAAflRoZSBvdXRjb21lIGlzIGEgc2luZ2xlIHJlYWwgbnVtYmVyIChhIHByaWNlIGF0IGBUYCwgYW4gZWxlY3Rpb24gbWFyZ2luLAphIHJhaW5mYWxsIGluIG1tLCDigKYpLiBUaGUgYmVsaWVmIGlzIG9uZSBbYEJlbGllZmBdLgAAAAAABlNjYWxhcgAAAAAAAQAAAPtUaGUgb3V0Y29tZSBpcyBhIHBhdGggc2FtcGxlZCBhdCBOIGNoZWNrcG9pbnQgdGltZXN0YW1wcyAoVW5peApzZWNvbmRzLCBhc2NlbmRpbmcpLiBUaGUgYmVsaWVmIGlzIG9uZSBbYEJlbGllZmBdIHBlciBjaGVja3BvaW50OyB0aGUKY2hlY2twb2ludHMgc2hhcmUgb25lIGNvbGxhdGVyYWwgcG9vbCAod2hpdGVwYXBlciDCpzE2OyBBRFItNCkuIHYxCnRyZWF0cyB0aGUgcGVyLWNoZWNrcG9pbnQgR2F1c3NpYW5zIGFzIGluZGVwZW5kZW50LgAAAAAKVHJhamVjdG9yeQAAAAAAAQAAA+oAAAAG",
        "AAAAAQAAASxBIHRyYWRlcidzIHBvc2l0aW9uOiB0aGUgbWFya2V0IGN1cnZlIGltbWVkaWF0ZWx5ICpiZWZvcmUqIHRoZSB0cmFkZSAoYGZgKQphbmQgaW1tZWRpYXRlbHkgKmFmdGVyKiAoYGdgKSwgdGhlIGNvbGxhdGVyYWwgbG9ja2VkLCBhbmQgdGhlIG93bmVyIOKAlApldmVyeXRoaW5nIG5lZWRlZCB0byBjb21wdXRlIHRoZSBwYXlvdXQgYGcoeOKCgCkg4oiSIGYoeOKCgClgIGF0IHJlc29sdXRpb24Kd2l0aG91dCBzdG9yaW5nIGFueSBjdXJ2ZSBhcnJheSAoQURSLTIsIHdoaXRlcGFwZXIgwqcxMSkuIFVzZWQgZnJvbSBTcHJpbnQgMi4AAAAAAAAADFBvc2l0aW9uRGF0YQAAAAQAAAAqTWFya2V0IGJlbGllZiBqdXN0IGFmdGVyIHRoaXMgdHJhZGUgKGBnYCkuAAAAAAAFYWZ0ZXIAAAAAAAfQAAAABkJlbGllZgAAAAAAK01hcmtldCBiZWxpZWYganVzdCBiZWZvcmUgdGhpcyB0cmFkZSAoYGZgKS4AAAAABmJlZm9yZQAAAAAH0AAAAAZCZWxpZWYAAAAAAEdDb2xsYXRlcmFsIHRoZSB0cmFkZXIgbG9ja2VkID0gd29yc3QtY2FzZSBsb3NzIGDiiJJtaW5feChn4oiSZilgIChXQUQpLgAAAAAKY29sbGF0ZXJhbAAAAAAACwAAABNXaG8gb3ducyB0aGUgY2xhaW0uAAAAAAVvd25lcgAAAAAAABM=",
        "AAAAAwAAAOJUcnVzdCB0aWVyIGEgcmVzb2x2ZXIgZGVjbGFyZXMuIFN0b3JlZCBvbi1jaGFpbiBpbiBbYE1hcmtldFBhcmFtc2BdIHNvIHRoZQpmcm9udGVuZCByZW5kZXJzIHRoZSBiYWRnZSBmcm9tIHRoZSBzb3VyY2Ugb2YgdHJ1dGgsIG5vdCBmcm9tIG9mZi1jaGFpbgptZXRhZGF0YS4gTnVtZXJpYyB2YWx1ZXMgbWF0Y2ggdGhlIGBUMOKAplQzYCBuYW1pbmcgaW4gQURSLTUgLyB3aGl0ZXBhcGVyIMKnMTcuAAAAAAAAAAAADFJlc29sdmVyVGllcgAAAAQAAABnKipUMCoqIOKAlCByZWFkcyBhIHJvYnVzdCBvbi1jaGFpbiBwcmljZSBmZWVkIChSZWZsZWN0b3IgU0VQLTQwKS4gVGhlCmxhdW5jaCB0aWVyIChDaGFydEd1ZXNzci1vbi1CVEMpLgAAAAAJUmVmbGVjdG9yAAAAAAAAAAAAAE8qKlQxKiog4oCUIGEgc2lnbmVkIHJlcG9ydCBmcm9tIGEgcGVybWlzc2lvbmVkIHBvc3Rlciwgd2l0aCBhIGNoYWxsZW5nZQp3aW5kb3cuAAAAAAhBdHRlc3RlZAAAAAEAAABUKipUMioqIOKAlCBvcHRpbWlzdGljIHByb3Bvc2UvZGlzcHV0ZSB3aXRoIGJvbmRzOyB1bmRpc3B1dGVkLWFmdGVyLXdpbmRvdwrih5IgZmluYWwuAAAACk9wdGltaXN0aWMAAAAAAAIAAABFKipUMyoqIOKAlCBhIHNpbmdsZSBuYW1lZCBwYXJ0eSByZXBvcnRzLiBQdXJlIHRydXN0LCBjbGVhcmx5IGZsYWdnZWQuAAAAAAAACkRlc2lnbmF0ZWQAAAAAAAM=",
        "AAAABQAAAJxFbWl0dGVkIGJ5IGBEaXN0cmlidXRpb25NYXJrZXQ6OmluaXRgIChhbmQsIGZyb20gU3ByaW50IDMsIGJ5IGBNYXJrZXRGYWN0b3J5YAp3aGVuIGl0IGRlcGxveXMgKyBpbml0aWFsaXNlcyBvbmUpOiBhIG5ldyBtYXJrZXQgZXhpc3RzLCBzZWVkZWQgd2l0aCBgYmVsaWVmYC4AAAAAAAAADU1hcmtldENyZWF0ZWQAAAAAAAABAAAADm1hcmtldF9jcmVhdGVkAAAAAAADAAAAKVRoZSBtYXJrZXQncyBpbW11dGFibGUgc2V2ZW4tZmllbGQgdHVwbGUuAAAAAAAABnBhcmFtcwAAAAAH0AAAAAxNYXJrZXRQYXJhbXMAAAAAAAAANFRoZSBpbml0aWFsIGFnZ3JlZ2F0ZSBjdXJ2ZSBgKM684oKALCDPg+KCgCwgzrvigoApYC4AAAAGYmVsaWVmAAAAAAfQAAAABkJlbGllZgAAAAAAAAAAAB5gz4NfbWluKGssIGIpYCBmb3IgdGhlIG1hcmtldC4AAAAAAAlzaWdtYV9taW4AAAAAAAALAAAAAAAAAAI=",
        "AAAAAgAAADNTdGF0dXMgYSByZXNvbHZlciByZXBvcnRzIGZvciBpdHMgbWFya2V0J3Mgb3V0Y29tZS4AAAAAAAAAAA5SZXNvbHZlclN0YXR1cwAAAAAABAAAAAAAAAAvTm90IGF2YWlsYWJsZSB5ZXQgKGUuZy4gYmVmb3JlIGByZXNvbHZlX3RpbWVgKS4AAAAAB1BlbmRpbmcAAAAAAQAAADhBdmFpbGFibGUg4oCUIGNhcnJpZXMgdGhlIHJlYWxpc2VkIG91dGNvbWUgYHjigoBgIChXQUQpLgAAAAhSZXNvbHZlZAAAAAEAAAALAAAAAQAAAGtBdmFpbGFibGUgZm9yIGEgdHJhamVjdG9yeSBtYXJrZXQg4oCUIHRoZSByZWFsaXNlZCB2YWx1ZSBhdCBlYWNoCmNoZWNrcG9pbnQsIGluIGNoZWNrcG9pbnQgb3JkZXIgKGFsbCBXQUQpLgAAAAALUmVzb2x2ZWRWZWMAAAAAAQAAA+oAAAALAAAAAAAAAFxUaGUgdW5kZXJseWluZyBzb3VyY2UgaXMgc3RhbGUvZ2FyYmFnZTsgdGhlIG1hcmtldCBzaG91bGQgcGF1c2UKKGBEaXNwdXRhYmxlYCksIG5vdCBwYXkgb3V0LgAAAAVTdGFsZQAAAA==",
        "AAAABQAAAEtFbWl0dGVkIGJ5IGBEaXN0cmlidXRpb25NYXJrZXQ6OmFkZF9saXF1aWRpdHlgICh0b3BpYyBgImxpcXVpZGl0eV9hZGRlZCJgKS4AAAAAAAAAAA5MaXF1aWRpdHlBZGRlZAAAAAAAAQAAAA9saXF1aWRpdHlfYWRkZWQAAAAAAwAAAAdUaGUgTFAuAAAAAAJscAAAAAAAEwAAAAAAAAASVVNEQyBhZGRlZCAoNy1kcCkuAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAA5TaGFyZXMgbWludGVkLgAAAAAABnNoYXJlcwAAAAAACwAAAAAAAAAC",
        "AAAABQAAAE9FbWl0dGVkIGJ5IGBEaXN0cmlidXRpb25NYXJrZXQ6OnRyYWRlX3RyYWplY3RvcnlgICh0b3BpYyBgInRyYWRlX3RyYWplY3RvcnkiYCkuAAAAAAAAAAAPVHJhZGVUcmFqZWN0b3J5AAAAAAEAAAAQdHJhZGVfdHJhamVjdG9yeQAAAAQAAAATUG9zaXRpb24gaWQgbWludGVkLgAAAAACaWQAAAAAAAYAAAAAAAAAC1RoZSB0cmFkZXIuAAAAAAZ0cmFkZXIAAAAAABMAAAAAAAAAIkFnZ3JlZ2F0ZSBjb2xsYXRlcmFsIGxvY2tlZCAoV0FEKS4AAAAAAApjb2xsYXRlcmFsAAAAAAALAAAAAAAAAA9GZWUgcGFpZCAoV0FEKS4AAAAAA2ZlZQAAAAALAAAAAAAAAAI=",
        "AAAAAgAAAUZIb3cgYSBiZWxpZWYgaXMgcGFyYW1ldGVyaXNlZC4gU3ByaW50IDEgc2hpcHMgYEdhdXNzaWFuYCBvbmx5OyByaWNoZXIKZmFtaWxpZXMgKHJpZ2h0LXNrZXdlZCwgbXVsdGktbW9kYWwg4oCUIGJ1aWxkLm1kIEUxOCwgcG9zdC1NMykgYXJlIGFkZGVkIGFzCmZ1cnRoZXIgdmFyaWFudHMuIChgI1tjb250cmFjdHR5cGVdYCBlbnVtIHZhcmlhbnRzIGNhbid0IGNhcnJ5IG5hbWVkIGZpZWxkcywKc28gdGhlIM+DLWZsb29yLXZzLWNhcHBlZCBjaG9pY2UgaXMgYSBzZXBhcmF0ZSBgY2FwcGVkOiBib29sYCBvbgpbYE1hcmtldFBhcmFtc2BdLCBub3QgYSBwYXlsb2FkIGhlcmUuKQAAAAAAAAAAABBQYXJhbWV0ZXJpemF0aW9uAAAAAQAAAAAAAAA4YE4ozrwsIM+DKWAg4oCUIHRoZSB0d28tbnVtYmVyIGJlbGllZiAod2hpdGVwYXBlciDCpzExKS4AAAAIR2F1c3NpYW4=",
        "AAAABQAAAFBFbWl0dGVkIGJ5IGBEaXN0cmlidXRpb25NYXJrZXQ6OnJlbW92ZV9saXF1aWRpdHlgICh0b3BpYyBgImxpcXVpZGl0eV9yZW1vdmVkImApLgAAAAAAAAAQTGlxdWlkaXR5UmVtb3ZlZAAAAAEAAAARbGlxdWlkaXR5X3JlbW92ZWQAAAAAAAADAAAAB1RoZSBMUC4AAAAAAmxwAAAAAAATAAAAAAAAAA5TaGFyZXMgYnVybmVkLgAAAAAABnNoYXJlcwAAAAAACwAAAAAAAAAVVVNEQyByZXR1cm5lZCAoNy1kcCkuAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAD5FbWl0dGVkIGJ5IGBSZWdpc3RyeTo6cmVnaXN0ZXJgICh0b3BpYyBgIm1hcmtldF9yZWdpc3RlcmVkImApLgAAAAAAAAAAABBNYXJrZXRSZWdpc3RlcmVkAAAAAQAAABFtYXJrZXRfcmVnaXN0ZXJlZAAAAAAAAAIAAAAZVGhlIG5ld2x5LWluZGV4ZWQgbWFya2V0LgAAAAAAAAZtYXJrZXQAAAAAABMAAAAAAAAADEl0cyBzdW1tYXJ5LgAAAARpbmZvAAAH0AAAAApNYXJrZXRJbmZvAAAAAAAAAAAAAg==",
        "AAAABQAAAGFFbWl0dGVkIGJ5IGBEaXN0cmlidXRpb25NYXJrZXQ6OnJlc29sdmVgIGZvciBhIHRyYWplY3RvcnkgbWFya2V0Cih0b3BpYyBgInJlc29sdmVkX3RyYWplY3RvcnkiYCkuAAAAAAAAAAAAABJSZXNvbHZlZFRyYWplY3RvcnkAAAAAAAEAAAATcmVzb2x2ZWRfdHJhamVjdG9yeQAAAAABAAAAPVJlYWxpc2VkIHZhbHVlIGF0IGVhY2ggY2hlY2twb2ludCwgaW4gY2hlY2twb2ludCBvcmRlciAoV0FEKS4AAAAAAAADeDBzAAAAA+oAAAALAAAAAAAAAAI=",
        "AAAAAQAAAQdBIHRyYWplY3RvcnkgdHJhZGVyJ3MgcG9zaXRpb246IHRoZSBwZXItY2hlY2twb2ludCBjdXJ2ZXMgYmVmb3JlIGFuZCBhZnRlcgp0aGUgdHJhZGUsIHRoZSBhZ2dyZWdhdGUgY29sbGF0ZXJhbCBsb2NrZWQsIGFuZCB0aGUgb3duZXIuIEF0IHJlc29sdXRpb24gdGhlCnBheW91dCBpcyBgzqNfaSAoZ19pKHhfaSkg4oiSIGZfaSh4X2kpKWAgb3ZlciB0aGUgTiBjaGVja3BvaW50cywgcmV0dXJuZWQgKHdpdGgKdGhlIGNvbGxhdGVyYWwpIGNsYW1wZWQgYXQgYDBgLgAAAAAAAAAAFlRyYWplY3RvcnlQb3NpdGlvbkRhdGEAAAAAAAQAAAA0UGVyLWNoZWNrcG9pbnQgbWFya2V0IGJlbGllZnMganVzdCBhZnRlciB0aGlzIHRyYWRlLgAAAAVhZnRlcgAAAAAAA+oAAAfQAAAABkJlbGllZgAAAAAANVBlci1jaGVja3BvaW50IG1hcmtldCBiZWxpZWZzIGp1c3QgYmVmb3JlIHRoaXMgdHJhZGUuAAAAAAAABmJlZm9yZQAAAAAD6gAAB9AAAAAGQmVsaWVmAAAAAABBQWdncmVnYXRlIGNvbGxhdGVyYWwgbG9ja2VkID0gYM6jX2kg4oiSbWluX3goZ19pIOKIkiBmX2kpYCAoV0FEKS4AAAAAAAAKY29sbGF0ZXJhbAAAAAAACwAAABNXaG8gb3ducyB0aGUgY2xhaW0uAAAAAAVvd25lcgAAAAAAABM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    wad: this.txFromJSON<i128>,
        init: this.txFromJSON<null>,
        claim: this.txFromJSON<i128>,
        trade: this.txFromJSON<u64>,
        resolve: this.txFromJSON<null>,
        get_state: this.txFromJSON<MarketState>,
        lp_shares: this.txFromJSON<i128>,
        get_params: this.txFromJSON<MarketParams>,
        pool_state: this.txFromJSON<readonly [i128, i128, i128]>,
        get_beliefs: this.txFromJSON<Array<Belief>>,
        get_position: this.txFromJSON<PositionData>,
        add_liquidity: this.txFromJSON<i128>,
        get_checkpoints: this.txFromJSON<Array<u64>>,
        init_trajectory: this.txFromJSON<null>,
        claim_trajectory: this.txFromJSON<i128>,
        remove_liquidity: this.txFromJSON<i128>,
        trade_trajectory: this.txFromJSON<u64>,
        resolved_outcomes: this.txFromJSON<Array<i128>>,
        get_trajectory_position: this.txFromJSON<TrajectoryPositionData>
  }
}