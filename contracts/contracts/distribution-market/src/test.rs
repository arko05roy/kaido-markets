//! `distribution-market` tests: `init` happy path + validation branches
//! (Sprint 1), plus Sprint 2 — `trade`, `resolve` (via a tiny mock resolver),
//! `claim`, LP add/remove, σ-floor reject, and the disputable (stale-oracle)
//! path. USDC is a Stellar Asset Contract test token.

extern crate std;

use super::*;
use kaido_common::{MarketWindow, ResolverStatus, ResolverTier};
use kaido_math::{lambda as lambda_of, sigma_floor, wdiv, wmul, worst_case_collateral, WAD};
use proptest::prelude::*;
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

/// Extra `init` / `try_init` tail args (uncapped, default fee split).
fn init_tail(env: &Env, _usdc: &Address) -> (u32, Address, Address, u32, u32, u32) {
    (
        0,
        Address::generate(env),
        Address::generate(env),
        7_000,
        2_000,
        1_000,
    )
}

/// LP scale `y` (WAD) to deposit `amount_7dp` USDC when free collateral is `B`.
fn lp_scale_for_amount(amount_7dp: i128) -> i128 {
    let amount_wad = amount_7dp * MONEY_SCALE;
    kaido_math::mul_div(amount_wad, WAD, B).min(WAD).max(1)
}

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
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
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
        &0u32,
        &treasury,
        &creator,
        &7_000u32,
        &2_000u32,
        &1_000u32,
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
    let (cap, tre, cre, flp, ftr, fcr) = init_tail(&c.env, &c.usdc);
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
            &c.usdc,
            &cap,
            &tre,
            &cre,
            &flp,
            &ftr,
            &fcr,
        )
        .is_err());
}

#[test]
fn full_lifecycle_balances_conserve() {
    let c = setup();
    // an LP seeds the pool so the AMM side has collateral to pay winners.
    let lp = Address::generate(&c.env);
    c.usdc_admin.mint(&lp, &1_000_000_000i128);
    c.market.add_liquidity(&lp, &lp_scale_for_amount(1_000_000_000i128));

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
    let shares = c.market.add_liquidity(&lp, &lp_scale_for_amount(1_000_000_000i128));
    assert!(shares > 0);
    assert_eq!(c.market.lp_shares(&lp), shares);
    assert_eq!(c.token.balance(&c.market.address), 1_000_000_000i128);

    assert!(c.market.try_remove_liquidity(&lp, &shares).is_ok());
    // re-add for the resolve path below
    c.usdc_admin.mint(&lp, &5_000_000_000i128);
    let shares2 = c.market.add_liquidity(&lp, &lp_scale_for_amount(1_000_000_000i128));
    assert!(shares2 > 0);

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
    let (cap, tre, cre, flp, ftr, fcr) = init_tail(&c.env, &c.usdc);
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
            &c.usdc,
            &cap,
            &tre,
            &cre,
            &flp,
            &ftr,
            &fcr,
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
            &c.usdc,
            &cap,
            &tre,
            &cre,
            &flp,
            &ftr,
            &fcr,
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
            &c.usdc,
            &cap,
            &tre,
            &cre,
            &flp,
            &ftr,
            &fcr,
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

// --------------------------------------------------------------------------- //
// Property tests — random `trade` / `add_liquidity` sequences must preserve the
// AMM invariants (build.md §4 / §5 Sprint 2 acceptance, §6 item 2):
//   * the live payout curve never exceeds collateral:  max_x f(x) = peak ≤ b;
//   * every position's posted collateral is ≥ 0 and equals the contract's own
//     `worst_case_collateral` of (g, f);
//   * collateral posted ≥ realised loss at *any* resolution point — i.e. every
//     `claim` returns ≥ 0 for an arbitrary x₀;
//   * USDC is conserved exactly across the whole lifecycle (no value minted or
//     burned by the AMM): Σ deposits in == Σ payouts + leftover.
//
// Each case spins a fresh `Env` (expensive), so the case count is modest; the
// nightly fuzz lane (build.md §6 item 3, Sprint 4) will push much harder and
// also diff `worst_case_collateral` against a brute-force grid oracle.
// --------------------------------------------------------------------------- //

const MONEY: i128 = MONEY_SCALE; // WAD-per-7dp (=1e11)

/// One trade in a generated sequence: a center near [40,60]·WAD and a width in
/// [σ_min, 6·WAD]. (Out-of-envelope picks — e.g. a peak > b — are simply skipped
/// when `try_trade` rejects them; that's a valid outcome, not a failure.)
fn trade_strategy() -> impl Strategy<Value = (i128, i128)> {
    (40i128..=60i128, 1i128..=6000i128)
        .prop_map(|(mu_units, sigma_milli)| (mu_units * WAD, (sigma_milli * WAD) / 1000))
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]

    #[test]
    fn random_trade_sequences_preserve_invariants(
        trades in proptest::collection::vec(trade_strategy(), 1..=6),
        x0_units in 25i128..=75i128,
    ) {
        let c = setup();
        let sigma_min: i128 = c.market.get_state().sigma_min;

        // Seed the full free collateral pool (b = 100 USDC).
        let lp = Address::generate(&c.env);
        let lp_deposit_7dp = B / MONEY_SCALE;
        c.usdc_admin.mint(&lp, &lp_deposit_7dp);
        c.market.add_liquidity(&lp, &WAD);

        let mint: i128 = 50_000_000_000; // 5000 USDC, 7dp — generous, per trader
        let mut total_in: i128 = lp_deposit_7dp;
        let mut traders: std::vec::Vec<Address> = std::vec::Vec::new();
        let mut ids: std::vec::Vec<u64> = std::vec::Vec::new();

        for (mu2, sigma2) in trades {
            // belief just before this trade — used to check the collateral the
            // contract will store matches its own `worst_case_collateral`.
            let f = c.market.get_state().belief;
            let trader = Address::generate(&c.env);
            c.usdc_admin.mint(&trader, &mint);
            total_in += mint; // minted into existence — counted whether or not the trade lands
            traders.push(trader.clone());
            // a rejected trade (PeakExceedsB / SigmaBelowFloor / SlippageExceeded
            // / …) is a legitimate outcome — just don't count it.
            if let Ok(Ok(id)) = c.market.try_trade(&trader, &mu2, &sigma2, &mint) {
                // invariant: σ ≥ σ_min must have held.
                prop_assert!(sigma2 >= sigma_min);
                // invariant: live curve peak ≤ b.
                let st = c.market.get_state();
                let peak = wdiv(st.belief.lambda, wmul(st.belief.sigma, SQRT_2PI));
                prop_assert!(peak <= B, "peak {} > b {}", peak, B);
                // the stored position's collateral is ≥ 0, equals the contract's
                // own `worst_case_collateral(g, f)` up to ≤ 1 money-unit of 7-dp
                // rounding, and the trader was actually debited at least `wc`
                // worth of USDC (collateral posted ≥ realised loss).
                let pos = c.market.get_position(&id);
                prop_assert!(pos.collateral >= 0);
                let g = st.belief;
                let wc =
                    worst_case_collateral((g.mu, g.sigma, g.lambda), (f.mu, f.sigma, f.lambda));
                prop_assert!(
                    (pos.collateral - wc).abs() < MONEY,
                    "collateral {} vs wc {}",
                    pos.collateral,
                    wc
                );
                let debit_7dp = mint - c.token.balance(&trader);
                prop_assert!(
                    debit_7dp * MONEY >= wc,
                    "debited {} (wad {}) < wc {}",
                    debit_7dp,
                    debit_7dp * MONEY,
                    wc
                );
                ids.push(id);
            }
        }

        // resolve at an arbitrary outcome and claim everything.
        c.env.ledger().set_timestamp(W_RESOLVE + 1);
        c.resolver.set(&ResolverStatus::Resolved(x0_units * WAD));
        c.market.resolve();
        prop_assert!(matches!(c.market.get_state().status, MarketStatus::Resolved(_)));

        for &id in &ids {
            let got = c.market.claim(&id);
            // collateral posted ≥ realised loss  ⇔  payout never negative.
            prop_assert!(got >= 0, "negative claim {} for position {}", got, id);
        }
        // LPs withdraw whatever remains (already in `lp` wallet — don't add `lp_out` twice).
        let _lp_out = c.market.remove_liquidity(&lp, &c.market.lp_shares(&lp));

        // USDC conserved exactly: everything that came in is now sitting in some
        // trader's balance, the LP's balance, or (rounding dust / fees) the
        // contract itself — nothing minted, nothing burned.
        let mut total_out: i128 = c.token.balance(&lp) + c.token.balance(&c.market.address);
        for t in &traders {
            total_out += c.token.balance(t);
        }
        prop_assert_eq!(total_in, total_out);
        // and the contract never went negative on the way (SAC would have
        // trapped, but assert the end state is sane).
        prop_assert!(c.token.balance(&c.market.address) >= 0);
    }
}

// --------------------------------------------------------------------------- //
// Trajectory markets (ADR-4) — N independent per-checkpoint Gaussians sharing
// one collateral pool.
// --------------------------------------------------------------------------- //
mod trajectory {
    use super::*;
    use soroban_sdk::vec as svec;

    fn setup_traj(n: u32) -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc = sac.address();
        let resolver_id = env.register(MockResolver, ());
        let resolver = MockResolverClient::new(&env, &resolver_id);
        let id = env.register(DistributionMarket, ());
        let market = DistributionMarketClient::new(&env, &id);
        let mut cps = svec![&env];
        let mut mus = svec![&env];
        let mut sigmas = svec![&env];
        for i in 0..n {
            cps.push_back(W_RESOLVE - 1000 * (n as u64 - i as u64)); // ascending
            mus.push_back(MU0 + (i as i128) * WAD);
            sigmas.push_back(SIGMA0);
        }
        let (_cap, tre, cre, flp, ftr, fcr) = init_tail(&env, &usdc);
        market.init_trajectory(
            &K,
            &B,
            &FEE_BPS,
            &resolver_id,
            &TIER,
            &cps,
            &W_OPEN,
            &W_LOCK,
            &W_RESOLVE,
            &mus,
            &sigmas,
            &usdc,
            &tre,
            &cre,
            &flp,
            &ftr,
            &fcr,
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

    #[test]
    fn init_and_views() {
        let c = setup_traj(3);
        let params = c.market.get_params();
        match params.outcome_space {
            OutcomeSpace::Trajectory(cps) => assert_eq!(cps.len(), 3),
            _ => panic!("expected trajectory"),
        }
        assert_eq!(c.market.get_beliefs().len(), 3);
        assert_eq!(c.market.get_checkpoints().len(), 3);
        assert_eq!(c.market.get_state().sigma_min, sigma_floor(K, B));
    }

    #[test]
    fn trade_resolve_claim_conserves_usdc() {
        let c = setup_traj(3);
        let trader = Address::generate(&c.env);
        let lp = Address::generate(&c.env);
        c.usdc_admin.mint(&trader, &10_000_000_000i128);
        c.usdc_admin.mint(&lp, &10_000_000_000i128);
        let total_in = c.token.balance(&trader) + c.token.balance(&lp);
        // fund the pool with b per checkpoint (b_7dp = 100*WAD/MONEY_SCALE = 1e9; 3 checkpoints).
        c.market.add_liquidity(&lp, &lp_scale_for_amount(3_000_000_000i128));

        // shift the consensus on each checkpoint a little.
        let mus = svec![&c.env, MU0 + WAD, MU0 + 2 * WAD, MU0 + 3 * WAD];
        let sigmas = svec![&c.env, SIGMA0, SIGMA0, SIGMA0];
        let id = c
            .market
            .trade_trajectory(&trader, &mus, &sigmas, &10_000_000_000i128);

        c.env.ledger().set_timestamp(W_RESOLVE + 1);
        let xs = svec![&c.env, MU0 + WAD, MU0 + 2 * WAD, MU0 + 4 * WAD];
        c.resolver.set(&ResolverStatus::ResolvedVec(xs));
        c.market.resolve();
        assert_eq!(c.market.get_state().status, MarketStatus::ResolvedVec);
        assert_eq!(c.market.resolved_outcomes().len(), 3);

        let got = c.market.claim_trajectory(&id);
        assert!(got >= 0);
        c.market.remove_liquidity(&lp, &c.market.lp_shares(&lp));
        let total_out =
            c.token.balance(&trader) + c.token.balance(&lp) + c.token.balance(&c.market.address);
        assert_eq!(total_in, total_out);
        assert!(c.token.balance(&c.market.address) >= 0);
    }

    #[test]
    #[should_panic]
    fn rejects_wrong_arity_trade() {
        let c = setup_traj(2);
        let trader = Address::generate(&c.env);
        let mus = svec![&c.env, MU0]; // only 1, market has 2 checkpoints
        let sigmas = svec![&c.env, SIGMA0];
        c.market
            .trade_trajectory(&trader, &mus, &sigmas, &10_000_000_000i128);
    }
}
