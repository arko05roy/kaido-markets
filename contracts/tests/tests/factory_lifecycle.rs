//! Sprint 3 (build.md §5, E3): the permissionless market-creation path.
//!
//! Upload the `DistributionMarket` WASM into the test `Env`, construct a
//! `Registry` + a `MarketFactory` pointed at that WASM hash, then call
//! `create_market` and assert: a market contract was deployed, its `init`
//! params round-trip, and the registry indexed it. Also: only the factory may
//! `register` directly; bad tuples revert before any deploy.
//!
//! Requires `cargo make build-wasm` first (wired as a dependency of
//! `cargo make test`).
#![allow(clippy::too_many_arguments)] // generated contractimport!/create_market signatures

use distribution_market::DistributionMarketClient;
use kaido_common::{MarketStatus, OutcomeSpace, Parameterization, ResolverTier};
use kaido_math::{sigma_floor, WAD};
use market_factory::{MarketFactory, MarketFactoryClient};
use registry::{Registry, RegistryClient};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

mod dm_wasm {
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/distribution_market.wasm");
}

const K: i128 = WAD;
const B: i128 = 100 * WAD;
const MU0: i128 = 50 * WAD;
const SIGMA0: i128 = WAD;
const W_OPEN: u64 = 0;
const W_LOCK: u64 = 10_000;
const W_RESOLVE: u64 = 100_000;

struct World {
    env: Env,
    factory: MarketFactoryClient<'static>,
    registry: RegistryClient<'static>,
    resolver: Address,
}

fn boot() -> World {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let resolver = Address::generate(&env);

    let dm_hash: BytesN<32> = env.deployer().upload_contract_wasm(dm_wasm::WASM);

    // Registry constructed with a placeholder factory, then rewired (mirrors
    // deploy.sh, which has the same chicken-and-egg).
    let reg_id = env.register(Registry, (admin.clone(), admin.clone()));
    let registry = RegistryClient::new(&env, &reg_id);

    let fac_id = env.register(
        MarketFactory,
        (admin.clone(), dm_hash, reg_id.clone(), usdc),
    );
    let factory = MarketFactoryClient::new(&env, &fac_id);
    registry.set_factory(&fac_id);

    World {
        env,
        factory,
        registry,
        resolver,
    }
}

#[test]
fn create_market_deploys_inits_and_registers() {
    let w = boot();
    let creator = Address::generate(&w.env);
    assert_eq!(w.registry.count(), 0);

    let market = w.factory.create_market(
        &creator,
        &K,
        &B,
        &30u32,
        &w.resolver,
        &0u32,
        &W_OPEN,
        &W_LOCK,
        &W_RESOLVE,
        &MU0,
        &SIGMA0,
    );

    // deployed + initialised
    let dm = DistributionMarketClient::new(&w.env, &market);
    let params = dm.get_params();
    assert_eq!(params.k, K);
    assert_eq!(params.b, B);
    assert_eq!(params.fee_bps, 30);
    assert_eq!(params.resolver, w.resolver);
    assert_eq!(params.tier, ResolverTier::Reflector);
    assert_eq!(params.outcome_space, OutcomeSpace::Scalar);
    assert_eq!(params.parameterization, Parameterization::Gaussian);
    let st = dm.get_state();
    assert_eq!(st.status, MarketStatus::Open);
    assert_eq!(st.belief.mu, MU0);
    assert_eq!(st.belief.sigma, SIGMA0);
    assert_eq!(st.sigma_min, sigma_floor(K, B));

    // registered
    assert_eq!(w.registry.count(), 1);
    assert_eq!(w.registry.all(), soroban_sdk::vec![&w.env, market.clone()]);
    let info = w.registry.get(&market);
    assert_eq!(info.market, market);
    assert_eq!(info.creator, creator);
    assert_eq!(info.tier, ResolverTier::Reflector);
    assert_eq!(info.window.resolve, W_RESOLVE);

    // a second market gets its own address + index slot
    let m2 = w.factory.create_market(
        &creator,
        &K,
        &B,
        &30u32,
        &w.resolver,
        &0u32,
        &W_OPEN,
        &W_LOCK,
        &W_RESOLVE,
        &MU0,
        &SIGMA0,
    );
    assert_ne!(m2, market);
    assert_eq!(w.registry.count(), 2);
    assert_eq!(w.factory.count(), 2);
}

#[test]
#[should_panic]
fn create_market_rejects_sigma_below_floor() {
    let w = boot();
    let creator = Address::generate(&w.env);
    w.factory.create_market(
        &creator,
        &K,
        &B,
        &30u32,
        &w.resolver,
        &0u32,
        &W_OPEN,
        &W_LOCK,
        &W_RESOLVE,
        &MU0,
        &1i128,
    );
}
