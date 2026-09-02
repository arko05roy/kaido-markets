//! `resolver-reflector` tests — happy path, TWAP averaging, stale/missing
//! price (→ `Stale`), and the too-early gate (→ `Pending` / `ResolverNotReady`).

use super::*;
use sep_40_oracle::testutils::{MockPriceOracleClient, MockPriceOracleWASM};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Address, Env, String, Symbol, Vec,
};

const RESOLVE_TIME: u64 = 10_000;
const ORACLE_DECIMALS: u32 = 14; // Reflector reports 14 dp

fn setup() -> (Env, MockPriceOracleClient<'static>, Asset) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle_id = env.register(MockPriceOracleWASM, ());
    let oracle = MockPriceOracleClient::new(&env, &oracle_id);
    let base = sep_40_oracle::testutils::Asset::Other(Symbol::new(&env, "USD"));
    let asset = sep_40_oracle::testutils::Asset::Other(Symbol::new(&env, "BTC"));
    oracle.set_data(
        &admin,
        &base,
        &vec![&env, asset.clone()],
        &ORACLE_DECIMALS,
        &300,
    );
    // The resolver-side `Asset` and the mock-wasm `Asset` are distinct types
    // sharing the same XDR; reconstruct ours.
    let our_asset = Asset::Other(Symbol::new(&env, "BTC"));
    let _ = String::from_str(&env, "");
    (env, oracle, our_asset)
}

fn deploy_resolver(
    env: &Env,
    oracle_id: &Address,
    asset: &Asset,
    twap: u32,
) -> ResolverReflectorClient<'static> {
    let id = env.register(
        ResolverReflector,
        (
            oracle_id.clone(),
            asset.clone(),
            RESOLVE_TIME,
            twap,
            Vec::<u64>::new(env),
        ),
    );
    ResolverReflectorClient::new(env, &id)
}

fn deploy_trajectory_resolver(
    env: &Env,
    oracle_id: &Address,
    asset: &Asset,
    checkpoints: Vec<u64>,
) -> ResolverReflectorClient<'static> {
    let id = env.register(
        ResolverReflector,
        (
            oracle_id.clone(),
            asset.clone(),
            RESOLVE_TIME,
            1u32,
            checkpoints,
        ),
    );
    ResolverReflectorClient::new(env, &id)
}

fn oracle_addr(client: &MockPriceOracleClient) -> Address {
    client.address.clone()
}

#[test]
fn happy_path_spot() {
    let (env, oracle, asset) = setup();
    // price = 65000.0 at 14dp
    let raw = 65_000i128 * 10i128.pow(ORACLE_DECIMALS);
    oracle.set_price(&vec![&env, raw], &RESOLVE_TIME);
    let r = deploy_resolver(&env, &oracle_addr(&oracle), &asset, 1);

    // before resolve_time
    assert_eq!(r.status(), ResolverStatus::Pending);
    assert!(r.try_resolve().is_err());

    env.ledger().set_timestamp(RESOLVE_TIME + 1);
    assert_eq!(r.status(), ResolverStatus::Resolved(65_000i128 * WAD_LOCAL));
    assert_eq!(r.resolve(), 65_000i128 * WAD_LOCAL);
    // cached & stable
    assert_eq!(r.resolve(), 65_000i128 * WAD_LOCAL);
}

const WAD_LOCAL: i128 = 1_000_000_000_000_000_000;

#[test]
fn twap_averages_records() {
    let (env, oracle, asset) = setup();
    let scale = 10i128.pow(ORACLE_DECIMALS);
    oracle.set_price(&vec![&env, 100i128 * scale], &(RESOLVE_TIME - 600));
    oracle.set_price(&vec![&env, 200i128 * scale], &(RESOLVE_TIME - 300));
    oracle.set_price(&vec![&env, 300i128 * scale], &RESOLVE_TIME);
    let r = deploy_resolver(&env, &oracle_addr(&oracle), &asset, 3);
    env.ledger().set_timestamp(RESOLVE_TIME + 1);
    // mean(100,200,300) = 200
    assert_eq!(r.resolve(), 200i128 * WAD_LOCAL);
}

#[test]
fn trajectory_resolves_per_checkpoint() {
    let (env, oracle, asset) = setup();
    let scale = 10i128.pow(ORACLE_DECIMALS);
    // checkpoints on the 300s resolution grid (the mock rounds to it), all ≤ RESOLVE_TIME.
    let cps = vec![&env, 9_000u64, 9_300u64, 9_600u64];
    oracle.set_price(&vec![&env, 60_000i128 * scale], &9_000u64);
    oracle.set_price(&vec![&env, 61_000i128 * scale], &9_300u64);
    oracle.set_price(&vec![&env, 62_000i128 * scale], &9_600u64);
    let r = deploy_trajectory_resolver(&env, &oracle_addr(&oracle), &asset, cps);

    assert_eq!(r.status(), ResolverStatus::Pending);
    env.ledger().set_timestamp(RESOLVE_TIME + 1);

    let expected = vec![
        &env,
        60_000i128 * WAD_LOCAL,
        61_000i128 * WAD_LOCAL,
        62_000i128 * WAD_LOCAL,
    ];
    assert_eq!(r.status(), ResolverStatus::ResolvedVec(expected.clone()));
    // resolve() returns the last checkpoint and caches the vector.
    assert_eq!(r.resolve(), 62_000i128 * WAD_LOCAL);
    assert_eq!(r.status(), ResolverStatus::ResolvedVec(expected));
}

#[test]
#[should_panic]
fn non_ascending_checkpoints_rejected() {
    let (env, oracle, asset) = setup();
    deploy_trajectory_resolver(
        &env,
        &oracle_addr(&oracle),
        &asset,
        vec![&env, 9_000u64, 9_000u64],
    );
}

#[test]
fn stale_oracle_is_stale() {
    let (env, oracle, asset) = setup();
    let r = deploy_resolver(&env, &oracle_addr(&oracle), &asset, 1);
    env.ledger().set_timestamp(RESOLVE_TIME + 1);
    // no price ever set
    assert_eq!(r.status(), ResolverStatus::Stale);
    assert!(r.try_resolve().is_err());
}
