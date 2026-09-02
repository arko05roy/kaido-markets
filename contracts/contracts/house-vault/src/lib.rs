//! HouseVault — the protocol-owned underwriter (whitepaper §18). It is just an
//! ordinary Layer-1 LP: it holds USDC, and on `seed_market` it transfers USDC
//! into a `DistributionMarket` via that market's `add_liquidity` (the market
//! pulls with `transfer`, so the vault is the auth'd `from`). A per-market
//! exposure cap is enforced here.
//!
//! Admin-gated for now (build.md §5 Sprint 2 — "Owner-gated for now"; finalised
//! Sprint 4). The USDC SAC contract id is a constructor argument — never
//! hardcoded.

#![no_std]

use distribution_market::{DistributionMarketClient, MONEY_SCALE};
use kaido_math::{mul_div, WAD};
use kaido_common::KaidoError;
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractevent, contractimpl, contracttype, panic_with_error, token, vec, Address,
    Env, IntoVal, Symbol, Vec,
};

const LEDGERS_PER_DAY: u32 = 17_280;
const TTL_TARGET: u32 = 365 * LEDGERS_PER_DAY;
const TTL_THRESHOLD: u32 = TTL_TARGET - 30 * LEDGERS_PER_DAY;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Usdc,
    /// `i128` — cumulative USDC (7-dp) the vault has put into this market.
    Exposure(Address),
    /// `i128` — admin-set per-market cap on cumulative exposure (7-dp USDC).
    /// `0` means "unset" → seeding is refused (see `CapNotSet`).
    Cap(Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapSet {
    pub market: Address,
    pub cap: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Seeded {
    pub market: Address,
    pub amount: i128,
    pub shares: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Withdrawn {
    pub market: Address,
    pub shares: i128,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposited {
    pub from: Address,
    pub amount: i128,
}

#[contract]
pub struct HouseVault;

#[contractimpl]
impl HouseVault {
    pub fn __constructor(env: Env, admin: Address, usdc: Address) {
        let s = env.storage().instance();
        if s.has(&DataKey::Admin) {
            panic_with_error!(&env, KaidoError::AlreadyInitialized);
        }
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Usdc, &usdc);
        s.extend_ttl(TTL_THRESHOLD, TTL_TARGET);
    }

    /// Anyone may fund the vault.
    pub fn deposit(env: Env, from: Address, amount_7dp: i128) {
        from.require_auth();
        if amount_7dp <= 0 {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }
        let usdc: Address = env
            .storage()
            .instance()
            .get(&DataKey::Usdc)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        token::TokenClient::new(&env, &usdc).transfer(
            &from,
            env.current_contract_address(),
            &amount_7dp,
        );
        Deposited {
            from,
            amount: amount_7dp,
        }
        .publish(&env);
    }

    /// Admin-gated. Set the on-chain per-market exposure cap for `market`.
    /// `cap_7dp` must be `> 0`. Seeding is refused while the cap is unset.
    pub fn set_cap(env: Env, market: Address, cap_7dp: i128) {
        let admin = Self::admin(&env);
        admin.require_auth();
        if cap_7dp <= 0 {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }
        let key = DataKey::Cap(market.clone());
        env.storage().persistent().set(&key, &cap_7dp);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_TARGET);
        CapSet {
            market,
            cap: cap_7dp,
        }
        .publish(&env);
    }

    /// The configured per-market cap on cumulative exposure (7-dp USDC),
    /// `0` if unset.
    pub fn cap(env: Env, market: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Cap(market))
            .unwrap_or(0)
    }

    /// Admin-gated. Seed `market` with `amount_7dp` USDC as an LP, provided the
    /// vault's cumulative exposure stays within the on-chain cap set via
    /// [`Self::set_cap`]. Returns the LP shares minted (held by the vault).
    pub fn seed_market(env: Env, market: Address, amount_7dp: i128) -> i128 {
        let admin = Self::admin(&env);
        admin.require_auth();
        if amount_7dp <= 0 {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }
        let cap_key = DataKey::Cap(market.clone());
        let cap_7dp: i128 = env
            .storage()
            .persistent()
            .get(&cap_key)
            .unwrap_or(0);
        if cap_7dp <= 0 {
            panic_with_error!(&env, KaidoError::CapNotSet);
        }
        let key = DataKey::Exposure(market.clone());
        let cur: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        let me = env.current_contract_address();
        let dm = DistributionMarketClient::new(&env, &market);
        let free = dm.free_collateral();
        if free <= 0 {
            panic_with_error!(&env, KaidoError::InsufficientLiquidity);
        }
        let max_7dp = free / MONEY_SCALE;
        let actual_7dp = amount_7dp.min(max_7dp);
        if actual_7dp <= 0 {
            panic_with_error!(&env, KaidoError::InvalidAmount);
        }
        let next = cur + actual_7dp;
        if next > cap_7dp {
            panic_with_error!(&env, KaidoError::CapExceeded);
        }
        let amount_wad = actual_7dp * MONEY_SCALE;
        let mut scale = mul_div(amount_wad, WAD, free);
        if scale <= 0 {
            scale = 1;
        }
        if scale > WAD {
            scale = WAD;
        }
        env.authorize_as_current_contract(transfer_auth(
            &env,
            &usdc,
            &me,
            &market,
            actual_7dp,
        ));
        let shares = dm.add_liquidity(&me, &scale);
        env.storage().persistent().set(&key, &next);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_TARGET);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_TARGET);
        Seeded {
            market,
            amount: actual_7dp,
            shares,
        }
        .publish(&env);
        shares
    }

    /// Admin-gated. Burn `shares` of the vault's LP position in `market` and
    /// reclaim USDC (lands back in the vault). Reduces recorded exposure by the
    /// reclaimed amount (floored at 0).
    pub fn withdraw_proportional(env: Env, market: Address, shares: i128) -> i128 {
        let admin = Self::admin(&env);
        admin.require_auth();
        let me = env.current_contract_address();
        let amount = DistributionMarketClient::new(&env, &market).remove_liquidity(&me, &shares);
        let key = DataKey::Exposure(market.clone());
        let cur: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(cur - amount).max(0));
        Withdrawn {
            market,
            shares,
            amount,
        }
        .publish(&env);
        amount
    }

    /// The vault's recorded cumulative exposure to `market` (7-dp USDC).
    pub fn exposure(env: Env, market: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Exposure(market))
            .unwrap_or(0)
    }

    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, KaidoError::NotInitialized))
    }
}

/// A single `InvokerContractAuthEntry` authorizing `usdc.transfer(from, to,
/// amount)` made on behalf of this contract from somewhere deeper in the call
/// stack (the market pulling our USDC).
fn transfer_auth(
    env: &Env,
    usdc: &Address,
    from: &Address,
    to: &Address,
    amount: i128,
) -> Vec<InvokerContractAuthEntry> {
    vec![
        env,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: usdc.clone(),
                fn_name: Symbol::new(env, "transfer"),
                args: (from.clone(), to.clone(), amount).into_val(env),
            },
            sub_invocations: vec![env],
        }),
    ]
}

#[cfg(test)]
mod test;
