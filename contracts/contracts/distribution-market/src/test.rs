//! `distribution-market` tests: `init` happy path + validation branches
//! (Sprint 1), plus Sprint 2 — `trade`, `resolve` (via a tiny mock resolver),
//! `claim`, LP add/remove, σ-floor reject, and the disputable (stale-oracle)
//! path. USDC is a Stellar Asset Contract test token.

use super::*;
use kaido_common::{MarketWindow, ResolverStatus, ResolverTier};
use kaido_math::{lambda as lambda_of, sigma_floor, wdiv, wmul, WAD};
use soroban_sdk::{
    contract as sc, contractimpl as sci, contracttype as sct,
    testutils::{Address as _, Events, Ledger},
    token, Address, Env,
};

const K: i128 = WAD;
const B: i128 = 100 * WAD;
const FEE_BPS: u32 = 30;
const TIER: u32 = 0;
const W_OPEN: u64 = 0;
const W_LOCK: u64 = 10_000;
const W_RESOLVE: u64 = 100_000;
const MU0: i128 = 50 * WAD;
const SIGMA0: i128 = WAD;
const SQRT_2PI: i128 = 2_506_628_274_631_000_502;

// --- a minimal Resolver mock (implements the kaido_common::Resolver shape) ---
#[sct]
#[derive(Clone)]
enum MockKey {
    Status,
}
#[sc]
pub struct MockResolver;
#[sci]
impl MockResolver {
    pub fn set(env: Env, s: ResolverStatus) {
        env.storage().instance().set(&MockKey::Status, &s);
    }
    pub fn resolve(env: Env) -> i128 {
        match env.storage().instance().get(&MockKey::Status) {
            Some(ResolverStatus::Resolved(x)) => x,
            _ => panic!("not resolved"),
        }
    }
    pub fn status(env: Env) -> ResolverStatus {
        env.storage()
            .instance()
            .get(&MockKey::Status)
            .unwrap_or(ResolverStatus::Pending)
    }
}

struct Ctx {
    env: Env,
    market: DistributionMarketClient<'static>,
    resolver: MockResolverClient<'static>,
    usdc: Address,
    usdc_admin: token::StellarAssetClient<'static>,
    token: token::TokenClient<'static>,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc = sac.address();
    let resolver_id = env.register(MockResolver, ());
    let resolver = MockResolverClient::new(&env, &resolver_id);
    let id = env.register(DistributionMarket, ());
    let market = DistributionMarketClient::new(&env, &id);
    market.init(
        &K,
        &B,
        &FEE_BPS,
        &resolver_id,
        &TIER,
        &W_OPEN,
        &W_LOCK,
        &W_RESOLVE,
        &MU0,
        &SIGMA0,
        &usdc,
    );
    Ctx {
        usdc_admin: token::StellarAssetClient::new(&env, &usdc),
        token: token::TokenClient::new(&env, &usdc),
        env,
        market,
        resolver,
        usdc,
    }
}

fn expected_params(resolver: &Address) -> MarketParams {
    MarketParams {
        outcome_space: OutcomeSpace::Scalar,
        parameterization: Parameterization::Gaussian,
        capped: false,
        k: K,
        b: B,
        fee_bps: FEE_BPS,
        resolver: resolver.clone(),
        tier: ResolverTier::Reflector,
        window: MarketWindow {
            open: W_OPEN,
            lock: W_LOCK,
            resolve: W_RESOLVE,
        },
    }
}

#[test]
fn init_round_trip() {
    let c = setup();
    assert_eq!(c.market.get_params(), expected_params(&c.resolver.address));
    let st = c.market.get_state();
    assert_eq!(st.status, MarketStatus::Open);
    assert_eq!(st.belief.mu, MU0);
    assert_eq!(st.belief.lambda, lambda_of(K, SIGMA0));
    assert_eq!(st.sigma_min, sigma_floor(K, B));
    let peak = wdiv(st.belief.lambda, wmul(SIGMA0, SQRT_2PI));
    assert!(peak > 0 && peak <= B);
    assert_eq!(c.market.wad(), WAD);
}

#[test]
fn init_emits_event() {
    let c = setup();
    assert!(!c.env.events().all().events().is_empty());
}

#[test]
fn init_one_shot() {
    let c = setup();
    assert!(c
        .market
        .try_init(
            &K,
            &B,
            &FEE_BPS,
            &c.resolver.address,
            &TIER,
            &W_OPEN,
            &W_LOCK,
            &W_RESOLVE,
            &MU0,
            &SIGMA0,
            &c.usdc
        )
        .is_err());
}

#[test]
fn full_lifecycle_balances_conserve() {
    let c = setup();
    // an LP seeds the pool so the AMM side has collateral to pay winners.
    let lp = Address::generate(&c.env);
    c.usdc_admin.mint(&lp, &1_000_000_000i128);
    c.market.add_liquidity(&lp, &1_000_000_000i128);

    let trader = Address::generate(&c.env);
    c.usdc_admin.mint(&trader, &10_000_000_000i128); // 1000 USDC, 7dp
    let total_in = 11_000_000_000i128;

    let id = c
        .market
        .trade(&trader, &(60 * WAD), &(2 * WAD), &10_000_000_000i128);
    assert_eq!(id, 0);
    assert_eq!(c.market.get_state().belief.mu, 60 * WAD);

    c.env.ledger().set_timestamp(W_RESOLVE + 1);
    c.resolver.set(&ResolverStatus::Resolved(58 * WAD));
    c.market.resolve();
    assert!(matches!(
        c.market.get_state().status,
        MarketStatus::Resolved(_)
    ));

    let got = c.market.claim(&id);
    assert!(got >= 0);
    assert!(c.market.try_get_position(&id).is_err());
    // USDC conserves exactly: trader + lp(=0) + market-leftover == everything in.
    let total_out =
        c.token.balance(&trader) + c.token.balance(&lp) + c.token.balance(&c.market.address);
    assert_eq!(total_in, total_out);
}

#[test]
fn sub_floor_sigma_reverts() {
    let c = setup();
    let trader = Address::generate(&c.env);
    c.usdc_admin.mint(&trader, &10_000_000_000i128);
    assert!(c
        .market
        .try_trade(&trader, &(50 * WAD), &1_000i128, &10_000_000_000i128)
        .is_err());
}

#[test]
fn slippage_guard() {
    let c = setup();
    let trader = Address::generate(&c.env);
    c.usdc_admin.mint(&trader, &10_000_000_000i128);
    assert!(c
        .market
        .try_trade(&trader, &(60 * WAD), &(2 * WAD), &1i128)
        .is_err());
}

#[test]
fn stale_oracle_disputable() {
    let c = setup();
    c.env.ledger().set_timestamp(W_RESOLVE + 1);
    c.resolver.set(&ResolverStatus::Stale);
    c.market.resolve();
    assert_eq!(c.market.get_state().status, MarketStatus::Disputable);
    assert!(c.market.try_claim(&0).is_err());
}

#[test]
fn resolve_too_early_and_pending() {
    let c = setup();
    assert!(c.market.try_resolve().is_err());
    c.env.ledger().set_timestamp(W_RESOLVE + 1);
    c.resolver.set(&ResolverStatus::Pending);
    assert!(c.market.try_resolve().is_err());
}

#[test]
fn lp_add_and_remove() {
    let c = setup();
    let lp = Address::generate(&c.env);
    c.usdc_admin.mint(&lp, &5_000_000_000i128);
    let shares = c.market.add_liquidity(&lp, &1_000_000_000i128);
    assert!(shares > 0);
    assert_eq!(c.market.lp_shares(&lp), shares);
    assert_eq!(c.token.balance(&c.market.address), 1_000_000_000i128);

    assert!(c.market.try_remove_liquidity(&lp, &shares).is_err());

    c.env.ledger().set_timestamp(W_RESOLVE + 1);
    c.resolver.set(&ResolverStatus::Resolved(50 * WAD));
    c.market.resolve();
    let out = c.market.remove_liquidity(&lp, &shares);
    assert_eq!(out, 1_000_000_000i128);
    assert_eq!(c.market.lp_shares(&lp), 0);
}

#[test]
fn rejects_bad_params() {
    let c = setup();
    let fresh = || {
        let id = c.env.register(DistributionMarket, ());
        DistributionMarketClient::new(&c.env, &id)
    };
    assert!(fresh()
        .try_init(
            &K,
            &B,
            &FEE_BPS,
            &c.resolver.address,
            &4u32,
            &W_OPEN,
            &W_LOCK,
            &W_RESOLVE,
            &MU0,
            &SIGMA0,
            &c.usdc
        )
        .is_err());
    assert!(fresh()
        .try_init(
            &K,
            &B,
            &FEE_BPS,
            &c.resolver.address,
            &TIER,
            &0u64,
            &100_000u64,
            &10_000u64,
            &MU0,
            &SIGMA0,
            &c.usdc
        )
        .is_err());
    assert!(fresh()
        .try_init(
            &K,
            &B,
            &FEE_BPS,
            &c.resolver.address,
            &TIER,
            &W_OPEN,
            &W_LOCK,
            &W_RESOLVE,
            &MU0,
            &1_000i128,
            &c.usdc
        )
        .is_err());
}

#[test]
fn gas_snapshot() {
    let c = setup();
    let trader = Address::generate(&c.env);
    c.usdc_admin.mint(&trader, &10_000_000_000i128);
    let _ = c
        .market
        .trade(&trader, &(55 * WAD), &(WAD + WAD / 2), &10_000_000_000i128);
    let _ = c.market.get_state();
}
