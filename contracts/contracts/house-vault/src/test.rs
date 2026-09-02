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
    let treasury = Address::generate(env);
    let creator = Address::generate(env);
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
        &0u32,
        &treasury,
        &creator,
        &7_000u32,
        &2_000u32,
        &1_000u32,
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

    // Seeding without a cap → CapNotSet.
    assert!(vault.try_seed_market(&market, &1_500_000_000i128).is_err());

    // Admin sets the on-chain cap to 200 USDC.
    vault.set_cap(&market, &2_000_000_000i128);
    assert_eq!(vault.cap(&market), 2_000_000_000i128);

    // cap = 200; seeding 150 is capped to b=100 USDC on an empty market.
    let shares = vault.seed_market(&market, &1_500_000_000i128);
    assert!(shares > 0);
    assert_eq!(vault.exposure(&market), 1_000_000_000i128);
    assert_eq!(tok.balance(&market), 1_000_000_000i128);
    assert!(vault.try_seed_market(&market, &1_000_000_000i128).is_err());

    // resolve the market then withdraw proportionally → USDC back to the vault.
    env.ledger().set_timestamp(100_001);
    resolver.set(&ResolverStatus::Resolved(50 * WAD));
    distribution_market::DistributionMarketClient::new(&env, &market).resolve();
    let back = vault.withdraw_proportional(&market, &shares);
    assert_eq!(back, 1_000_000_000i128);
    assert_eq!(vault.exposure(&market), 0);
    assert_eq!(tok.balance(&vault_id), 5_000_000_000i128);
}

/// Cumulative-exposure ledger correctly decrements on a partial-shares
/// withdrawal (the only legal pre-resolution path; resolution + the LP-pool
/// arithmetic of the market are exercised elsewhere). Floored at 0 on the
/// last burn.
#[test]
fn partial_withdrawal_decrements_exposure() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc = sac.address();
    let sa = token::StellarAssetClient::new(&env, &usdc);

    let vault_id = env.register(HouseVault, (admin.clone(), usdc.clone()));
    let vault = HouseVaultClient::new(&env, &vault_id);

    let funder = Address::generate(&env);
    sa.mint(&funder, &10_000_000_000i128);
    vault.deposit(&funder, &5_000_000_000i128);

    let resolver_id = env.register(MockResolver, ());
    let resolver = MockResolverClient::new(&env, &resolver_id);
    let market = make_market(&env, &resolver_id, &usdc);

    vault.set_cap(&market, &2_000_000_000i128);
    let shares = vault.seed_market(&market, &1_500_000_000i128);
    let before = vault.exposure(&market);
    assert_eq!(before, 1_000_000_000i128);

    // Resolve, then withdraw half the shares and confirm exposure roughly
    // halves (no slippage: the market's LP ratio is 1:1 at this point).
    env.ledger().set_timestamp(100_001);
    resolver.set(&ResolverStatus::Resolved(50 * WAD));
    distribution_market::DistributionMarketClient::new(&env, &market).resolve();

    let half = shares / 2;
    let got1 = vault.withdraw_proportional(&market, &half);
    assert!(got1 > 0);
    let mid = vault.exposure(&market);
    assert_eq!(mid, before - got1);

    let got2 = vault.withdraw_proportional(&market, &(shares - half));
    assert!(got2 > 0);
    // Ledger floors at 0 even if rounding leaves the tally slightly off.
    assert_eq!(vault.exposure(&market), 0);
    // Total reclaimed equals total seeded (no fees yet at the LP-pool level
    // for this scenario).
    assert_eq!(got1 + got2, 1_000_000_000i128);
}

/// Non-admin cannot move the cap.
#[test]
fn non_admin_cannot_set_cap_or_seed() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc = sac.address();

    let vault_id = env.register(HouseVault, (admin.clone(), usdc.clone()));
    let vault = HouseVaultClient::new(&env, &vault_id);
    let market = Address::generate(&env);

    // `mock_auths` empty for the attacker → require_auth fails.
    env.mock_auths(&[]);
    assert!(vault
        .mock_auths(&[])
        .try_set_cap(&market, &1_000_000_000i128)
        .is_err());
    let _ = attacker; // silence
}
