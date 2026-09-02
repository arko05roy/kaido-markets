//! `DistributionMarket` — the per-market AMM (whitepaper §7–13).
//!
//! Holds the market tuple ([`MarketParams`]) and the current aggregate belief
//! curve `(μ, σ, λ)` as *parameters*, not a histogram (ADR-2). A trader's
//! position is `g − f` between the curve before and after their trade; at
//! resolution the trader is returned `collateral + (g(x₀) − f(x₀))` clamped at
//! `0` in USDC, and the AMM/LP pool absorbs the complement.
//!
//! **Sprint 2 scope (build.md §5):** `trade`, `resolve`, `claim`, minimal
//! `add_liquidity` / `remove_liquidity`, σ-floor + solvency checks, USDC
//! settlement (the SAC contract id is an `init` argument — never hardcoded).
//! All AMM math is delegated to `kaido-math` (no `f64`; ADR-1); money is 7-dp
//! `i128` at the boundary, WAD (`1e18`) internally — `WAD / 1e7 = 1e11` is the
//! scale factor.

#![no_std]
#![allow(clippy::too_many_arguments)]

use kaido_common::{
    Belief, KaidoError, LiquidityAdded, LiquidityRemoved, MarketCreated, MarketParams, MarketState,
    MarketStatus, MarketWindow, OutcomeSpace, Parameterization, PositionData, Resolved,
    ResolvedTrajectory, ResolverClient, ResolverStatus, ResolverTier, Trade, TradeTrajectory,
    TrajectoryPositionData,
};
use kaido_math::{
    b_in_envelope, capped_gaussian_pdf_scaled, capped_lambda, capped_worst_case_collateral,
    gaussian_pdf_scaled, k_in_envelope, lambda as lambda_of, mu_in_envelope, sigma_floor,
    sigma_in_envelope, worst_case_collateral, WAD as MATH_WAD,
};
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractclient, contractimpl, contracttype, panic_with_error, token, Address, Env,
    IntoVal, Symbol, Vec,
};

/// 75% LTV — matches Blend default `c_factor` (0.75) for USDC collateral.
const BLEND_BORROW_NUM: i128 = 1;
const BLEND_BORROW_DEN: i128 = 2;

/// Cross-contract client for [`BlendAdapter`] (BlendTap spine).
#[contractclient(name = "BlendAdapterClient")]
pub trait BlendAdapter {
    fn available_depth(env: Env, market: Address) -> i128;
    fn borrow_for_market(
        env: Env,
        market: Address,
        collateral_7dp: i128,
        borrow_7dp: i128,
    ) -> i128;
    fn repay_for_market(env: Env, market: Address, amount_7dp: i128) -> i128;
    fn outstanding_debt(env: Env, market: Address) -> i128;
    fn unwind_for_claim(env: Env, market: Address);
}

const LEDGERS_PER_DAY: u32 = 17_280;
const INSTANCE_TTL_TARGET: u32 = 120 * LEDGERS_PER_DAY;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL_TARGET - 14 * LEDGERS_PER_DAY;
const PERSISTENT_TTL_TARGET: u32 = 365 * LEDGERS_PER_DAY;
const PERSISTENT_TTL_THRESHOLD: u32 = PERSISTENT_TTL_TARGET - 30 * LEDGERS_PER_DAY;

/// Protocol cap on the per-trade fee. 10%.
pub const MAX_FEE_BPS: u32 = 1_000;

/// `WAD / 1e7` — converts 7-dp USDC ↔ WAD-scaled internal money.
pub const MONEY_SCALE: i128 = 100_000_000_000; // 1e11

const _: () = assert!(MATH_WAD == MONEY_SCALE * 10_000_000);

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Params,
    Belief,
    Status,
    SigmaMin,
    /// `Address` — the USDC SAC contract.
    Usdc,
    /// `u64` — next position id.
    PosCounter,
    /// `u64` — open positions not yet claimed (scalar + trajectory).
    UnclaimedPositions,
    /// [`PositionData`] keyed by id (persistent).
    Position(u64),
    /// `i128` — total LP collateral pool (WAD).
    CollateralPool,
    /// `i128` — total LP shares outstanding.
    LpTotalShares,
    /// `i128` — LP shares for an address (persistent).
    LpShares(Address),
    /// `i128` — accrued LP fee pool (WAD).
    FeePool,
    /// `i128` — accrued treasury fees (WAD, 7-dp at claim).
    TreasuryFees,
    /// `i128` — accrued creator fees (WAD).
    CreatorFees,
    /// `Address` — protocol treasury for fee claims.
    Treasury,
    /// `Address` — market creator for fee claims.
    Creator,
    /// `u32` — share of each trade fee to LPs (bps of fee, sum with below = 10000).
    FeeLpBps,
    /// `u32` — share of each trade fee to treasury.
    FeeTreasuryBps,
    /// `u32` — share of each trade fee to creator.
    FeeCreatorBps,
    /// `i128` — collateral locked in open trader positions (WAD).
    LockedCollateral,
    /// `i128` — realised outcome `x₀` (WAD), once resolved.
    ResolvedOutcome,
    // --- trajectory markets (ADR-4) ---
    /// `Vec<Belief>` — the live per-checkpoint curves (trajectory markets only).
    Beliefs,
    /// `Vec<u64>` — the checkpoint timestamps (trajectory markets only).
    Checkpoints,
    /// [`TrajectoryPositionData`] keyed by id (persistent).
    TrajPosition(u64),
    /// `Vec<i128>` — realised per-checkpoint values (WAD), once resolved.
    ResolvedOutcomes,
    /// Optional BlendTap adapter — `None` disables JIT borrow (local tests).
    BlendAdapter,
    /// `i128` — USDC (7-dp) from Blend borrows still held by the market.
    BlendBackedUsdc,
}

#[contract]
pub struct DistributionMarket;

#[contractimpl]
impl DistributionMarket {
    /// Initialise a freshly-deployed scalar-Gaussian market. See the Sprint-1
    /// docs; Sprint 2 appends the `usdc` SAC contract id (the settlement asset,
    /// resolved per-network at deploy time — never hardcoded).
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
        usdc: Address,
        capped_flag: u32,
        treasury: Address,
        creator: Address,
        fee_lp_bps: u32,
        fee_treasury_bps: u32,
        fee_creator_bps: u32,
        blend_adapter: Option<Address>,
    ) {
        let storage = env.storage().instance();
        if storage.has(&DataKey::Params) {
            panic_with_error!(&env, KaidoError::AlreadyInitialized);
        }
        if k <= 0 {
            panic_with_error!(&env, KaidoError::InvalidK);
        }
        if b <= 0 {
            panic_with_error!(&env, KaidoError::InvalidB);
        }
        check_kb_envelope(&env, k, b);
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
        if sigma0 <= 0 {
            panic_with_error!(&env, KaidoError::InvalidSigma);
        }
        let capped = capped_flag != 0;
        if fee_lp_bps + fee_treasury_bps + fee_creator_bps != 10_000 {
            panic_with_error!(&env, KaidoError::FeeTooHigh);
        }
        let sigma_min = if capped { 0 } else { sigma_floor(k, b) };
        if !capped && sigma0 < sigma_min {
            panic_with_error!(&env, KaidoError::SigmaBelowFloor);
        }
        let belief = make_belief(&env, k, b, sigma_min, mu0, sigma0, capped);
        let params = MarketParams {
            outcome_space: OutcomeSpace::Scalar,
            parameterization: Parameterization::Gaussian,
            capped,
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
        storage.set(&DataKey::Params, &params);
        storage.set(&DataKey::Treasury, &treasury);
        storage.set(&DataKey::Creator, &creator);
        storage.set(&DataKey::FeeLpBps, &fee_lp_bps);
        storage.set(&DataKey::FeeTreasuryBps, &fee_treasury_bps);
        storage.set(&DataKey::FeeCreatorBps, &fee_creator_bps);
        storage.set(&DataKey::Belief, &belief);
        storage.set(&DataKey::Status, &MarketStatus::Open);
        storage.set(&DataKey::SigmaMin, &sigma_min);
        storage.set(&DataKey::Usdc, &usdc);
        storage.set(&DataKey::PosCounter, &0u64);
        storage.set(&DataKey::UnclaimedPositions, &0u64);
        storage.set(&DataKey::CollateralPool, &0i128);
        storage.set(&DataKey::LpTotalShares, &0i128);
        storage.set(&DataKey::FeePool, &0i128);
        storage.set(&DataKey::TreasuryFees, &0i128);
        storage.set(&DataKey::CreatorFees, &0i128);
        storage.set(&DataKey::LockedCollateral, &0i128);
        storage.set(&DataKey::BlendAdapter, &blend_adapter);
        storage.set(&DataKey::BlendBackedUsdc, &0i128);
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);

        MarketCreated {
            params,
            belief,
            sigma_min,
        }
        .publish(&env);
    }

    // --------------------------------------------------------------------- //
    // Trading
    // --------------------------------------------------------------------- //

    /// Submit a belief `(μ₂, σ₂)`: scale to `λ₂ = k·√(2σ₂√π)`, compute the
    /// position `g − f` and worst-case collateral, add the fee, pull USDC, mint
    /// a position, advance the curve to `g`, return the position id.
    /// `max_collateral_7dp` guards slippage (total = collateral + fee, 7-dp).
    pub fn trade(
        env: Env,
        trader: Address,
        mu2: i128,
        sigma2: i128,
        max_collateral_7dp: i128,
    ) -> u64 {
        trader.require_auth();
        let storage = env.storage().instance();
        let params: MarketParams = storage
            .get(&DataKey::Params)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        Self::sync_status(&env);
        if storage.get::<_, MarketStatus>(&DataKey::Status).unwrap() != MarketStatus::Open {
            panic_with_error!(&env, KaidoError::MarketNotOpen);
        }
        let now = env.ledger().timestamp();
        if now < params.window.open || now >= params.window.lock {
            panic_with_error!(&env, KaidoError::MarketNotOpen);
        }
        if sigma2 <= 0 {
            panic_with_error!(&env, KaidoError::InvalidSigma);
        }
        let sigma_min: i128 = storage.get(&DataKey::SigmaMin).unwrap();
        if !params.capped && sigma2 < sigma_min {
            panic_with_error!(&env, KaidoError::SigmaBelowFloor);
        }
        let f: Belief = storage.get(&DataKey::Belief).unwrap();
        let g = make_belief(&env, params.k, params.b, sigma_min, mu2, sigma2, params.capped);
        let collateral_wad = if params.capped {
            capped_worst_case_collateral(
                (g.mu, g.sigma, g.lambda),
                (f.mu, f.sigma, f.lambda),
                params.b,
            )
        } else {
            worst_case_collateral((g.mu, g.sigma, g.lambda), (f.mu, f.sigma, f.lambda))
        };
        let fee_wad = mul_div_floor(collateral_wad, params.fee_bps as i128, 10_000);
        let total_7dp = ceil_div(collateral_wad + fee_wad, MONEY_SCALE);
        let fee_7dp = ceil_div(fee_wad, MONEY_SCALE);
        let collateral_7dp = total_7dp - fee_7dp;
        if total_7dp > max_collateral_7dp {
            panic_with_error!(&env, KaidoError::SlippageExceeded);
        }
        // re-derive WAD amounts from the *charged* 7-dp figures so on-chain
        // accounting and the USDC ledger agree exactly.
        let collateral_wad = collateral_7dp * MONEY_SCALE;
        let fee_wad = fee_7dp * MONEY_SCALE;

        let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
        token::TokenClient::new(&env, &usdc).transfer(
            &trader,
            env.current_contract_address(),
            &total_7dp,
        );

        let id: u64 = storage.get(&DataKey::PosCounter).unwrap();
        storage.set(&DataKey::PosCounter, &(id + 1));
        let pos = PositionData {
            before: f,
            after: g,
            collateral: collateral_wad,
            owner: trader.clone(),
        };
        env.storage().persistent().set(&DataKey::Position(id), &pos);
        env.storage().persistent().extend_ttl(
            &DataKey::Position(id),
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_TARGET,
        );

        accrue_fee_split(&env, fee_wad);
        let locked: i128 = storage.get(&DataKey::LockedCollateral).unwrap();
        storage.set(&DataKey::LockedCollateral, &(locked + collateral_wad));
        storage.set(&DataKey::Belief, &g);
        storage.set(
            &DataKey::UnclaimedPositions,
            &storage.get(&DataKey::UnclaimedPositions).unwrap_or(0u64).saturating_add(1),
        );
        maybe_blend_tap_trade(&env, collateral_7dp);
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);

        Trade {
            id,
            trader,
            collateral: collateral_wad,
            fee: fee_wad,
            belief: g,
        }
        .publish(&env);
        id
    }

    // --------------------------------------------------------------------- //
    // Resolution & claims
    // --------------------------------------------------------------------- //

    /// After `window.resolve`, pull `x₀` from the resolver. `Stale` ⇒ market
    /// becomes `Disputable` (no payouts). `Pending` ⇒ reverts
    /// `ResolverNotReady`. Otherwise `Resolved(x₀)` and `claim` opens.
    pub fn resolve(env: Env) {
        let storage = env.storage().instance();
        let params: MarketParams = storage
            .get(&DataKey::Params)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        match storage.get::<_, MarketStatus>(&DataKey::Status).unwrap() {
            MarketStatus::Open | MarketStatus::Locked => {}
            MarketStatus::Resolved(_) | MarketStatus::ResolvedVec => {
                panic_with_error!(&env, KaidoError::AlreadyResolved)
            }
            MarketStatus::Disputable => panic_with_error!(&env, KaidoError::OracleStale),
        }
        if env.ledger().timestamp() < params.window.resolve {
            panic_with_error!(&env, KaidoError::NotYetResolveTime);
        }
        let resolver = ResolverClient::new(&env, &params.resolver);
        match resolver.status() {
            ResolverStatus::Pending => panic_with_error!(&env, KaidoError::ResolverNotReady),
            ResolverStatus::Stale => {
                storage.set(&DataKey::Status, &MarketStatus::Disputable);
            }
            ResolverStatus::Resolved(x0) => {
                storage.set(&DataKey::Status, &MarketStatus::Resolved(x0));
                storage.set(&DataKey::ResolvedOutcome, &x0);
                Resolved { x0 }.publish(&env);
            }
            ResolverStatus::ResolvedVec(xs) => {
                // a trajectory market: store the realised per-checkpoint values.
                if xs.is_empty() {
                    panic_with_error!(&env, KaidoError::ResolverNotReady);
                }
                storage.set(&DataKey::Status, &MarketStatus::ResolvedVec);
                storage.set(&DataKey::ResolvedOutcomes, &xs);
                ResolvedTrajectory { x0s: xs }.publish(&env);
            }
        }
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
    }

    /// Claim a resolved position: returns `collateral + (g(x₀) − f(x₀))`
    /// clamped at `0` in USDC (floor 7-dp), deletes the position.
    pub fn claim(env: Env, position_id: u64) -> i128 {
        let storage = env.storage().instance();
        let params: MarketParams = storage
            .get(&DataKey::Params)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        let x0: i128 = match storage.get(&DataKey::Status) {
            Some(MarketStatus::Resolved(x0)) => x0,
            _ => panic_with_error!(&env, KaidoError::MarketNotResolved),
        };
        let pos: PositionData = env
            .storage()
            .persistent()
            .get(&DataKey::Position(position_id))
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::PositionNotFound));
        let g_at = pdf_at(&params, &pos.after, x0);
        let f_at = pdf_at(&params, &pos.before, x0);
        let returned_7dp = (pos.collateral + (g_at - f_at)).max(0) / MONEY_SCALE; // floor
        let returned_wad = returned_7dp * MONEY_SCALE;
        // net settlement vs. the LP pool: trader's collateral minus what they
        // walk away with (positive ⇒ the pool gains a loser's forfeit; negative
        // ⇒ the pool funds a winner's surplus).
        let pool: i128 = storage.get(&DataKey::CollateralPool).unwrap();
        storage.set(
            &DataKey::CollateralPool,
            &(pool + (pos.collateral - returned_wad)),
        );
        let locked: i128 = storage.get(&DataKey::LockedCollateral).unwrap();
        storage.set(
            &DataKey::LockedCollateral,
            &(locked.saturating_sub(pos.collateral)),
        );

        env.storage()
            .persistent()
            .remove(&DataKey::Position(position_id));
        storage.set(
            &DataKey::UnclaimedPositions,
            &storage
                .get(&DataKey::UnclaimedPositions)
                .unwrap_or(0u64)
                .saturating_sub(1),
        );
        maybe_blend_unwind_claim(&env, 0);
        if returned_7dp > 0 {
            let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
            let pay_7dp = returned_7dp.min(token::TokenClient::new(&env, &usdc).balance(
                &env.current_contract_address(),
            ));
            if pay_7dp > 0 {
                token::TokenClient::new(&env, &usdc).transfer(
                    &env.current_contract_address(),
                    &pos.owner,
                    &pay_7dp,
                );
            }
            return pay_7dp;
        }
        0
    }

    // --------------------------------------------------------------------- //
    // LP — full economics (Sprint 5): scale `y` deposits `y·(b−locked)`,
    // mints `y·L` shares; LPs earn the fee-pool share on exit.
    // --------------------------------------------------------------------- //

    /// Add liquidity at scale `scale_y` (WAD; `WAD` = 100%). Deposits
    /// `scale_y·(b − locked_collateral)` USDC and mints `scale_y·L` LP shares
    /// (or `scale_y` shares when `L = 0`). Only while `Open`.
    pub fn add_liquidity(env: Env, lp: Address, scale_y: i128) -> i128 {
        lp.require_auth();
        let storage = env.storage().instance();
        if !storage.has(&DataKey::Params) {
            panic_with_error!(&env, KaidoError::NotInitialized);
        }
        Self::sync_status(&env);
        if storage.get::<_, MarketStatus>(&DataKey::Status).unwrap() != MarketStatus::Open {
            panic_with_error!(&env, KaidoError::MarketNotOpen);
        }
        if scale_y <= 0 || scale_y > MATH_WAD {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }
        let params: MarketParams = storage.get(&DataKey::Params).unwrap();
        let locked: i128 = storage.get(&DataKey::LockedCollateral).unwrap_or(0);
        let pool: i128 = storage.get(&DataKey::CollateralPool).unwrap_or(0);
        let free_wad = params.b.saturating_sub(locked).saturating_sub(pool);
        if free_wad <= 0 {
            panic_with_error!(&env, KaidoError::InsufficientLiquidity);
        }
        let deposit_wad = mul_div_floor(scale_y, free_wad, MATH_WAD);
        let deposit_7dp = ceil_div(deposit_wad, MONEY_SCALE);
        if deposit_7dp <= 0 {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }
        let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
        token::TokenClient::new(&env, &usdc).transfer(
            &lp,
            env.current_contract_address(),
            &deposit_7dp,
        );
        let amount_wad = deposit_7dp * MONEY_SCALE;
        let pool: i128 = storage.get(&DataKey::CollateralPool).unwrap();
        let total_shares: i128 = storage.get(&DataKey::LpTotalShares).unwrap();
        let minted = if total_shares == 0 {
            scale_y
        } else {
            mul_div_floor(scale_y, total_shares, MATH_WAD)
        };
        storage.set(&DataKey::CollateralPool, &(pool + amount_wad));
        storage.set(&DataKey::LpTotalShares, &(total_shares + minted));
        let key = DataKey::LpShares(lp.clone());
        let cur: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(cur + minted));
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_TARGET,
        );
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);

        LiquidityAdded {
            lp,
            amount: deposit_7dp,
            shares: minted,
        }
        .publish(&env);
        minted
    }

    /// Burn LP `shares` and withdraw the proportional slice of `pool + fee_pool`
    /// in USDC. While `Open`, only the slice not reserved for locked trader
    /// collateral is withdrawable. Blocked during `Locked`, `Disputable`, and
    /// after resolution until every position is claimed.
    pub fn remove_liquidity(env: Env, lp: Address, shares: i128) -> i128 {
        lp.require_auth();
        let storage = env.storage().instance();
        if !storage.has(&DataKey::Params) {
            panic_with_error!(&env, KaidoError::NotInitialized);
        }
        Self::sync_status(&env);
        let status = storage
            .get::<_, MarketStatus>(&DataKey::Status)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        match status {
            MarketStatus::Locked | MarketStatus::Disputable => {
                panic_with_error!(&env, KaidoError::MarketClosed);
            }
            MarketStatus::Resolved(_) | MarketStatus::ResolvedVec => {
                if storage.get(&DataKey::UnclaimedPositions).unwrap_or(0u64) > 0 {
                    panic_with_error!(&env, KaidoError::MarketClosed);
                }
            }
            MarketStatus::Open => {}
        }
        if shares <= 0 {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }
        let key = DataKey::LpShares(lp.clone());
        let held: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if shares > held {
            panic_with_error!(&env, KaidoError::NothingToWithdraw);
        }
        let total_shares: i128 = storage.get(&DataKey::LpTotalShares).unwrap();
        let pool: i128 = storage.get(&DataKey::CollateralPool).unwrap();
        let fee_pool: i128 = storage.get(&DataKey::FeePool).unwrap();
        let denom = total_shares.max(1);
        let locked: i128 = storage
            .get(&DataKey::LockedCollateral)
            .unwrap_or(0);
        let (pool_part, fee_part) = cap_lp_withdraw_parts(pool, fee_pool, locked, shares, denom);
        let withdraw_wad = pool_part + fee_part;
        if withdraw_wad <= 0 {
            panic_with_error!(&env, KaidoError::InsufficientLiquidity);
        }
        let withdraw_7dp = withdraw_wad / MONEY_SCALE;

        storage.set(&DataKey::CollateralPool, &(pool - pool_part));
        storage.set(&DataKey::FeePool, &(fee_pool - fee_part));
        storage.set(&DataKey::LpTotalShares, &(total_shares - shares));
        if shares == held {
            env.storage().persistent().remove(&key);
        } else {
            env.storage().persistent().set(&key, &(held - shares));
        }
        if withdraw_7dp > 0 {
            let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
            token::TokenClient::new(&env, &usdc).transfer(
                &env.current_contract_address(),
                &lp,
                &withdraw_7dp,
            );
        }
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
        LiquidityRemoved {
            lp,
            shares,
            amount: withdraw_7dp,
        }
        .publish(&env);
        withdraw_7dp
    }

    /// Treasury claims accrued fee share (7-dp USDC).
    pub fn claim_treasury_fees(env: Env) -> i128 {
        let storage = env.storage().instance();
        let treasury: Address = storage
            .get(&DataKey::Treasury)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        treasury.require_auth();
        let fees: i128 = storage.get(&DataKey::TreasuryFees).unwrap_or(0);
        if fees <= 0 {
            panic_with_error!(&env, KaidoError::NothingToWithdraw);
        }
        let out_7dp = fees / MONEY_SCALE;
        storage.set(&DataKey::TreasuryFees, &0i128);
        if out_7dp > 0 {
            let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
            token::TokenClient::new(&env, &usdc).transfer(
                &env.current_contract_address(),
                &treasury,
                &out_7dp,
            );
        }
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
        out_7dp
    }

    /// Market creator claims accrued fee share (7-dp USDC).
    pub fn claim_creator_fees(env: Env) -> i128 {
        let storage = env.storage().instance();
        let creator: Address = storage
            .get(&DataKey::Creator)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        creator.require_auth();
        let fees: i128 = storage.get(&DataKey::CreatorFees).unwrap_or(0);
        if fees <= 0 {
            panic_with_error!(&env, KaidoError::NothingToWithdraw);
        }
        let out_7dp = fees / MONEY_SCALE;
        storage.set(&DataKey::CreatorFees, &0i128);
        if out_7dp > 0 {
            let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
            token::TokenClient::new(&env, &usdc).transfer(
                &env.current_contract_address(),
                &creator,
                &out_7dp,
            );
        }
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
        out_7dp
    }

    // --------------------------------------------------------------------- //
    // Views
    // --------------------------------------------------------------------- //

    pub fn get_params(env: Env) -> MarketParams {
        env.storage()
            .instance()
            .get(&DataKey::Params)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized))
    }

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

    /// A stored position (panics `PositionNotFound` if claimed/unknown).
    pub fn get_position(env: Env, id: u64) -> PositionData {
        env.storage()
            .persistent()
            .get(&DataKey::Position(id))
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::PositionNotFound))
    }

    // --------------------------------------------------------------------- //
    // Trajectory markets (ADR-4, whitepaper §16) — N independent per-checkpoint
    // Gaussians sharing one collateral pool. The LP pool (`add_liquidity` /
    // `remove_liquidity` / fee accrual) is shared with the scalar path.
    // --------------------------------------------------------------------- //

    /// Initialise a freshly-deployed trajectory market. `checkpoints` are Unix
    /// timestamps (ascending, ≤ `window.resolve`); `mus0`/`sigmas0` are the
    /// initial per-checkpoint Gaussian params (WAD), one per checkpoint. The
    /// σ-floor + `peak ≤ b` solvency checks apply to every checkpoint.
    pub fn init_trajectory(
        env: Env,
        k: i128,
        b: i128,
        fee_bps: u32,
        resolver: Address,
        tier: u32,
        checkpoints: Vec<u64>,
        window_open: u64,
        window_lock: u64,
        window_resolve: u64,
        mus0: Vec<i128>,
        sigmas0: Vec<i128>,
        usdc: Address,
        treasury: Address,
        creator: Address,
        fee_lp_bps: u32,
        fee_treasury_bps: u32,
        fee_creator_bps: u32,
        blend_adapter: Option<Address>,
    ) {
        let storage = env.storage().instance();
        if storage.has(&DataKey::Params) {
            panic_with_error!(&env, KaidoError::AlreadyInitialized);
        }
        if fee_lp_bps + fee_treasury_bps + fee_creator_bps != 10_000 {
            panic_with_error!(&env, KaidoError::FeeTooHigh);
        }
        if k <= 0 {
            panic_with_error!(&env, KaidoError::InvalidK);
        }
        if b <= 0 {
            panic_with_error!(&env, KaidoError::InvalidB);
        }
        check_kb_envelope(&env, k, b);
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, KaidoError::FeeTooHigh);
        }
        let tier = decode_tier(&env, tier);
        let n = checkpoints.len();
        if n == 0 || mus0.len() != n || sigmas0.len() != n {
            panic_with_error!(&env, KaidoError::TrajectoryNotSupported);
        }
        if !(window_open <= window_lock && window_lock <= window_resolve)
            || window_resolve <= env.ledger().timestamp()
        {
            panic_with_error!(&env, KaidoError::InvalidWindow);
        }
        // ascending checkpoints, each at or before resolve.
        let mut prev: u64 = 0;
        for i in 0..n {
            let t = checkpoints.get(i).unwrap();
            if (i > 0 && t <= prev) || t > window_resolve {
                panic_with_error!(&env, KaidoError::InvalidWindow);
            }
            prev = t;
        }
        let sigma_min = sigma_floor(k, b);
        let mut beliefs: Vec<Belief> = Vec::new(&env);
        for i in 0..n {
            beliefs.push_back(make_belief(
                &env,
                k,
                b,
                sigma_min,
                mus0.get(i).unwrap(),
                sigmas0.get(i).unwrap(),
                false,
            ));
        }

        let params = MarketParams {
            outcome_space: OutcomeSpace::Trajectory(checkpoints.clone()),
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
        storage.set(&DataKey::Params, &params);
        storage.set(&DataKey::Treasury, &treasury);
        storage.set(&DataKey::Creator, &creator);
        storage.set(&DataKey::FeeLpBps, &fee_lp_bps);
        storage.set(&DataKey::FeeTreasuryBps, &fee_treasury_bps);
        storage.set(&DataKey::FeeCreatorBps, &fee_creator_bps);
        storage.set(&DataKey::Checkpoints, &checkpoints);
        storage.set(&DataKey::Beliefs, &beliefs);
        // a single-Belief summary (first checkpoint) so `get_state` works for
        // trajectory markets too; `get_beliefs` returns the full vector.
        storage.set(&DataKey::Belief, &beliefs.get(0).unwrap());
        storage.set(&DataKey::Status, &MarketStatus::Open);
        storage.set(&DataKey::SigmaMin, &sigma_min);
        storage.set(&DataKey::Usdc, &usdc);
        storage.set(&DataKey::PosCounter, &0u64);
        storage.set(&DataKey::UnclaimedPositions, &0u64);
        storage.set(&DataKey::CollateralPool, &0i128);
        storage.set(&DataKey::LpTotalShares, &0i128);
        storage.set(&DataKey::FeePool, &0i128);
        storage.set(&DataKey::TreasuryFees, &0i128);
        storage.set(&DataKey::CreatorFees, &0i128);
        storage.set(&DataKey::LockedCollateral, &0i128);
        storage.set(&DataKey::BlendAdapter, &blend_adapter);
        storage.set(&DataKey::BlendBackedUsdc, &0i128);
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);

        // reuse `MarketCreated` with the first checkpoint's belief as a summary.
        MarketCreated {
            params,
            belief: beliefs.get(0).unwrap(),
            sigma_min,
        }
        .publish(&env);
    }

    /// Submit per-checkpoint beliefs `(μ_i, σ_i)`: for each checkpoint compute
    /// the position `g_i − f_i` and its worst-case collateral; the trade's
    /// collateral is the sum (the checkpoints are independent ⇒ worst-case of
    /// the sum is the sum of worst-cases). Adds the fee, pulls USDC, mints a
    /// trajectory position, advances every checkpoint curve to `g_i`.
    pub fn trade_trajectory(
        env: Env,
        trader: Address,
        mus2: Vec<i128>,
        sigmas2: Vec<i128>,
        max_collateral_7dp: i128,
    ) -> u64 {
        trader.require_auth();
        let storage = env.storage().instance();
        let params: MarketParams = storage
            .get(&DataKey::Params)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        Self::sync_status(&env);
        if storage.get::<_, MarketStatus>(&DataKey::Status).unwrap() != MarketStatus::Open {
            panic_with_error!(&env, KaidoError::MarketNotOpen);
        }
        let now = env.ledger().timestamp();
        if now < params.window.open || now >= params.window.lock {
            panic_with_error!(&env, KaidoError::MarketNotOpen);
        }
        let f_curves: Vec<Belief> = storage
            .get(&DataKey::Beliefs)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::TrajectoryNotSupported));
        let n = f_curves.len();
        if mus2.len() != n || sigmas2.len() != n {
            panic_with_error!(&env, KaidoError::TrajectoryNotSupported);
        }
        let sigma_min: i128 = storage.get(&DataKey::SigmaMin).unwrap();
        let mut g_curves: Vec<Belief> = Vec::new(&env);
        let mut collateral_wad: i128 = 0;
        for i in 0..n {
            let g = make_belief(
                &env,
                params.k,
                params.b,
                sigma_min,
                mus2.get(i).unwrap(),
                sigmas2.get(i).unwrap(),
                false,
            );
            let f = f_curves.get(i).unwrap();
            collateral_wad +=
                worst_case_collateral((g.mu, g.sigma, g.lambda), (f.mu, f.sigma, f.lambda));
            g_curves.push_back(g);
        }
        let fee_wad = mul_div_floor(collateral_wad, params.fee_bps as i128, 10_000);
        let total_7dp = ceil_div(collateral_wad + fee_wad, MONEY_SCALE);
        let fee_7dp = ceil_div(fee_wad, MONEY_SCALE);
        let collateral_7dp = total_7dp - fee_7dp;
        if total_7dp > max_collateral_7dp {
            panic_with_error!(&env, KaidoError::SlippageExceeded);
        }
        let collateral_wad = collateral_7dp * MONEY_SCALE;
        let fee_wad = fee_7dp * MONEY_SCALE;

        let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
        token::TokenClient::new(&env, &usdc).transfer(
            &trader,
            env.current_contract_address(),
            &total_7dp,
        );

        let id: u64 = storage.get(&DataKey::PosCounter).unwrap();
        storage.set(&DataKey::PosCounter, &(id + 1));
        let pos = TrajectoryPositionData {
            before: f_curves,
            after: g_curves.clone(),
            collateral: collateral_wad,
            owner: trader.clone(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::TrajPosition(id), &pos);
        env.storage().persistent().extend_ttl(
            &DataKey::TrajPosition(id),
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_TARGET,
        );

        accrue_fee_split(&env, fee_wad);
        let locked: i128 = storage.get(&DataKey::LockedCollateral).unwrap_or(0);
        storage.set(&DataKey::LockedCollateral, &(locked + collateral_wad));
        let summary = g_curves.get(0).unwrap();
        storage.set(&DataKey::Beliefs, &g_curves);
        storage.set(&DataKey::Belief, &summary);
        storage.set(
            &DataKey::UnclaimedPositions,
            &storage.get(&DataKey::UnclaimedPositions).unwrap_or(0u64).saturating_add(1),
        );
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);

        TradeTrajectory {
            id,
            trader,
            collateral: collateral_wad,
            fee: fee_wad,
        }
        .publish(&env);
        id
    }

    /// Claim a resolved trajectory position: returns `collateral +
    /// Σ_i (g_i(x_i) − f_i(x_i))` clamped at `0` in USDC (floor 7-dp), deletes
    /// the position.
    pub fn claim_trajectory(env: Env, position_id: u64) -> i128 {
        let storage = env.storage().instance();
        if storage.get::<_, MarketStatus>(&DataKey::Status) != Some(MarketStatus::ResolvedVec) {
            panic_with_error!(&env, KaidoError::MarketNotResolved);
        }
        let xs: Vec<i128> = storage.get(&DataKey::ResolvedOutcomes).unwrap();
        let pos: TrajectoryPositionData = env
            .storage()
            .persistent()
            .get(&DataKey::TrajPosition(position_id))
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::PositionNotFound));
        let n = pos.after.len();
        let mut delta: i128 = 0;
        for i in 0..n {
            let x = xs.get(i).unwrap();
            let g = pos.after.get(i).unwrap();
            let f = pos.before.get(i).unwrap();
            delta += gaussian_pdf_scaled(g.mu, g.sigma, g.lambda, x)
                - gaussian_pdf_scaled(f.mu, f.sigma, f.lambda, x);
        }
        let returned_7dp = (pos.collateral + delta).max(0) / MONEY_SCALE; // floor
        let returned_wad = returned_7dp * MONEY_SCALE;
        let pool: i128 = storage.get(&DataKey::CollateralPool).unwrap();
        storage.set(
            &DataKey::CollateralPool,
            &(pool + (pos.collateral - returned_wad)),
        );
        env.storage()
            .persistent()
            .remove(&DataKey::TrajPosition(position_id));
        storage.set(
            &DataKey::UnclaimedPositions,
            &storage
                .get(&DataKey::UnclaimedPositions)
                .unwrap_or(0u64)
                .saturating_sub(1),
        );
        if returned_7dp > 0 {
            let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
            token::TokenClient::new(&env, &usdc).transfer(
                &env.current_contract_address(),
                &pos.owner,
                &returned_7dp,
            );
        }
        returned_7dp
    }

    /// Live per-checkpoint curves (trajectory markets only).
    pub fn get_beliefs(env: Env) -> Vec<Belief> {
        env.storage()
            .instance()
            .get(&DataKey::Beliefs)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::TrajectoryNotSupported))
    }

    /// The checkpoint timestamps (trajectory markets only).
    pub fn get_checkpoints(env: Env) -> Vec<u64> {
        env.storage()
            .instance()
            .get(&DataKey::Checkpoints)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::TrajectoryNotSupported))
    }

    /// The realised per-checkpoint outcomes once resolved (trajectory markets).
    pub fn resolved_outcomes(env: Env) -> Vec<i128> {
        env.storage()
            .instance()
            .get(&DataKey::ResolvedOutcomes)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::MarketNotResolved))
    }

    /// A stored trajectory position (panics `PositionNotFound` if unknown).
    pub fn get_trajectory_position(env: Env, id: u64) -> TrajectoryPositionData {
        env.storage()
            .persistent()
            .get(&DataKey::TrajPosition(id))
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::PositionNotFound))
    }

    /// LP shares held by `lp`.
    pub fn lp_shares(env: Env, lp: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::LpShares(lp))
            .unwrap_or(0)
    }

    /// Free collateral available for LP entry: `b − locked − pool` (WAD).
    pub fn free_collateral(env: Env) -> i128 {
        let storage = env.storage().instance();
        let params: MarketParams = storage
            .get(&DataKey::Params)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        let locked: i128 = storage.get(&DataKey::LockedCollateral).unwrap_or(0);
        let pool: i128 = storage.get(&DataKey::CollateralPool).unwrap_or(0);
        params.b.saturating_sub(locked).saturating_sub(pool)
    }

    /// Blend-backed borrow headroom for this market (7-dp USDC), `0` if disabled.
    pub fn blend_backed_depth(env: Env) -> i128 {
        let storage = env.storage().instance();
        let adapter: Option<Address> = storage.get(&DataKey::BlendAdapter).unwrap_or(None);
        match adapter {
            Some(addr) => {
                BlendAdapterClient::new(&env, &addr).available_depth(&env.current_contract_address())
            }
            None => 0,
        }
    }

    /// USDC (7-dp) from Blend borrows still held by this market's wallet.
    pub fn blend_backed_usdc(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::BlendBackedUsdc)
            .unwrap_or(0)
    }

    /// `(treasury_fees_wad, creator_fees_wad)`.
    pub fn pending_fees(env: Env) -> (i128, i128) {
        let s = env.storage().instance();
        (
            s.get(&DataKey::TreasuryFees).unwrap_or(0),
            s.get(&DataKey::CreatorFees).unwrap_or(0),
        )
    }

    /// `(collateral_pool_wad, lp_total_shares, fee_pool_wad)`.
    pub fn pool_state(env: Env) -> (i128, i128, i128) {
        let s = env.storage().instance();
        (
            s.get(&DataKey::CollateralPool).unwrap_or(0),
            s.get(&DataKey::LpTotalShares).unwrap_or(0),
            s.get(&DataKey::FeePool).unwrap_or(0),
        )
    }

    pub fn wad(_env: Env) -> i128 {
        MATH_WAD
    }

    /// Advance `Open → Locked` when past `window.lock` (idempotent).
    fn sync_status(env: &Env) {
        let storage = env.storage().instance();
        if let Some(MarketStatus::Open) = storage.get::<_, MarketStatus>(&DataKey::Status) {
            let params: MarketParams = storage.get(&DataKey::Params).unwrap();
            if env.ledger().timestamp() >= params.window.lock {
                storage.set(&DataKey::Status, &MarketStatus::Locked);
            }
        }
    }
}

/// `floor(a · b / c)` via the kaido-math 256-bit `mul_div` (no phantom
/// overflow); `c > 0`, `a,b ≥ 0` here.
/// Decode a `0..=3` tier code into [`ResolverTier`]; panics `InvalidTier` otherwise.
fn decode_tier(env: &Env, tier: u32) -> ResolverTier {
    match tier {
        0 => ResolverTier::Reflector,
        1 => ResolverTier::Attested,
        2 => ResolverTier::Optimistic,
        3 => ResolverTier::Designated,
        _ => panic_with_error!(env, KaidoError::InvalidTier),
    }
}

/// `k` and `b` must lie in the protocol WAD envelope.
fn check_kb_envelope(env: &Env, k: i128, b: i128) {
    if !k_in_envelope(k) || !b_in_envelope(b) {
        panic_with_error!(env, KaidoError::OutOfEnvelope);
    }
}

/// `μ` and `σ` must lie in the protocol WAD envelope.
fn check_belief_envelope(env: &Env, mu: i128, sigma: i128) {
    if !mu_in_envelope(mu) || !sigma_in_envelope(sigma) {
        panic_with_error!(env, KaidoError::OutOfEnvelope);
    }
}

/// Validate `(μ, σ)` and build the [`Belief`] with the right `λ` (capped or not).
fn make_belief(
    env: &Env,
    k: i128,
    b: i128,
    sigma_min: i128,
    mu: i128,
    sigma: i128,
    capped: bool,
) -> Belief {
    check_belief_envelope(env, mu, sigma);
    if sigma <= 0 {
        panic_with_error!(env, KaidoError::InvalidSigma);
    }
    if !capped && sigma < sigma_min {
        panic_with_error!(env, KaidoError::SigmaBelowFloor);
    }
    let lambda = if capped {
        capped_lambda(k, sigma, b)
    } else {
        lambda_of(k, sigma)
    };
    let peak = if capped {
        capped_gaussian_pdf_scaled(mu, sigma, lambda, b, mu)
    } else {
        gaussian_pdf_scaled(mu, sigma, lambda, mu)
    };
    let peak_tol = (b / 1_048_576) + 1_024;
    if !capped && peak > b.saturating_add(peak_tol) {
        panic_with_error!(env, KaidoError::PeakExceedsB);
    }
    if capped && peak > b {
        panic_with_error!(env, KaidoError::PeakExceedsB);
    }
    Belief { mu, sigma, lambda }
}

fn pdf_at(params: &MarketParams, belief: &Belief, x: i128) -> i128 {
    if params.capped {
        capped_gaussian_pdf_scaled(belief.mu, belief.sigma, belief.lambda, params.b, x)
    } else {
        gaussian_pdf_scaled(belief.mu, belief.sigma, belief.lambda, x)
    }
}

fn accrue_fee_split(env: &Env, fee_wad: i128) {
    let storage = env.storage().instance();
    let lp_bps: u32 = storage.get(&DataKey::FeeLpBps).unwrap_or(10_000);
    let treasury_bps: u32 = storage.get(&DataKey::FeeTreasuryBps).unwrap_or(0);
    let creator_bps: u32 = storage.get(&DataKey::FeeCreatorBps).unwrap_or(0);
    let creator_part = mul_div_floor(fee_wad, creator_bps as i128, 10_000);
    let lp_part = mul_div_floor(fee_wad, lp_bps as i128, 10_000);
    let treasury_part = mul_div_floor(fee_wad, treasury_bps as i128, 10_000);
    // any rounding dust stays with LPs
    let lp_part = lp_part + (fee_wad - lp_part - treasury_part - creator_part);
    let fee_pool: i128 = storage.get(&DataKey::FeePool).unwrap_or(0);
    storage.set(&DataKey::FeePool, &(fee_pool + lp_part));
    let treasury_fees: i128 = storage.get(&DataKey::TreasuryFees).unwrap_or(0);
    storage.set(&DataKey::TreasuryFees, &(treasury_fees + treasury_part));
    let creator_fees: i128 = storage.get(&DataKey::CreatorFees).unwrap_or(0);
    storage.set(&DataKey::CreatorFees, &(creator_fees + creator_part));
    env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
}

fn mul_div_floor(a: i128, b: i128, c: i128) -> i128 {
    kaido_math::mul_div(a, b, c)
}

/// `ceil(a / c)` for `a ≥ 0`, `c > 0`.
fn ceil_div(a: i128, c: i128) -> i128 {
    (a + c - 1) / c
}

/// Proportional LP withdrawal capped so `pool + fee_pool − withdrawal ≥ locked`.
fn cap_lp_withdraw_parts(
    pool: i128,
    fee_pool: i128,
    locked: i128,
    shares: i128,
    denom: i128,
) -> (i128, i128) {
    let pool_part = mul_div_floor(pool, shares, denom);
    let fee_part = mul_div_floor(fee_pool, shares, denom);
    let total = pool_part + fee_part;
    let withdrawable = (pool + fee_pool).saturating_sub(locked);
    if total <= withdrawable {
        return (pool_part, fee_part);
    }
    if withdrawable <= 0 {
        return (0, 0);
    }
    let capped_pool = mul_div_floor(withdrawable, pool_part, total.max(1));
    (capped_pool, withdrawable - capped_pool)
}

/// BlendTap: JIT borrow after a trade when a [`BlendAdapter`] is configured.
fn maybe_blend_tap_trade(env: &Env, collateral_7dp: i128) {
    if collateral_7dp <= 0 {
        return;
    }
    let storage = env.storage().instance();
    let adapter: Option<Address> = storage.get(&DataKey::BlendAdapter).unwrap_or(None);
    let adapter = match adapter {
        Some(a) => a,
        None => return,
    };
    let borrow_7dp = collateral_7dp * BLEND_BORROW_NUM / BLEND_BORROW_DEN;
    if borrow_7dp <= 0 {
        return;
    }
    let market = env.current_contract_address();
    let adapter_client = BlendAdapterClient::new(env, &adapter);
    let depth = adapter_client.available_depth(&market);
    if borrow_7dp > depth {
        panic_with_error!(env, KaidoError::BlendDepthExceeded);
    }
    let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
    token::TokenClient::new(env, &usdc).transfer(&market, &adapter, &collateral_7dp);
    env.authorize_as_current_contract(adapter_borrow_auth(
        env,
        &adapter,
        &market,
        collateral_7dp,
        borrow_7dp,
    ));
    adapter_client.borrow_for_market(&market, &collateral_7dp, &borrow_7dp);
    let backed: i128 = storage.get(&DataKey::BlendBackedUsdc).unwrap_or(0);
    storage.set(&DataKey::BlendBackedUsdc, &(backed + borrow_7dp));
}

/// Matches `blend-adapter::REPAY_INTEREST_BUFFER_7DP`.
const BLEND_INTEREST_BUFFER_7DP: i128 = 10_000;

/// BlendTap: repay outstanding debt from a loser's forfeit at claim time.
#[allow(dead_code)]
fn maybe_blend_repay_claim(env: &Env, collateral_wad: i128, returned_wad: i128) {
    let pool_gain_wad = collateral_wad - returned_wad;
    if pool_gain_wad <= 0 {
        return;
    }
    let repay_7dp = pool_gain_wad / MONEY_SCALE;
    if repay_7dp <= 0 {
        return;
    }
    let storage = env.storage().instance();
    let adapter: Option<Address> = storage.get(&DataKey::BlendAdapter).unwrap_or(None);
    let adapter = match adapter {
        Some(a) => a,
        None => return,
    };
    let market = env.current_contract_address();
    let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
    token::TokenClient::new(env, &usdc).transfer(&market, &adapter, &repay_7dp);
    env.authorize_as_current_contract(adapter_repay_auth(env, &adapter, &market, repay_7dp));
    BlendAdapterClient::new(env, &adapter).repay_for_market(&market, &repay_7dp);
}

/// BlendTap: withdraw posted collateral and clear outstanding debt before payout.
/// Prepay is capped to blend-borrow proceeds (plus a small interest buffer) and
/// never sweeps unrelated settlement reserves or the current claim payout.
fn maybe_blend_unwind_claim(env: &Env, reserve_payout_7dp: i128) {
    let storage = env.storage().instance();
    let adapter: Option<Address> = storage.get(&DataKey::BlendAdapter).unwrap_or(None);
    let adapter = match adapter {
        Some(a) => a,
        None => return,
    };
    let market = env.current_contract_address();
    let usdc: Address = storage.get(&DataKey::Usdc).unwrap();
    let tok = token::TokenClient::new(env, &usdc);
    let debt = BlendAdapterClient::new(env, &adapter).outstanding_debt(&market);
    if debt > 0 {
        let backed: i128 = storage.get(&DataKey::BlendBackedUsdc).unwrap_or(0);
        let need = debt.saturating_add(BLEND_INTEREST_BUFFER_7DP);
        let prepay = need.min(backed.saturating_add(BLEND_INTEREST_BUFFER_7DP));
        if prepay > 0 {
            let market_bal = tok.balance(&market);
            if market_bal >= prepay.saturating_add(reserve_payout_7dp) {
                tok.transfer(&market, &adapter, &prepay);
                storage.set(
                    &DataKey::BlendBackedUsdc,
                    &backed.saturating_sub(prepay.min(backed)),
                );
            }
        }
    }
    env.authorize_as_current_contract(adapter_unwind_auth(env, &adapter, &market));
    BlendAdapterClient::new(env, &adapter).unwind_for_claim(&market);
    if BlendAdapterClient::new(env, &adapter).outstanding_debt(&market) == 0 {
        storage.set(&DataKey::BlendBackedUsdc, &0i128);
    }
}

fn adapter_borrow_auth(
    env: &Env,
    adapter: &Address,
    market: &Address,
    collateral_7dp: i128,
    borrow_7dp: i128,
) -> soroban_sdk::Vec<InvokerContractAuthEntry> {
    soroban_sdk::vec![
        env,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: adapter.clone(),
                fn_name: Symbol::new(env, "borrow_for_market"),
                args: (
                    market.clone(),
                    collateral_7dp,
                    borrow_7dp,
                )
                    .into_val(env),
            },
            sub_invocations: soroban_sdk::vec![env],
        }),
    ]
}

#[allow(dead_code)]
fn adapter_repay_auth(
    env: &Env,
    adapter: &Address,
    market: &Address,
    repay_7dp: i128,
) -> soroban_sdk::Vec<InvokerContractAuthEntry> {
    soroban_sdk::vec![
        env,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: adapter.clone(),
                fn_name: Symbol::new(env, "repay_for_market"),
                args: (market.clone(), repay_7dp).into_val(env),
            },
            sub_invocations: soroban_sdk::vec![env],
        }),
    ]
}

fn adapter_unwind_auth(
    env: &Env,
    adapter: &Address,
    market: &Address,
) -> soroban_sdk::Vec<InvokerContractAuthEntry> {
    soroban_sdk::vec![
        env,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: adapter.clone(),
                fn_name: Symbol::new(env, "unwind_for_claim"),
                args: (market.clone(),).into_val(env),
            },
            sub_invocations: soroban_sdk::vec![env],
        }),
    ]
}

#[cfg(test)]
mod test;
