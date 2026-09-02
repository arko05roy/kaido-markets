//! Sprint-0 smoke test: every scaffold contract registers in a fresh `Env`
//! and reports `scaffold_version() == 0`. This proves the contract crates link
//! and the workspace test harness runs; it is replaced by real lifecycle tests
//! in Sprint 2.

use soroban_sdk::Env;

macro_rules! check_scaffold {
    ($name:literal, $contract:path, $client:path) => {{
        let env = Env::default();
        let id = env.register($contract, ());
        let client = <$client>::new(&env, &id);
        assert_eq!(client.scaffold_version(), 0, "{} scaffold_version", $name);
    }};
}

#[test]
fn all_contracts_scaffold() {
    check_scaffold!(
        "market-factory",
        market_factory::MarketFactory,
        market_factory::MarketFactoryClient
    );
    check_scaffold!(
        "distribution-market",
        distribution_market::DistributionMarket,
        distribution_market::DistributionMarketClient
    );
    check_scaffold!(
        "house-vault",
        house_vault::HouseVault,
        house_vault::HouseVaultClient
    );
    check_scaffold!("registry", registry::Registry, registry::RegistryClient);
    check_scaffold!(
        "resolver-reflector",
        resolver_reflector::ResolverReflector,
        resolver_reflector::ResolverReflectorClient
    );
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
