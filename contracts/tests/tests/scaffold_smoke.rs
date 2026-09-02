//! Sprint-1 smoke test: every contract crate links into a fresh `Env`.
//!
//!  * the 7 still-scaffold contracts answer `scaffold_version() == 0`;
//!  * `distribution-market` (the first one with real logic) round-trips
//!    `init` → `get_params` / `get_state` and emits an event.
//!
//! This proves the contract crates link and the workspace test harness runs.
//! Full multi-contract lifecycle tests (factory → registry → house → market →
//! resolver) arrive in Sprints 2–3 (build.md §5).

use kaido_common::{
    MarketParams, MarketStatus, MarketWindow, OutcomeSpace, Parameterization, ResolverTier,
};
use kaido_math::{sigma_floor, WAD};
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    Address, Env,
};

macro_rules! check_scaffold {
    ($name:literal, $contract:path, $client:path) => {{
        let env = Env::default();
        let id = env.register($contract, ());
        let client = <$client>::new(&env, &id);
        assert_eq!(client.scaffold_version(), 0, "{} scaffold_version", $name);
    }};
}

#[test]
fn scaffold_contracts_link() {
    // market-factory and registry now have real Sprint-3 logic (no
    // `scaffold_version`); a smoke check that they construct + answer views.
    // (The full create→deploy→init→register lifecycle test, which needs the
    // DistributionMarket WASM uploaded into the env, lands in a follow-up once
    // the wasm-build-before-test ordering is wired — build.md §5 Sprint 3.)
    {
        let env = Env::default();
        let admin = Address::generate(&env);
        let factory_addr = Address::generate(&env);
        let reg = env.register(registry::Registry, (admin.clone(), factory_addr.clone()));
        let reg = registry::RegistryClient::new(&env, &reg);
        assert_eq!(reg.count(), 0);
        assert_eq!(reg.factory(), factory_addr);

        let dm_wasm = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
        let usdc = Address::generate(&env);
        let f = env.register(
            market_factory::MarketFactory,
            (admin, dm_wasm, reg.address.clone(), usdc),
        );
        let f = market_factory::MarketFactoryClient::new(&env, &f);
        assert_eq!(f.count(), 0);
        assert_eq!(f.registry(), reg.address);
    }
    // house-vault, resolver-reflector, and T1–T3 resolvers have real logic —
    // exercised by their crate tests and `lifecycle.rs`.
}

#[test]
fn distribution_market_init_and_reads() {
    let env = Env::default();
    let id = env.register(distribution_market::DistributionMarket, ());
    let client = distribution_market::DistributionMarketClient::new(&env, &id);
    let resolver = Address::generate(&env);
    let usdc = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();

    // demo scalar Gaussian market: k=1, b=100, μ₀=50, σ₀=1 (all WAD-scaled),
    // 0.30% fee, Reflector (T0) resolver, window now+0 / +10k / +100k.
    let (k, b, fee, tier, w_open, w_lock, w_resolve, mu0, sigma0) = (
        WAD,
        100 * WAD,
        30u32,
        0u32,
        0u64,
        10_000u64,
        100_000u64,
        50 * WAD,
        WAD,
    );

    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);

    client.init(
        &k,
        &b,
        &fee,
        &resolver,
        &tier,
        &w_open,
        &w_lock,
        &w_resolve,
        &mu0,
        &sigma0,
        &usdc,
        &0u32,
        &treasury,
        &creator,
        &7_000u32,
        &2_000u32,
        &1_000u32,
    );
    // `init` emitted exactly one event (`MarketCreated`). Check immediately —
    // the test env's event buffer reflects the most recent invocation.
    assert_eq!(env.events().all().events().len(), 1);

    let expected = MarketParams {
        outcome_space: OutcomeSpace::Scalar,
        parameterization: Parameterization::Gaussian,
        capped: false,
        k,
        b,
        fee_bps: fee,
        resolver: resolver.clone(),
        tier: ResolverTier::Reflector,
        window: MarketWindow {
            open: w_open,
            lock: w_lock,
            resolve: w_resolve,
        },
    };
    assert_eq!(client.get_params(), expected);
    assert_eq!(client.wad(), WAD);

    let state = client.get_state();
    assert_eq!(state.status, MarketStatus::Open);
    assert_eq!(state.belief.mu, mu0);
    assert_eq!(state.belief.sigma, sigma0);
    assert!(state.belief.lambda > 0);
    assert_eq!(state.sigma_min, sigma_floor(k, b));

    // init is one-shot.
    assert!(client
        .try_init(
            &k,
            &b,
            &fee,
            &resolver,
            &tier,
            &w_open,
            &w_lock,
            &w_resolve,
            &mu0,
            &sigma0,
            &usdc,
            &0u32,
            &treasury,
            &creator,
            &7_000u32,
            &2_000u32,
            &1_000u32,
        )
        )
        .is_err());
}
