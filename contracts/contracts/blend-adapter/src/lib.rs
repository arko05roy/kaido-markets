//! `BlendAdapter` — BlendTap JIT borrow spine (liquidity-plan §5.4).
//!
//! Authorized [`DistributionMarket`] instances borrow USDC from a Blend lending
//! pool at trade time (deposit trader collateral + borrow atomically via
//! `pool.submit`) and repay on claim settlement. No mocked pool APIs — all
//! cross-calls use `blend-contract-sdk::pool`.

#![no_std]

use blend_contract_sdk::pool::{self, Request};
use kaido_common::KaidoError;
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractevent, contractimpl, contracttype, panic_with_error, token, vec, Address,
    Env, IntoVal, Symbol, Vec,
};

/// Blend `Request.request_type` values (fund-management.md).
mod request_type {
    pub const DEPOSIT_COLLATERAL: u32 = 2;
    pub const WITHDRAW_COLLATERAL: u32 = 3;
    pub const BORROW: u32 = 4;
    pub const REPAY: u32 = 5;
}

const LEDGERS_PER_DAY: u32 = 17_280;
const TTL_TARGET: u32 = 365 * LEDGERS_PER_DAY;
const TTL_THRESHOLD: u32 = TTL_TARGET - 30 * LEDGERS_PER_DAY;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    BlendPool,
    Usdc,
    /// Per-market cumulative borrow cap (7-dp USDC).
    BorrowCap(Address),
    /// Per-market outstanding debt to Blend (7-dp USDC).
    Outstanding(Address),
    /// Per-market collateral posted to Blend (7-dp USDC).
    CollateralDeposited(Address),
    /// Whether a market may call borrow/repay.
    Authorized(Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketAuthorized {
    pub market: Address,
    pub cap_7dp: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Borrowed {
    pub market: Address,
    pub collateral_7dp: i128,
    pub amount_7dp: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Repaid {
    pub market: Address,
    pub amount_7dp: i128,
}

#[contract]
pub struct BlendAdapter;

#[contractimpl]
impl BlendAdapter {
    /// `blend_pool` — the Blend lending pool; `usdc` — the USDC SAC (7-dp).
    pub fn __constructor(env: Env, admin: Address, blend_pool: Address, usdc: Address) {
        let s = env.storage().instance();
        if s.has(&DataKey::Admin) {
            panic_with_error!(&env, KaidoError::AlreadyInitialized);
        }
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::BlendPool, &blend_pool);
        s.set(&DataKey::Usdc, &usdc);
        s.extend_ttl(TTL_THRESHOLD, TTL_TARGET);
    }

    /// Admin-gated. Authorize `market` to borrow up to `cap_7dp` USDC (7-dp).
    pub fn authorize_market(env: Env, market: Address, cap_7dp: i128) {
        Self::admin(&env).require_auth();
        if cap_7dp <= 0 {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }
        let key = DataKey::Authorized(market.clone());
        env.storage().persistent().set(&key, &true);
        let cap_key = DataKey::BorrowCap(market.clone());
        env.storage().persistent().set(&cap_key, &cap_7dp);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_TARGET);
        env.storage()
            .persistent()
            .extend_ttl(&cap_key, TTL_THRESHOLD, TTL_TARGET);
        MarketAuthorized {
            market,
            cap_7dp,
        }
        .publish(&env);
    }

    /// Revoke a market's borrow permission.
    pub fn revoke_market(env: Env, market: Address) {
        Self::admin(&env).require_auth();
        env.storage().persistent().remove(&DataKey::Authorized(market));
    }

    /// Callable only by an authorized `market`. `collateral_7dp` USDC must
    /// already be in this adapter (transferred by the market before the call).
    /// Atomically deposits collateral into Blend and borrows `borrow_7dp` USDC,
    /// then forwards the borrowed USDC back to `market`. Returns the amount
    /// borrowed (7-dp).
    pub fn borrow_for_market(
        env: Env,
        market: Address,
        collateral_7dp: i128,
        borrow_7dp: i128,
    ) -> i128 {
        market.require_auth();
        Self::require_authorized(&env, &market);
        if collateral_7dp <= 0 || borrow_7dp <= 0 {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }
        let cap = read_borrow_cap(&env, &market);
        let outstanding = read_outstanding(&env, &market);
        let next = outstanding.saturating_add(borrow_7dp);
        if next > cap {
            panic_with_error!(&env, KaidoError::BlendDepthExceeded);
        }
        let depth = BlendAdapter::pool_available_7dp(&env);
        if borrow_7dp > depth {
            panic_with_error!(&env, KaidoError::InsufficientLiquidity);
        }

        let me = env.current_contract_address();
        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        let pool: Address = env.storage().instance().get(&DataKey::BlendPool).unwrap();
        let bal = token::TokenClient::new(&env, &usdc).balance(&me);
        if bal < collateral_7dp {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }

        let requests = vec![
            &env,
            Request {
                request_type: request_type::DEPOSIT_COLLATERAL,
                address: usdc.clone(),
                amount: collateral_7dp,
            },
            Request {
                request_type: request_type::BORROW,
                address: usdc.clone(),
                amount: borrow_7dp,
            },
        ];

        env.authorize_as_current_contract(submit_auth(
            &env,
            &pool,
            &me,
            &me,
            &me,
            &requests,
            &usdc,
            collateral_7dp,
            borrow_7dp,
        ));
        pool::Client::new(&env, &pool).submit(&me, &me, &market, &requests);

        let out_key = DataKey::Outstanding(market.clone());
        env.storage().persistent().set(&out_key, &next);
        env.storage()
            .persistent()
            .extend_ttl(&out_key, TTL_THRESHOLD, TTL_TARGET);

        let col_key = DataKey::CollateralDeposited(market.clone());
        let deposited = read_collateral_deposited(&env, &market) + collateral_7dp;
        env.storage().persistent().set(&col_key, &deposited);
        env.storage()
            .persistent()
            .extend_ttl(&col_key, TTL_THRESHOLD, TTL_TARGET);

        Borrowed {
            market,
            collateral_7dp,
            amount_7dp: borrow_7dp,
        }
        .publish(&env);
        borrow_7dp
    }

    /// Callable only by an authorized `market`. Repays up to `amount_7dp` USDC
    /// of outstanding debt (capped at outstanding). `amount_7dp` USDC must be
    /// in this adapter before the call. Returns the amount actually repaid.
    pub fn repay_for_market(env: Env, market: Address, amount_7dp: i128) -> i128 {
        market.require_auth();
        Self::require_authorized(&env, &market);
        if amount_7dp <= 0 {
            return 0;
        }
        let outstanding = read_outstanding(&env, &market);
        if outstanding <= 0 {
            return 0;
        }
        let repay_7dp = amount_7dp.min(outstanding);

        let me = env.current_contract_address();
        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        let pool: Address = env.storage().instance().get(&DataKey::BlendPool).unwrap();
        let bal = token::TokenClient::new(&env, &usdc).balance(&me);
        if bal < repay_7dp {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }

        let requests = vec![
            &env,
            Request {
                request_type: request_type::REPAY,
                address: usdc.clone(),
                amount: repay_7dp,
            },
        ];

        env.authorize_as_current_contract(submit_auth(
            &env,
            &pool,
            &me,
            &me,
            &me,
            &requests,
            &usdc,
            repay_7dp,
            0,
        ));
        pool::Client::new(&env, &pool).submit(&me, &me, &me, &requests);

        let remaining = outstanding - repay_7dp;
        let out_key = DataKey::Outstanding(market.clone());
        if remaining <= 0 {
            env.storage().persistent().remove(&out_key);
        } else {
            env.storage().persistent().set(&out_key, &remaining);
            env.storage()
                .persistent()
                .extend_ttl(&out_key, TTL_THRESHOLD, TTL_TARGET);
        }

        Repaid {
            market,
            amount_7dp: repay_7dp,
        }
        .publish(&env);
        repay_7dp
    }

    /// Callable only by an authorized `market` at claim time. Atomically withdraws
    /// all posted collateral and repays outstanding debt, forwarding net USDC to
    /// `market` so winner payouts can be settled from the market's token balance.
    pub fn unwind_for_claim(env: Env, market: Address) {
        market.require_auth();
        Self::require_authorized(&env, &market);
        let collateral = read_collateral_deposited(&env, &market);
        let debt = read_outstanding(&env, &market);
        let me = env.current_contract_address();
        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        let pool: Address = env.storage().instance().get(&DataKey::BlendPool).unwrap();
const REPAY_INTEREST_BUFFER_7DP: i128 = 10_000;

        let liability = pool_liability_7dp(&env, &pool, &me, &usdc);
        let adapter_bal = token::TokenClient::new(&env, &usdc).balance(&me);
        let repay_7dp = liability
            .max(debt)
            .saturating_add(REPAY_INTEREST_BUFFER_7DP)
            .min(adapter_bal);
        let withdraw_7dp = pool_collateral_7dp(&env, &pool, &me, &usdc).max(collateral);
        if withdraw_7dp <= 0 && repay_7dp <= 0 {
            return;
        }

        let mut requests = vec![&env];
        if repay_7dp > 0 {
            requests.push_back(Request {
                request_type: request_type::REPAY,
                address: usdc.clone(),
                amount: repay_7dp,
            });
        }
        if repay_7dp > 0 {
            let transfer_7dp = repay_7dp;
            env.authorize_as_current_contract(submit_auth(
                &env,
                &pool,
                &me,
                &me,
                &me,
                &requests,
                &usdc,
                transfer_7dp,
                0,
            ));
            pool::Client::new(&env, &pool).submit(&me, &me, &me, &requests);
            requests = vec![&env];
        }
        if withdraw_7dp > 0 {
            requests.push_back(Request {
                request_type: request_type::WITHDRAW_COLLATERAL,
                address: usdc.clone(),
                amount: withdraw_7dp,
            });
            env.authorize_as_current_contract(submit_auth(
                &env,
                &pool,
                &me,
                &me,
                &me,
                &requests,
                &usdc,
                0,
                0,
            ));
            pool::Client::new(&env, &pool).submit(&me, &me, &me, &requests);
        }

        let net = token::TokenClient::new(&env, &usdc).balance(&me);
        if net > 0 {
            token::TokenClient::new(&env, &usdc).transfer(&me, &market, &net);
        }

        env.storage()
            .persistent()
            .remove(&DataKey::CollateralDeposited(market.clone()));
        env.storage()
            .persistent()
            .remove(&DataKey::Outstanding(market));
    }

    /// `min(cap − outstanding, pool_available)` in 7-dp USDC.
    pub fn available_depth(env: Env, market: Address) -> i128 {
        let cap = read_borrow_cap(&env, &market);
        let outstanding = read_outstanding(&env, &market);
        let headroom = cap.saturating_sub(outstanding);
        headroom.min(BlendAdapter::pool_available_7dp(&env))
    }

    /// Outstanding Blend debt for `market` (7-dp USDC).
    pub fn outstanding_debt(env: Env, market: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Outstanding(market))
            .unwrap_or(0)
    }

    /// Per-market borrow cap (7-dp USDC), `0` if unset.
    pub fn borrow_cap(env: Env, market: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::BorrowCap(market))
            .unwrap_or(0)
    }

    /// Whether `market` is authorized to borrow.
    pub fn is_authorized(env: Env, market: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Authorized(market))
            .unwrap_or(false)
    }

    /// The configured Blend pool address.
    pub fn blend_pool(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::BlendPool)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized))
    }

    fn pool_available_7dp(env: &Env) -> i128 {
        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        let pool: Address = env.storage().instance().get(&DataKey::BlendPool).unwrap();
        let reserve = pool::Client::new(env, &pool).get_reserve(&usdc);
        reserve_available_7dp(&reserve)
    }

    fn require_authorized(env: &Env, market: &Address) {
        if !read_authorized(env, market) {
            panic_with_error!(env, KaidoError::BlendMarketNotAuthorized);
        }
    }

    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, KaidoError::NotInitialized))
    }
}

fn pool_collateral_7dp(env: &Env, pool_id: &Address, user: &Address, usdc: &Address) -> i128 {
    let positions = pool::Client::new(env, pool_id).get_positions(user);
    let reserve = pool::Client::new(env, pool_id).get_reserve(usdc);
    positions
        .collateral
        .get(reserve.config.index)
        .unwrap_or(0)
}

fn pool_liability_7dp(env: &Env, pool_id: &Address, user: &Address, usdc: &Address) -> i128 {
    let positions = pool::Client::new(env, pool_id).get_positions(user);
    let reserve = pool::Client::new(env, pool_id).get_reserve(usdc);
    positions
        .liabilities
        .get(reserve.config.index)
        .unwrap_or(0)
}

fn read_collateral_deposited(env: &Env, market: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::CollateralDeposited(market.clone()))
        .unwrap_or(0)
}

fn read_outstanding(env: &Env, market: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Outstanding(market.clone()))
        .unwrap_or(0)
}

fn read_borrow_cap(env: &Env, market: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::BorrowCap(market.clone()))
        .unwrap_or(0)
}

fn read_authorized(env: &Env, market: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Authorized(market.clone()))
        .unwrap_or(false)
}

/// Available underlying USDC in the pool reserve (7-dp).
/// `≈ total_supplied − total_borrowed` per Blend docs.
fn reserve_available_7dp(reserve: &pool::Reserve) -> i128 {
    let scalar = reserve.scalar;
    if scalar <= 0 {
        return 0;
    }
    let supplied = reserve.data.b_supply * reserve.data.b_rate / scalar;
    let borrowed = reserve.data.d_supply * reserve.data.d_rate / scalar;
    (supplied - borrowed).max(0)
}

/// Authorize the USDC `transfer` the pool will invoke during `submit`, then
/// `submit` itself (Soroban: authorize sub-calls the callee will make as
/// top-level entries — see soroban-sdk `authorize_as_current_contract` docs).
fn submit_auth(
    env: &Env,
    pool: &Address,
    from: &Address,
    spender: &Address,
    to: &Address,
    requests: &Vec<Request>,
    usdc: &Address,
    deposit_or_repay_7dp: i128,
    _borrow_7dp: i128,
) -> Vec<InvokerContractAuthEntry> {
    let mut entries = vec![env];
    if deposit_or_repay_7dp > 0 {
        entries.push_back(InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: usdc.clone(),
                fn_name: Symbol::new(env, "transfer"),
                args: (from.clone(), pool.clone(), deposit_or_repay_7dp).into_val(env),
            },
            sub_invocations: vec![env],
        }));
    }
    entries.push_back(InvokerContractAuthEntry::Contract(SubContractInvocation {
        context: ContractContext {
            contract: pool.clone(),
            fn_name: Symbol::new(env, "submit"),
            args: (
                from.clone(),
                spender.clone(),
                to.clone(),
                requests.clone(),
            )
                .into_val(env),
        },
        sub_invocations: vec![env],
    }));
    entries
}

#[cfg(test)]
mod test;
