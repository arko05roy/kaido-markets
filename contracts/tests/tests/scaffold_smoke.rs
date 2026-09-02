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
    check_scaffold!(
        "market-factory",
        market_factory::MarketFactory,
        market_factory::MarketFactoryClient
    );
    check_scaffold!("registry", registry::Registry, registry::RegistryClient);
    // house-vault and resolver-reflector now have real Sprint-2 logic (no
    // `scaffold_version`) — they're exercised by their own crates' tests and
    // by `lifecycle.rs`.
    check_scaffold!(
        "resolver-attested",
        resolver_attested::ResolverAttested,
        resolver_attested::ResolverAttestedClient
    );
    check_scaffold!(
        "resolver-optimistic",
        resolver_optimistic::ResolverOptimistic,
        resolver_optimistic::ResolverOptimisticClient
    );
    check_scaffold!(
        "resolver-designated",
        resolver_designated::ResolverDesignated,
        resolver_designated::ResolverDesignatedClient
    );
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

    client.init(
        &k, &b, &fee, &resolver, &tier, &w_open, &w_lock, &w_resolve, &mu0, &sigma0, &usdc,
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
            &k, &b, &fee, &resolver, &tier, &w_open, &w_lock, &w_resolve, &mu0, &sigma0, &usdc
        )
        .is_err());
}
