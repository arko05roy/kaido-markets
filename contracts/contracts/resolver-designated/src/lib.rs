//! Resolver T3 — a single named party reports the outcome after `resolve_time`.
//!
//! Pure trust, clearly badged (ADR-5, whitepaper §17). The designated reporter
//! calls [`Self::report`] once; [`status`] / [`resolve`] then return the cached
//! value. Before `resolve_time` the resolver is `Pending`.

#![no_std]

use kaido_common::{KaidoError, ResolverStatus};
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env};

const LEDGERS_PER_DAY: u32 = 17_280;
const INSTANCE_TTL_TARGET: u32 = 365 * LEDGERS_PER_DAY;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL_TARGET - 30 * LEDGERS_PER_DAY;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// The single party allowed to report.
    Designated,
    /// `u64` — earliest time a report is accepted.
    ResolveTime,
    /// `i128` — cached outcome (WAD), once reported.
    Resolved,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ResolverError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AlreadyReported = 3,
    NotYetResolveTime = 4,
    NotReported = 5,
}

#[contract]
pub struct ResolverDesignated;

#[contractimpl]
impl ResolverDesignated {
    /// Wire the resolver to one designated reporter and a resolve timestamp.
    pub fn __constructor(env: Env, designated: Address, resolve_time: u64) {
        let s = env.storage().instance();
        if s.has(&DataKey::Designated) {
            panic_with_error!(&env, ResolverError::AlreadyInitialized);
        }
        s.set(&DataKey::Designated, &designated);
        s.set(&DataKey::ResolveTime, &resolve_time);
        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
    }

    /// The designated party posts the realised outcome `value` (WAD). Callable
    /// only at or after `resolve_time`, once.
    pub fn report(env: Env, reporter: Address, value: i128) {
        reporter.require_auth();
        let s = env.storage().instance();
        let designated: Address = s
            .get(&DataKey::Designated)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotInitialized));
        if reporter != designated {
            panic_with_error!(&env, KaidoError::Unauthorized);
        }
        if s.has(&DataKey::Resolved) {
            panic_with_error!(&env, ResolverError::AlreadyReported);
        }
        let resolve_time: u64 = s.get(&DataKey::ResolveTime).unwrap();
        if env.ledger().timestamp() < resolve_time {
            panic_with_error!(&env, ResolverError::NotYetResolveTime);
        }
        s.set(&DataKey::Resolved, &value);
        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
    }

    /// Realised outcome `x₀` in WAD. Panics if not yet reported.
    pub fn resolve(env: Env) -> i128 {
        let s = env.storage().instance();
        s.get(&DataKey::Resolved)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotReported))
    }

    /// Non-trapping status query.
    pub fn status(env: Env) -> ResolverStatus {
        let s = env.storage().instance();
        if let Some(v) = s.get::<_, i128>(&DataKey::Resolved) {
            return ResolverStatus::Resolved(v);
        }
        let resolve_time: u64 = match s.get(&DataKey::ResolveTime) {
            Some(t) => t,
            None => return ResolverStatus::Stale,
        };
        if env.ledger().timestamp() < resolve_time {
            ResolverStatus::Pending
        } else {
            // past resolve time but no report yet — still pending (not stale).
            ResolverStatus::Pending
        }
    }

    /// The configured designated reporter.
    pub fn designated(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Designated)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotInitialized))
    }

    /// Configured resolve timestamp.
    pub fn resolve_time(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ResolveTime)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotInitialized))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Ledger;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn report_and_resolve() {
        let env = Env::default();
        env.mock_all_auths();
        let designated = Address::generate(&env);
        let id = env.register(ResolverDesignated, (designated.clone(), 1_000u64));
        let client = ResolverDesignatedClient::new(&env, &id);
        env.ledger().set_timestamp(1_000);
        assert!(matches!(client.status(), ResolverStatus::Pending));
        let x0 = 42_500_000_000_000_000_000i128; // 42.5 WAD
        client.report(&designated, &x0);
        assert!(matches!(client.status(), ResolverStatus::Resolved(v) if v == x0));
        assert_eq!(client.resolve(), x0);
    }

    #[test]
    fn non_designated_cannot_report() {
        let env = Env::default();
        env.mock_all_auths();
        let designated = Address::generate(&env);
        let other = Address::generate(&env);
        let id = env.register(ResolverDesignated, (designated, 0u64));
        let client = ResolverDesignatedClient::new(&env, &id);
        assert!(client.try_report(&other, &1i128).is_err());
    }

    #[test]
    fn cannot_report_before_resolve_time() {
        let env = Env::default();
        env.mock_all_auths();
        let designated = Address::generate(&env);
        let id = env.register(ResolverDesignated, (designated.clone(), 5_000u64));
        let client = ResolverDesignatedClient::new(&env, &id);
        env.ledger().set_timestamp(100);
        assert!(client.try_report(&designated, &1i128).is_err());
    }
}
