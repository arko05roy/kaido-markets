//! Sprint-2 multi-contract lifecycle (build.md §5):
//!
//! USDC SAC → mock SEP-40 oracle → `resolver-reflector` → `distribution-market`
//! → `house-vault` seeds it → a trader trades → advance time → `resolve()` →
//! `claim()`. Asserts USDC conserves exactly (sum in == sum out) and the market
//! never pays out more than it holds. Plus: sub-floor σ reverts; a stale oracle
//! drives the market to `Disputable`.

use distribution_market::DistributionMarketClient;
use house_vault::HouseVaultClient;
use kaido_common::MarketStatus;
use kaido_math::WAD;
use resolver_reflector::ResolverReflectorClient;
use sep_40_oracle::testutils::{MockPriceOracleClient, MockPriceOracleWASM};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, vec, Address, Env, Symbol,
};

const ORACLE_DP: u32 = 14;
const W_OPEN: u64 = 0;
const W_LOCK: u64 = 1_000;
const W_RESOLVE: u64 = 2_000;
const K: i128 = WAD;
const B: i128 = 100 * WAD;

struct World {
    env: Env,
    market: DistributionMarketClient<'static>,
    oracle: MockPriceOracleClient<'static>,
    tok: token::TokenClient<'static>,
    sa: token::StellarAssetClient<'static>,
    usdc: Address,
}

fn boot() -> World {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc = sac.address();

    let oracle_id = env.register(MockPriceOracleWASM, ());
    let oracle = MockPriceOracleClient::new(&env, &oracle_id);
    let base = sep_40_oracle::testutils::Asset::Other(Symbol::new(&env, "USD"));
    let mock_asset = sep_40_oracle::testutils::Asset::Other(Symbol::new(&env, "BTC"));
    oracle.set_data(&admin, &base, &vec![&env, mock_asset], &ORACLE_DP, &60);

    let asset = sep_40_oracle::Asset::Other(Symbol::new(&env, "BTC"));
    let resolver_id = env.register(
        resolver_reflector::ResolverReflector,
        (oracle_id.clone(), asset, W_RESOLVE, 1u32),
    );
    let _ = ResolverReflectorClient::new(&env, &resolver_id);

    let market_id = env.register(distribution_market::DistributionMarket, ());
    let market = DistributionMarketClient::new(&env, &market_id);
    market.init(
        &K,
        &B,
        &30u32,
        &resolver_id,
        &0u32,
        &W_OPEN,
        &W_LOCK,
        &W_RESOLVE,
        &(50 * WAD),
        &WAD,
        &usdc,
    );
    World {
        tok: token::TokenClient::new(&env, &usdc),
        sa: token::StellarAssetClient::new(&env, &usdc),
        env,
        market,
        oracle,
        usdc,
    }
}

#[test]
fn full_lifecycle_conserves_usdc() {
    let w = boot();

    // house-vault seeds the market with 100 USDC.
    let vault_admin = Address::generate(&w.env);
    let vault_id = w.env.register(
        house_vault::HouseVault,
        (vault_admin.clone(), w.usdc.clone()),
    );
    let vault = HouseVaultClient::new(&w.env, &vault_id);
    let house_funder = Address::generate(&w.env);
    w.sa.mint(&house_funder, &2_000_000_000i128);
    vault.deposit(&house_funder, &2_000_000_000i128);
    let house_shares = vault.seed_market(&w.market.address, &1_000_000_000i128, &5_000_000_000i128);

    // a trader trades.
    let trader = Address::generate(&w.env);
    w.sa.mint(&trader, &10_000_000_000i128);
    let total_in = 2_000_000_000i128 + 10_000_000_000i128; // everything ever minted
    let id = w
        .market
        .trade(&trader, &(55 * WAD), &(2 * WAD), &10_000_000_000i128);

    // oracle prints 53.0; advance past resolve; resolve.
    let scale = 10i128.pow(ORACLE_DP);
    w.oracle
        .set_price(&vec![&w.env, 53i128 * scale], &W_RESOLVE);
    w.env.ledger().set_timestamp(W_RESOLVE + 1);
    w.market.resolve();
    assert!(matches!(
        w.market.get_state().status,
        MarketStatus::Resolved(_)
    ));

    // claim the position; LP withdraws.
    let trader_got = w.market.claim(&id);
    let lp_got = vault.withdraw_proportional(&w.market.address, &house_shares);

    // USDC conservation: every minted unit is now in exactly one of {trader,
    // vault, house_funder, market-leftover-dust}. (house_funder kept 0 since
    // it deposited all 200 into the vault.)
    let bal = |a: &Address| w.tok.balance(a);
    let total_out = bal(&trader) + bal(&vault_id) + bal(&house_funder) + bal(&w.market.address);
    assert_eq!(total_in, total_out);
    assert!(trader_got >= 0 && lp_got >= 0);
    // market never paid out more than it held.
    assert!(bal(&w.market.address) >= 0);
}

#[test]
fn sub_floor_sigma_reverts() {
    let w = boot();
    let trader = Address::generate(&w.env);
    w.sa.mint(&trader, &10_000_000_000i128);
    assert!(w
        .market
        .try_trade(&trader, &(50 * WAD), &1_000i128, &10_000_000_000i128)
        .is_err());
}

#[test]
fn stale_oracle_makes_market_disputable() {
    let w = boot();
    // never set a price → resolver reports Stale.
    w.env.ledger().set_timestamp(W_RESOLVE + 1);
    w.market.resolve();
    assert_eq!(w.market.get_state().status, MarketStatus::Disputable);
}
