//! Resolver T0 — implements the Kaido [`Resolver`](kaido_common::Resolver)
//! interface over a SEP-40 price oracle (Reflector on mainnet/testnet; the
//! script3 mock in tests).
//!
//! At `resolve_time` it reads the asset's price — a short-window TWAP over the
//! last `twap_records` ticks (falling back to `lastprice`) so a last-second
//! wick can't move the outcome — converts it from the oracle's own decimals to
//! WAD (`1e18`), caches it (so re-reads are stable), and returns it.
//!
//! Per-network values (the oracle contract id, the quoted asset) are
//! constructor arguments — never hardcoded (build.md §0a).

#![no_std]

use kaido_common::{KaidoError, ResolverStatus};
use kaido_math::WAD as _WAD;
use sep_40_oracle::{Asset, PriceData, PriceFeedClient};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Vec,
};

const LEDGERS_PER_DAY: u32 = 17_280;
const INSTANCE_TTL_TARGET: u32 = 365 * LEDGERS_PER_DAY;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL_TARGET - 30 * LEDGERS_PER_DAY;

const _: () = assert!(_WAD == 1_000_000_000_000_000_000);

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// The SEP-40 oracle contract.
    Oracle,
    /// The quoted [`Asset`].
    Asset,
    /// `u64` — when `resolve()` becomes valid.
    ResolveTime,
    /// `u32` — number of trailing price records to TWAP over.
    TwapRecords,
    /// `i128` — cached resolved outcome (WAD), once known.
    Resolved,
}

/// Errors specific to this resolver (kept out of the shared [`KaidoError`]).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ResolverError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
}

#[contract]
pub struct ResolverReflector;

#[contractimpl]
impl ResolverReflector {
    /// Wire the resolver to a specific oracle + asset + resolve time.
    /// `twap_records` is the number of trailing oracle ticks to average; `1`
    /// degenerates to a spot read.
    pub fn __constructor(
        env: Env,
        oracle: Address,
        asset: Asset,
        resolve_time: u64,
        twap_records: u32,
    ) {
        let s = env.storage().instance();
        if s.has(&DataKey::Oracle) {
            panic_with_error!(&env, ResolverError::AlreadyInitialized);
        }
        s.set(&DataKey::Oracle, &oracle);
        s.set(&DataKey::Asset, &asset);
        s.set(&DataKey::ResolveTime, &resolve_time);
        s.set(&DataKey::TwapRecords, &twap_records.max(1));
        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
    }

    /// Realised outcome `x₀` in WAD. Panics with `ResolverNotReady` before
    /// `resolve_time`, `OracleStale` if the oracle has no usable price.
    pub fn resolve(env: Env) -> i128 {
        let s = env.storage().instance();
        if let Some(v) = s.get::<_, i128>(&DataKey::Resolved) {
            return v;
        }
        let resolve_time: u64 = s
            .get(&DataKey::ResolveTime)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotInitialized));
        if env.ledger().timestamp() < resolve_time {
            panic_with_error!(&env, KaidoError::ResolverNotReady);
        }
        let price =
            read_price(&env).unwrap_or_else(|| panic_with_error!(&env, KaidoError::OracleStale));
        s.set(&DataKey::Resolved, &price);
        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
        price
    }

    /// Non-trapping status.
    pub fn status(env: Env) -> ResolverStatus {
        let s = env.storage().instance();
        if let Some(v) = s.get::<_, i128>(&DataKey::Resolved) {
            return ResolverStatus::Resolved(v);
        }
        let resolve_time: u64 = match s.get(&DataKey::ResolveTime) {
            Some(t) => t,
            None => return ResolverStatus::Pending,
        };
        if env.ledger().timestamp() < resolve_time {
            return ResolverStatus::Pending;
        }
        match read_price(&env) {
            Some(v) => ResolverStatus::Resolved(v),
            None => ResolverStatus::Stale,
        }
    }
}

/// Read the (TWAP-smoothed) price for the configured asset and convert it to
/// WAD, or `None` if the oracle has nothing usable.
fn read_price(env: &Env) -> Option<i128> {
    let s = env.storage().instance();
    let oracle: Address = s.get(&DataKey::Oracle)?;
    let asset: Asset = s.get(&DataKey::Asset)?;
    let records: u32 = s.get(&DataKey::TwapRecords).unwrap_or(1);
    let client = PriceFeedClient::new(env, &oracle);
    let decimals = client.decimals();

    let raw: i128 = if records > 1 {
        match client.prices(&asset, &records) {
            Some(v) if !v.is_empty() => mean(&v),
            _ => client.lastprice(&asset)?.price,
        }
    } else {
        client.lastprice(&asset)?.price
    };
    if raw <= 0 {
        return None;
    }
    Some(to_wad(raw, decimals))
}

fn mean(v: &Vec<PriceData>) -> i128 {
    let mut acc: i128 = 0;
    for p in v.iter() {
        acc += p.price;
    }
    acc / (v.len() as i128)
}

/// Convert an oracle-decimals integer price to WAD (`1e18`).
fn to_wad(raw: i128, decimals: u32) -> i128 {
    if decimals == 18 {
        raw
    } else if decimals < 18 {
        raw * 10i128.pow(18 - decimals)
    } else {
        raw / 10i128.pow(decimals - 18)
    }
}

#[cfg(test)]
mod test;
