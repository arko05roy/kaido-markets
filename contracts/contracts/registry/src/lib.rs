//! `Registry` — the on-chain index of live markets, their resolvers, and trust
//! tiers (whitepaper §14–15). The frontend reads this to list markets without a
//! per-market `get_params` round-trip; each market contract remains the source
//! of truth for its live state.
//!
//! **Trust model:** registration is *not* open to anyone — it would be a spam
//! vector. The registry is constructed pointing at one `MarketFactory`
//! contract; only that factory may `register`. (Cross-contract calls are
//! authenticated automatically for the calling contract, so the factory
//! authorises the `register` call by virtue of being the invoker.) The factory
//! address can be rotated by the registry admin (e.g. after a factory upgrade).
//!
//! Sprint 3 (build.md §5, E3).

#![no_std]

use kaido_common::{KaidoError, MarketInfo, MarketRegistered};
use soroban_sdk::{contract, contractimpl, contracttype, panic_with_error, Address, Env, Vec};

const LEDGERS_PER_DAY: u32 = 17_280;
const INSTANCE_TTL_TARGET: u32 = 120 * LEDGERS_PER_DAY;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL_TARGET - 14 * LEDGERS_PER_DAY;
const PERSISTENT_TTL_TARGET: u32 = 365 * LEDGERS_PER_DAY;
const PERSISTENT_TTL_THRESHOLD: u32 = PERSISTENT_TTL_TARGET - 30 * LEDGERS_PER_DAY;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// `Address` — the registry admin (may rotate the factory address).
    Admin,
    /// `Address` — the `MarketFactory` allowed to `register`.
    Factory,
    /// `Vec<Address>` — every registered market, in registration order.
    Markets,
    /// [`MarketInfo`] keyed by market address (persistent).
    Info(Address),
}

#[contract]
pub struct Registry;

#[contractimpl]
impl Registry {
    /// `admin` may later rotate the registered `factory`; `factory` is the only
    /// contract allowed to `register` a market.
    pub fn __constructor(env: Env, admin: Address, factory: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Factory, &factory);
        s.set(&DataKey::Markets, &Vec::<Address>::new(&env));
        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
    }

    /// Index a market. Callable only by the registered `MarketFactory`.
    pub fn register(env: Env, info: MarketInfo) {
        let s = env.storage().instance();
        let factory: Address = s
            .get(&DataKey::Factory)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        factory.require_auth();

        let key = DataKey::Info(info.market.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, KaidoError::AlreadyInitialized);
        }
        let mut markets: Vec<Address> = s.get(&DataKey::Markets).unwrap();
        markets.push_back(info.market.clone());
        s.set(&DataKey::Markets, &markets);
        env.storage().persistent().set(&key, &info);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_TARGET,
        );
        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);

        MarketRegistered {
            market: info.market.clone(),
            info,
        }
        .publish(&env);
    }

    /// Rotate the factory allowed to `register` (e.g. after a factory upgrade).
    pub fn set_factory(env: Env, new_factory: Address) {
        let s = env.storage().instance();
        let admin: Address = s
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        admin.require_auth();
        s.set(&DataKey::Factory, &new_factory);
        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
    }

    // ----------------------------------------------------------------- //
    // Views
    // ----------------------------------------------------------------- //

    /// Number of registered markets.
    pub fn count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get::<_, Vec<Address>>(&DataKey::Markets)
            .map(|m| m.len())
            .unwrap_or(0)
    }

    /// All registered market addresses, oldest first. (Fine for the launch
    /// scale; a paged variant exists for when the list grows.)
    pub fn all(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Markets)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// A window `[start, start+limit)` of market addresses (registration order).
    pub fn page(env: Env, start: u32, limit: u32) -> Vec<Address> {
        let all: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Markets)
            .unwrap_or_else(|| Vec::new(&env));
        let n = all.len();
        let end = start.saturating_add(limit).min(n);
        let mut out = Vec::new(&env);
        let mut i = start.min(n);
        while i < end {
            out.push_back(all.get(i).unwrap());
            i += 1;
        }
        out
    }

    /// The indexed summary for a market (panics `PositionNotFound` if unknown).
    pub fn get(env: Env, market: Address) -> MarketInfo {
        env.storage()
            .persistent()
            .get(&DataKey::Info(market))
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::PositionNotFound))
    }

    /// The currently-authorised factory.
    pub fn factory(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Factory)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized))
    }

    /// The admin.
    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized))
    }
}

#[cfg(test)]
mod test;
