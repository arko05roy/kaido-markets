//! Unit tests for the pre-deploy validation path. The full create→deploy→init→
//! register lifecycle (which needs the `DistributionMarket` WASM uploaded into
//! the test env) lives in the `tests/` integration crate, where the WASM is
//! built first — see build.md §5 Sprint 3.
use super::*;
use kaido_math::WAD;
use soroban_sdk::{testutils::Address as _, BytesN, Env};

fn boot() -> (Env, MarketFactoryClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let registry = Address::generate(&env);
    let usdc = Address::generate(&env);
    // A placeholder WASM hash — the validation reverts under test fire before
    // any `deploy_v2`, so the hash is never dereferenced.
    let wasm = BytesN::from_array(&env, &[7u8; 32]);
    let treasury = Address::generate(&env);
    let id = env.register(MarketFactory, (admin, wasm, registry, usdc, treasury));
    let client = MarketFactoryClient::new(&env, &id);
    let creator = Address::generate(&env);
    (env, client, creator)
}

fn ok_args() -> (i128, i128, u32, u32, u64, u64, u64, i128, i128, u32) {
    // k, b, fee_bps, tier, w_open, w_lock, w_resolve, mu0, sigma0, capped_flag
    (WAD, 100 * WAD, 30, 0, 0, 1_000, 2_000, 50 * WAD, WAD, 0)
}

#[test]
fn views_after_construct() {
    let (env, f, _c) = boot();
    assert_eq!(f.count(), 0);
    assert_eq!(f.market_wasm(), BytesN::from_array(&env, &[7u8; 32]));
}

#[test]
#[should_panic]
fn rejects_fee_over_cap() {
    let (env, f, c) = boot();
    let (k, b, _fee, tier, wo, wl, wr, mu0, s0, capped) = ok_args();
    let resolver = Address::generate(&env);
    f.create_market(
        &c,
        &k,
        &b,
        &(MAX_FEE_BPS + 1),
        &resolver,
        &tier,
        &wo,
        &wl,
        &wr,
        &mu0,
        &s0,
        &capped,
    );
}

#[test]
#[should_panic]
fn rejects_bad_window() {
    let (env, f, c) = boot();
    let (k, b, fee, tier, _wo, _wl, _wr, mu0, s0, capped) = ok_args();
    let resolver = Address::generate(&env);
    // resolve before lock
    f.create_market(
        &c, &k, &b, &fee, &resolver, &tier, &0, &2_000, &1_000, &mu0, &s0, &capped,
    );
}

#[test]
#[should_panic]
fn rejects_bad_tier() {
    let (env, f, c) = boot();
    let (k, b, fee, _tier, wo, wl, wr, mu0, s0, capped) = ok_args();
    let resolver = Address::generate(&env);
    f.create_market(&c, &k, &b, &fee, &resolver, &9, &wo, &wl, &wr, &mu0, &s0, &capped);
}

#[test]
#[should_panic]
fn rejects_sigma_below_floor() {
    let (env, f, c) = boot();
    let (k, b, fee, tier, wo, wl, wr, mu0, _s0, capped) = ok_args();
    let resolver = Address::generate(&env);
    f.create_market(
        &c, &k, &b, &fee, &resolver, &tier, &wo, &wl, &wr, &mu0, &1i128, &capped,
    );
}
