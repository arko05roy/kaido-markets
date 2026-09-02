//! `house-vault` tests — deposit, cap-enforced seed, exposure ledger, and a
//! proportional withdrawal after the seeded market resolves.

use super::*;
use kaido_common::ResolverStatus;
use kaido_math::WAD;
use soroban_sdk::{
    contract as sc, contractimpl as sci, contracttype as sct,
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

#[sct]
#[derive(Clone)]
enum MockKey {
    S,
}
#[sc]
pub struct MockResolver;
#[sci]
impl MockResolver {
    pub fn set(env: Env, s: ResolverStatus) {
        env.storage().instance().set(&MockKey::S, &s);
    }
    pub fn resolve(env: Env) -> i128 {
        match env.storage().instance().get(&MockKey::S) {
            Some(ResolverStatus::Resolved(x)) => x,
            _ => panic!(),
        }
    }
    pub fn status(env: Env) -> ResolverStatus {
        env.storage()
            .instance()
            .get(&MockKey::S)
            .unwrap_or(ResolverStatus::Pending)
    }
}

fn make_market(env: &Env, resolver: &Address, usdc: &Address) -> Address {
    let id = env.register(distribution_market::DistributionMarket, ());
    let c = distribution_market::DistributionMarketClient::new(env, &id);
    c.init(
        &WAD,
        &(100 * WAD),
        &30u32,
        resolver,
        &0u32,
        &0u64,
        &10_000u64,
        &100_000u64,
        &(50 * WAD),
        &WAD,
        usdc,
    );
    id
}

#[test]
fn deposit_seed_cap_and_withdraw() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc = sac.address();
    let sa = token::StellarAssetClient::new(&env, &usdc);
    let tok = token::TokenClient::new(&env, &usdc);

    let vault_id = env.register(HouseVault, (admin.clone(), usdc.clone()));
    let vault = HouseVaultClient::new(&env, &vault_id);

    // fund the vault
    let funder = Address::generate(&env);
    sa.mint(&funder, &10_000_000_000i128);
    vault.deposit(&funder, &5_000_000_000i128);
    assert_eq!(tok.balance(&vault_id), 5_000_000_000i128);

    let resolver_id = env.register(MockResolver, ());
    let resolver = MockResolverClient::new(&env, &resolver_id);
    let market = make_market(&env, &resolver_id, &usdc);

    // cap = 200; seeding 150 is fine, then another 100 would exceed → reverts.
    let shares = vault.seed_market(&market, &1_500_000_000i128, &2_000_000_000i128);
    assert!(shares > 0);
    assert_eq!(vault.exposure(&market), 1_500_000_000i128);
    assert_eq!(tok.balance(&market), 1_500_000_000i128);
    assert!(vault
        .try_seed_market(&market, &1_000_000_000i128, &2_000_000_000i128)
        .is_err());

    // resolve the market then withdraw proportionally → USDC back to the vault.
    env.ledger().set_timestamp(100_001);
    resolver.set(&ResolverStatus::Resolved(50 * WAD));
    distribution_market::DistributionMarketClient::new(&env, &market).resolve();
    let back = vault.withdraw_proportional(&market, &shares);
    assert_eq!(back, 1_500_000_000i128);
    assert_eq!(vault.exposure(&market), 0);
    assert_eq!(tok.balance(&vault_id), 5_000_000_000i128);
}
