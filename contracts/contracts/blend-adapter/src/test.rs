//! Integration tests against a real Blend pool deployed via `BlendFixture`.

extern crate std;

use super::*;
use blend_contract_sdk::{
    pool,
    testutils::{default_reserve_config, BlendFixture},
};
use sep_40_oracle::testutils::{MockPriceOracleClient, MockPriceOracleWASM};
use soroban_sdk::{
    testutils::{Address as _, BytesN as _},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, String, Symbol,
};

const ORACLE_DP: u32 = 7;

fn setup_blend_pool(env: &Env) -> (Address, Address, Address) {
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
    oracle.set_data(&deployer, &base, &vec![env, usdc_asset], &ORACLE_DP, &60);
    oracle.set_price(&vec![env, 1_000_000_0i128], &0);

    let pool_id = blend.pool_factory.mock_all_auths().deploy(
        &deployer,
        &String::from_str(env, "kaido-test"),
        &BytesN::<32>::random(env),
        &oracle_id,
        &1_000_000, // 10% backstop take rate
        &4,
        &1_000_000, // $1 min collateral (7-dp oracle)
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

    // Seed pool liquidity after activation so borrows are possible.
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

    (pool_id, usdc, deployer)
}

#[test]
fn borrow_and_repay_round_trip() {
    let env = Env::default();
    env.mock_all_auths();
    let (blend_pool, usdc, admin) = setup_blend_pool(&env);

    let adapter_id = env.register(BlendAdapter, (admin.clone(), blend_pool, usdc.clone()));
    let adapter = BlendAdapterClient::new(&env, &adapter_id);

    let market = Address::generate(&env);
    adapter.authorize_market(&market, &100_000_000_000i128);

    let collateral_7dp = 10_000_000_000i128; // 1000 USDC
    let borrow_7dp = collateral_7dp / 2; // stay below 75% c_factor headroom

    StellarAssetClient::new(&env, &usdc).mint(&market, &collateral_7dp);
    TokenClient::new(&env, &usdc).transfer(&market, &adapter_id, &collateral_7dp);

    let borrowed = adapter.borrow_for_market(&market, &collateral_7dp, &borrow_7dp);
    assert_eq!(borrowed, borrow_7dp);
    assert_eq!(adapter.outstanding_debt(&market), borrow_7dp);
    assert!(adapter.available_depth(&market) > 0);

    // Market receives borrowed USDC.
    assert_eq!(TokenClient::new(&env, &usdc).balance(&market), borrow_7dp);

    // Repay from market.
    TokenClient::new(&env, &usdc).transfer(&market, &adapter_id, &borrow_7dp);
    let repaid = adapter.repay_for_market(&market, &borrow_7dp);
    assert_eq!(repaid, borrow_7dp);
    assert_eq!(adapter.outstanding_debt(&market), 0);
}

#[test]
fn unwind_after_borrow() {
    let env = Env::default();
    env.mock_all_auths();
    let (blend_pool, usdc, admin) = setup_blend_pool(&env);
    let adapter_id = env.register(BlendAdapter, (admin.clone(), blend_pool, usdc.clone()));
    let adapter = BlendAdapterClient::new(&env, &adapter_id);
    let market = Address::generate(&env);
    adapter.authorize_market(&market, &100_000_000_000i128);

    let collateral_7dp = 10_000_000_000i128;
    let borrow_7dp = collateral_7dp / 2;
    let fund = collateral_7dp + borrow_7dp;
    StellarAssetClient::new(&env, &usdc).mint(&market, &fund);
    TokenClient::new(&env, &usdc).transfer(&market, &adapter_id, &collateral_7dp);
    adapter.borrow_for_market(&market, &collateral_7dp, &borrow_7dp);

    TokenClient::new(&env, &usdc).transfer(&market, &adapter_id, &borrow_7dp);
    adapter.unwind_for_claim(&market);
    assert_eq!(adapter.outstanding_debt(&market), 0);
    assert!(TokenClient::new(&env, &usdc).balance(&market) >= collateral_7dp);
}

#[test]
fn rejects_unauthorized_market() {
    let env = Env::default();
    env.mock_all_auths();
    let (blend_pool, usdc, admin) = setup_blend_pool(&env);
    let adapter_id = env.register(BlendAdapter, (admin, blend_pool, usdc));
    let adapter = BlendAdapterClient::new(&env, &adapter_id);
    let market = Address::generate(&env);
    assert!(adapter
        .try_borrow_for_market(&market, &1_000_000i128, &500_000i128)
        .is_err());
}
