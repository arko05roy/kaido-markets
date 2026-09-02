//! `distribution-market` tests (Sprint 1): `init` happy path + every validation
//! branch, `get_params`/`get_state` round-trip, the `MarketCreated` event, and a
//! gas/footprint snapshot. Trading/LP/resolution tests arrive with that logic in
//! Sprint 2.

use super::*;
use kaido_common::{MarketWindow, ResolverTier};
use kaido_math::{lambda as lambda_of, sigma_floor, wdiv, wmul, WAD};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    Address, Env,
};

// --- demo market parameters (all WAD-scaled where numeric; ADR-1/ADR-2) ----
const K: i128 = WAD; // k = 1.0
const B: i128 = 100 * WAD; // b = 100.0
const FEE_BPS: u32 = 30; // 0.30%
const TIER: u32 = 0; // ResolverTier::Reflector
const W_OPEN: u64 = 0;
const W_LOCK: u64 = 10_000;
const W_RESOLVE: u64 = 100_000;
const MU0: i128 = 50 * WAD; // μ₀ = 50.0
const SIGMA0: i128 = WAD; // σ₀ = 1.0 (well above σ_min for k=1, b=100)

/// `σ√(2π)` constant in WAD, for computing the expected peak independently.
const SQRT_2PI: i128 = 2_506_628_274_631_000_502;

fn expected_params(resolver: &Address) -> MarketParams {
    MarketParams {
        outcome_space: OutcomeSpace::Scalar,
        parameterization: Parameterization::Gaussian,
        capped: false,
        k: K,
        b: B,
        fee_bps: FEE_BPS,
        resolver: resolver.clone(),
        tier: ResolverTier::Reflector,
        window: MarketWindow {
            open: W_OPEN,
            lock: W_LOCK,
            resolve: W_RESOLVE,
        },
    }
}

fn setup() -> (Env, DistributionMarketClient<'static>, Address) {
    let env = Env::default();
    let id = env.register(DistributionMarket, ());
    let client = DistributionMarketClient::new(&env, &id);
    let resolver = Address::generate(&env);
    (env, client, resolver)
}

/// Init with the demo parameters (panics on rejection).
fn init_ok(client: &DistributionMarketClient, resolver: &Address) {
    client.init(
        &K, &B, &FEE_BPS, resolver, &TIER, &W_OPEN, &W_LOCK, &W_RESOLVE, &MU0, &SIGMA0,
    );
}

#[test]
fn init_happy_path_then_reads_round_trip() {
    let (_env, client, resolver) = setup();
    init_ok(&client, &resolver);

    // get_params reconstructs the tuple exactly.
    assert_eq!(client.get_params(), expected_params(&resolver));

    // get_state: status Open, belief = (μ₀, σ₀, λ₀), σ_min as kaido-math says.
    let state = client.get_state();
    assert_eq!(state.status, MarketStatus::Open);
    assert_eq!(state.belief.mu, MU0);
    assert_eq!(state.belief.sigma, SIGMA0);
    let expected_lambda = lambda_of(K, SIGMA0);
    assert_eq!(state.belief.lambda, expected_lambda);
    assert_eq!(state.sigma_min, sigma_floor(K, B));

    // the seeded curve is solvent: 0 < peak ≤ b.
    let peak = wdiv(expected_lambda, wmul(SIGMA0, SQRT_2PI));
    assert!(peak > 0 && peak <= B);

    // wad() reports the internal scale.
    assert_eq!(client.wad(), WAD);
}

#[test]
fn init_emits_one_market_created_event() {
    let (env, client, resolver) = setup();
    init_ok(&client, &resolver);
    // exactly one event (the `MarketCreated` event, topic "market_created";
    // richer event parsing is the indexer's job — Sprint 4).
    assert_eq!(env.events().all().events().len(), 1);
}

#[test]
fn init_is_one_shot() {
    let (_env, client, resolver) = setup();
    init_ok(&client, &resolver);
    assert!(client
        .try_init(&K, &B, &FEE_BPS, &resolver, &TIER, &W_OPEN, &W_LOCK, &W_RESOLVE, &MU0, &SIGMA0)
        .is_err());
}

#[test]
fn reads_before_init_fail() {
    let (_env, client, _resolver) = setup();
    assert!(client.try_get_params().is_err());
    assert!(client.try_get_state().is_err());
}

#[test]
fn rejects_bad_params() {
    let (env, _c, resolver) = setup();
    let fresh = || {
        let id = env.register(DistributionMarket, ());
        DistributionMarketClient::new(&env, &id)
    };
    // (k, b, fee, tier, open, lock, resolve, mu0, sigma0)
    let try_init =
        |c: &DistributionMarketClient,
         k: i128,
         b: i128,
         fee: u32,
         tier: u32,
         o: u64,
         l: u64,
         r: u64,
         mu: i128,
         s: i128| { c.try_init(&k, &b, &fee, &resolver, &tier, &o, &l, &r, &mu, &s) };

    // k ≤ 0
    assert!(try_init(
        &fresh(),
        0,
        B,
        FEE_BPS,
        TIER,
        W_OPEN,
        W_LOCK,
        W_RESOLVE,
        MU0,
        SIGMA0
    )
    .is_err());
    // b ≤ 0
    assert!(try_init(
        &fresh(),
        K,
        0,
        FEE_BPS,
        TIER,
        W_OPEN,
        W_LOCK,
        W_RESOLVE,
        MU0,
        SIGMA0
    )
    .is_err());
    // fee too high
    assert!(try_init(
        &fresh(),
        K,
        B,
        MAX_FEE_BPS + 1,
        TIER,
        W_OPEN,
        W_LOCK,
        W_RESOLVE,
        MU0,
        SIGMA0
    )
    .is_err());
    // bad tier code
    assert!(try_init(
        &fresh(),
        K,
        B,
        FEE_BPS,
        4,
        W_OPEN,
        W_LOCK,
        W_RESOLVE,
        MU0,
        SIGMA0
    )
    .is_err());
    // window out of order (lock > resolve)
    assert!(try_init(
        &fresh(),
        K,
        B,
        FEE_BPS,
        TIER,
        0,
        100_000,
        10_000,
        MU0,
        SIGMA0
    )
    .is_err());
    // window in the past
    env.ledger().set_timestamp(200_000);
    assert!(try_init(
        &fresh(),
        K,
        B,
        FEE_BPS,
        TIER,
        W_OPEN,
        W_LOCK,
        W_RESOLVE,
        MU0,
        SIGMA0
    )
    .is_err());
    env.ledger().set_timestamp(0);
    // σ₀ ≤ 0
    assert!(try_init(
        &fresh(),
        K,
        B,
        FEE_BPS,
        TIER,
        W_OPEN,
        W_LOCK,
        W_RESOLVE,
        MU0,
        0
    )
    .is_err());
    // σ₀ far below the floor (σ_min for k=1, b=100 ≈ 5.6e13 in WAD)
    assert!(try_init(
        &fresh(),
        K,
        B,
        FEE_BPS,
        TIER,
        W_OPEN,
        W_LOCK,
        W_RESOLVE,
        MU0,
        1_000
    )
    .is_err());

    // a *valid* market still works after all those rejections.
    let ok = fresh();
    init_ok(&ok, &resolver);
    assert_eq!(ok.get_state().status, MarketStatus::Open);
}

#[test]
fn sigma_at_or_just_above_floor() {
    let (env, _c, resolver) = setup();
    let s_min = sigma_floor(K, B);
    assert!(s_min > 0);

    // At exactly σ_min the seeded peak is ≈ b; rounding may push it a hair over,
    // in which case init rejects with PeakExceedsCollateral. Either way, no
    // panic-on-overflow / no silent bad state; and if accepted, peak ≤ b holds.
    let id = env.register(DistributionMarket, ());
    let c = DistributionMarketClient::new(&env, &id);
    if c.try_init(
        &K, &B, &FEE_BPS, &resolver, &TIER, &W_OPEN, &W_LOCK, &W_RESOLVE, &MU0, &s_min,
    )
    .is_ok()
    {
        let peak = wdiv(c.get_state().belief.lambda, wmul(s_min, SQRT_2PI));
        assert!(peak <= B);
    }

    // 1% above the floor: definitely fine.
    let s = s_min + s_min / 100 + 1;
    let id = env.register(DistributionMarket, ());
    let c = DistributionMarketClient::new(&env, &id);
    c.init(
        &K, &B, &FEE_BPS, &resolver, &TIER, &W_OPEN, &W_LOCK, &W_RESOLVE, &MU0, &s,
    );
    let st = c.get_state();
    assert!(wdiv(st.belief.lambda, wmul(st.belief.sigma, SQRT_2PI)) <= B);
}

#[test]
fn gas_snapshot() {
    // Records cost/footprint into `test_snapshots/` (committed; CI flags
    // regressions — build.md §6 item 9).
    let (_env, client, resolver) = setup();
    init_ok(&client, &resolver);
    let _ = client.get_params();
    let _ = client.get_state();
}
