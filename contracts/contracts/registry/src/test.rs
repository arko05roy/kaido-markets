use super::*;
use kaido_common::{MarketWindow, OutcomeSpace, Parameterization, ResolverTier};
use soroban_sdk::{testutils::Address as _, Env};

fn info(market: &Address, creator: &Address, resolver: &Address) -> MarketInfo {
    MarketInfo {
        market: market.clone(),
        outcome_space: OutcomeSpace::Scalar,
        parameterization: Parameterization::Gaussian,
        capped: false,
        resolver: resolver.clone(),
        tier: ResolverTier::Reflector,
        window: MarketWindow {
            open: 0,
            lock: 100,
            resolve: 200,
        },
        creator: creator.clone(),
    }
}

fn boot() -> (Env, RegistryClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let id = env.register(Registry, (admin, factory.clone()));
    let client = RegistryClient::new(&env, &id);
    (env, client, factory)
}

#[test]
fn register_and_query() {
    let (env, reg, _factory) = boot();
    assert_eq!(reg.count(), 0);
    let creator = Address::generate(&env);
    let resolver = Address::generate(&env);
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    reg.register(&info(&m1, &creator, &resolver));
    reg.register(&info(&m2, &creator, &resolver));
    assert_eq!(reg.count(), 2);
    assert_eq!(reg.all(), soroban_sdk::vec![&env, m1.clone(), m2.clone()]);
    assert_eq!(reg.page(&1, &10), soroban_sdk::vec![&env, m2.clone()]);
    assert_eq!(reg.page(&5, &10).len(), 0);
    assert_eq!(reg.get(&m1).market, m1);
    assert_eq!(reg.get(&m2).creator, creator);
}

#[test]
#[should_panic]
fn duplicate_registration_rejected() {
    let (env, reg, _f) = boot();
    let c = Address::generate(&env);
    let r = Address::generate(&env);
    let m = Address::generate(&env);
    reg.register(&info(&m, &c, &r));
    reg.register(&info(&m, &c, &r));
}

#[test]
fn admin_can_rotate_factory() {
    let (env, reg, factory) = boot();
    assert_eq!(reg.factory(), factory);
    let new_factory = Address::generate(&env);
    reg.set_factory(&new_factory);
    assert_eq!(reg.factory(), new_factory);
}
