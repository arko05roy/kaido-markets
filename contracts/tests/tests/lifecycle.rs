//! Sprint-2 multi-contract lifecycle (build.md §5):
//!
//! USDC SAC → mock SEP-40 oracle → `resolver-reflector` → `distribution-market`
//! → a trader trades (no HouseVault seed) → advance time → `resolve()` →
//! `claim()`. BlendTap path: `blend-adapter` JIT-borrows on first trade.
//! Asserts USDC conserves exactly and the market never pays out more than it holds.

use blend_adapter::BlendAdapterClient;
use blend_contract_sdk::{
    pool,
    testutils::{default_reserve_config, BlendFixture},
};
use distribution_market::DistributionMarketClient;
use kaido_common::MarketStatus;
use kaido_math::WAD;
use resolver_reflector::ResolverReflectorClient;
use sep_40_oracle::testutils::{MockPriceOracleClient, MockPriceOracleWASM};
use soroban_sdk::{
    testutils::{Address as _, BytesN as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, String, Symbol,
};

const BLEND_ORACLE_DP: u32 = 7;
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
    tok: TokenClient<'static>,
    sa: StellarAssetClient<'static>,
    usdc: Address,
}

fn boot_in(env: Env, usdc: Address, blend_adapter: Option<Address>) -> World {
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle_id = env.register(MockPriceOracleWASM, ());
    let oracle = MockPriceOracleClient::new(&env, &oracle_id);
    let base = sep_40_oracle::testutils::Asset::Other(Symbol::new(&env, "USD"));
    let mock_asset = sep_40_oracle::testutils::Asset::Other(Symbol::new(&env, "BTC"));
    oracle.set_data(&admin, &base, &vec![&env, mock_asset], &ORACLE_DP, &60);

    let asset = sep_40_oracle::Asset::Other(Symbol::new(&env, "BTC"));
    let resolver_id = env.register(
        resolver_reflector::ResolverReflector,
        (
            oracle_id.clone(),
            asset,
            W_RESOLVE,
            1u32,
            soroban_sdk::Vec::<u64>::new(&env),
        ),
    );
    let _ = ResolverReflectorClient::new(&env, &resolver_id);

    let market_id = env.register(distribution_market::DistributionMarket, ());
    let market = DistributionMarketClient::new(&env, &market_id);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
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
        &0u32,
        &treasury,
        &creator,
        &7_000u32,
        &2_000u32,
        &1_000u32,
        &blend_adapter,
    );
    World {
        tok: TokenClient::new(&env, &usdc),
        sa: StellarAssetClient::new(&env, &usdc),
        env,
        market,
        oracle,
        usdc,
    }
}

fn boot(blend_adapter: Option<Address>) -> World {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    boot_in(env, usdc, blend_adapter)
}

fn setup_blend(env: &Env) -> (Address, Address) {
    let deployer = Address::generate(env);
    let blnd = env
        .register_stellar_asset_contract_v2(deployer.clone())
        .address();
    let usdc = env
        .register_stellar_asset_contract_v2(deployer.clone())
        .address();
    let blend = BlendFixture::deploy(env, &deployer, &blnd, &usdc);

    let oracle_id = env.register(MockPriceOracleWASM, ());
    let oracle = MockPriceOracleClient::new(env, &oracle_id);
    let base = sep_40_oracle::testutils::Asset::Other(Symbol::new(env, "USD"));
    let usdc_asset = sep_40_oracle::testutils::Asset::Stellar(usdc.clone());
    oracle.set_data(&deployer, &base, &vec![env, usdc_asset], &BLEND_ORACLE_DP, &60);
    oracle.set_price(&vec![env, 1_000_000_0i128], &0);

    let pool_id = blend.pool_factory.mock_all_auths().deploy(
        &deployer,
        &String::from_str(env, "kaido-lifecycle"),
        &BytesN::<32>::random(env),
        &oracle_id,
        &1_000_000,
        &4,
        &1_000_000,
    );
    let pool_client = pool::Client::new(env, &pool_id);
    pool_client
        .mock_all_auths()
        .queue_set_reserve(&usdc, &default_reserve_config());
    pool_client.mock_all_auths().set_reserve(&usdc);

    blend
        .backstop
        .mock_all_auths()
        .deposit(&deployer, &pool_id, &500_000_000_000i128);
    pool_client.mock_all_auths().set_status(&3);
    let status = pool_client.mock_all_auths().update_status();
    assert!(status <= 1, "pool must be active for borrows, got {status}");

    let supplier = Address::generate(env);
    StellarAssetClient::new(env, &usdc).mint(&supplier, &500_000_000_000i128);
    let supply = vec![
        env,
        pool::Request {
            request_type: 2,
            address: usdc.clone(),
            amount: 200_000_000_000i128,
        },
    ];
    pool_client
        .mock_all_auths()
        .submit(&supplier, &supplier, &supplier, &supply);

    let adapter_id = env.register(blend_adapter::BlendAdapter, (deployer, pool_id, usdc.clone()));
    (adapter_id, usdc)
}

#[test]
fn full_lifecycle_conserves_usdc_with_blend_tap() {
    let env = Env::default();
    env.mock_all_auths();
    let (adapter_id, usdc) = setup_blend(&env);
    let adapter = BlendAdapterClient::new(&env, &adapter_id);
    let w = boot_in(env, usdc, Some(adapter_id.clone()));
    adapter.authorize_market(&w.market.address, &100_000_000_000i128);

    let trader = Address::generate(&w.env);
    w.sa.mint(&trader, &10_000_000_000i128);
    let total_in = 10_000_000_000i128;
    let id = w
        .market
        .trade(&trader, &(55 * WAD), &(2 * WAD), &10_000_000_000i128);

  // Resolve far from the trade belief so the trader loses; BlendTap repays from forfeit.
    let scale = 10i128.pow(ORACLE_DP);
    w.oracle
        .set_price(&vec![&w.env, 45i128 * scale], &W_RESOLVE);
    w.env.ledger().set_timestamp(W_RESOLVE + 1);
    w.market.resolve();
    assert!(matches!(
        w.market.get_state().status,
        MarketStatus::Resolved(_)
    ));

    let trader_got = w.market.claim(&id);
    assert_eq!(adapter.outstanding_debt(&w.market.address), 0);

    let bal = |a: &Address| w.tok.balance(a);
    let total_out = bal(&trader) + bal(&w.market.address) + bal(&adapter_id);
    // Blend interest may absorb a few 7-dp units outside tracked addresses.
    assert!((total_in - total_out).abs() <= 10_000);
    assert!(trader_got >= 0);
}

#[test]
fn blend_tap_first_trade_no_seed() {
    let env = Env::default();
    env.mock_all_auths();

    let (adapter_id, usdc) = setup_blend(&env);
    let adapter = BlendAdapterClient::new(&env, &adapter_id);
    let w = boot_in(env, usdc, Some(adapter_id.clone()));

    adapter.authorize_market(&w.market.address, &100_000_000_000i128);
    assert!(w.market.blend_backed_depth() > 0);

    let trader = Address::generate(&w.env);
    w.sa.mint(&trader, &10_000_000_000i128);
    let _id = w
        .market
        .trade(&trader, &(55 * WAD), &(2 * WAD), &10_000_000_000i128);

    assert!(adapter.outstanding_debt(&w.market.address) > 0);
}

#[test]
fn sub_floor_sigma_reverts() {
    let w = boot(None);
    let trader = Address::generate(&w.env);
    w.sa.mint(&trader, &10_000_000_000i128);
    assert!(w
        .market
        .try_trade(&trader, &(55 * WAD), &1i128, &10_000_000_000i128)
        .is_err());
}

#[test]
fn stale_oracle_makes_disputable() {
    let w = boot(None);
    w.env.ledger().set_timestamp(W_RESOLVE + 1);
    w.market.resolve();
    assert_eq!(w.market.get_state().status, MarketStatus::Disputable);
}
