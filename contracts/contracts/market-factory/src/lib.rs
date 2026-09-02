//! `MarketFactory` — the permissionless entry point for creating markets
//! (whitepaper §14–15, build.md E3). Anyone calls [`MarketFactory::create_market`];
//! the factory:
//!   1. validates the seven-field market tuple (`b > 0`, `fee ≤ cap`, window
//!      ordering, `σ_min` derivable, `σ₀ ≥ σ_min`);
//!   2. deploys a fresh `DistributionMarket` from the pinned WASM hash (set at
//!      construction — never hardcoded);
//!   3. calls its `init(...)` with the tuple + the per-network USDC SAC id;
//!   4. registers the new market in the `Registry`.
//!
//! It does **not** auto-seed liquidity: `HouseVault::seed_market` is admin-gated
//! (the house is the protocol's own LP, not something a market creator can
//! conscript), so seeding stays an explicit follow-up call by the house admin.
//!
//! Sprint 3. v1 is scalar-Gaussian, σ-floor only — capped Gaussians (Sprint 5)
//! and trajectory markets are added here once the market contract supports them.

#![no_std]
#![allow(clippy::too_many_arguments)]

use kaido_common::{
    KaidoError, MarketInfo, MarketWindow, OutcomeSpace, Parameterization, ResolverTier,
};
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, panic_with_error, Address, BytesN, Env,
    Vec,
};

// Cross-contract client interfaces. Declared here as bare `#[contractclient]`
// traits (not `#[contractimpl]`) so the factory does *not* link the sibling
// contracts' WASM exports — that would collide on `__constructor` etc. (the
// CVE-2026-26267 footgun; see workspace Cargo.toml). These must stay in sync
// with `distribution-market`'s `init` and `registry`'s `register`.

#[contractclient(name = "DistributionMarketClient")]
#[allow(dead_code)]
trait DistributionMarketIface {
    #[allow(clippy::too_many_arguments)]
    fn init(
        env: Env,
        k: i128,
        b: i128,
        fee_bps: u32,
        resolver: Address,
        tier: u32,
        window_open: u64,
        window_lock: u64,
        window_resolve: u64,
        mu0: i128,
        sigma0: i128,
        usdc: Address,
    );
    #[allow(clippy::too_many_arguments)]
    fn init_trajectory(
        env: Env,
        k: i128,
        b: i128,
        fee_bps: u32,
        resolver: Address,
        tier: u32,
        checkpoints: Vec<u64>,
        window_open: u64,
        window_lock: u64,
        window_resolve: u64,
        mus0: Vec<i128>,
        sigmas0: Vec<i128>,
        usdc: Address,
    );
}

#[contractclient(name = "RegistryClient")]
#[allow(dead_code)]
trait RegistryIface {
    fn register(env: Env, info: MarketInfo);
}

const LEDGERS_PER_DAY: u32 = 17_280;
const INSTANCE_TTL_TARGET: u32 = 120 * LEDGERS_PER_DAY;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL_TARGET - 14 * LEDGERS_PER_DAY;

/// Protocol cap on the per-trade fee. 10% — must match
/// `distribution_market::MAX_FEE_BPS` (the market re-checks anyway).
pub const MAX_FEE_BPS: u32 = 1_000;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// `Address` — the factory admin (may re-point the WASM hash on upgrade).
    Admin,
    /// `BytesN<32>` — the `DistributionMarket` WASM hash markets are deployed from.
    MarketWasm,
    /// `Address` — the `Registry` to register new markets in.
    Registry,
    /// `Address` — the USDC SAC (settlement asset; per-network, never hardcoded).
    Usdc,
    /// `u64` — monotonic counter, used as the deploy salt so addresses are
    /// deterministic and collision-free.
    Counter,
}

#[contract]
pub struct MarketFactory;

#[contractimpl]
impl MarketFactory {
    /// `market_wasm` is the WASM hash freshly-deployed markets use; `registry`
    /// and `usdc` are resolved per-network at deploy time (build.md §0a).
    pub fn __constructor(
        env: Env,
        admin: Address,
        market_wasm: BytesN<32>,
        registry: Address,
        usdc: Address,
    ) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::MarketWasm, &market_wasm);
        s.set(&DataKey::Registry, &registry);
        s.set(&DataKey::Usdc, &usdc);
        s.set(&DataKey::Counter, &0u64);
        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
    }

    /// Create a scalar-Gaussian market. All numeric belief fields are WAD-scaled
    /// (`1e18`; ADR-1/ADR-2). `tier` is the resolver's trust badge code
    /// (`0..=3`; ADR-5). Returns the deployed market's address.
    pub fn create_market(
        env: Env,
        creator: Address,
        k: i128,
        b: i128,
        fee_bps: u32,
        resolver: Address,
        tier: u32,
        window_open: u64,
        window_lock: u64,
        window_resolve: u64,
        mu0: i128,
        sigma0: i128,
    ) -> Address {
        creator.require_auth();
        let s = env.storage().instance();
        let wasm: BytesN<32> = s
            .get(&DataKey::MarketWasm)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        let registry: Address = s.get(&DataKey::Registry).unwrap();
        let usdc: Address = s.get(&DataKey::Usdc).unwrap();

        // --- validate the tuple up front (the market re-checks; fail early) ---
        if k <= 0 {
            panic_with_error!(&env, KaidoError::InvalidK);
        }
        if b <= 0 {
            panic_with_error!(&env, KaidoError::InvalidB);
        }
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, KaidoError::FeeTooHigh);
        }
        let tier_enum = match tier {
            0 => ResolverTier::Reflector,
            1 => ResolverTier::Attested,
            2 => ResolverTier::Optimistic,
            3 => ResolverTier::Designated,
            _ => panic_with_error!(&env, KaidoError::InvalidTier),
        };
        if !(window_open <= window_lock && window_lock <= window_resolve)
            || window_resolve <= env.ledger().timestamp()
        {
            panic_with_error!(&env, KaidoError::InvalidWindow);
        }
        if sigma0 <= 0 {
            panic_with_error!(&env, KaidoError::InvalidSigma);
        }
        if sigma0 < kaido_math::sigma_floor(k, b) {
            panic_with_error!(&env, KaidoError::SigmaBelowFloor);
        }

        // --- deploy + init ---
        let counter: u64 = s.get(&DataKey::Counter).unwrap();
        s.set(&DataKey::Counter, &(counter + 1));
        let salt = BytesN::from_array(&env, &salt_bytes(counter));
        let market = env
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm, ());
        DistributionMarketClient::new(&env, &market).init(
            &k,
            &b,
            &fee_bps,
            &resolver,
            &tier,
            &window_open,
            &window_lock,
            &window_resolve,
            &mu0,
            &sigma0,
            &usdc,
        );

        // --- register ---
        let info = MarketInfo {
            market: market.clone(),
            outcome_space: OutcomeSpace::Scalar,
            parameterization: Parameterization::Gaussian,
            capped: false,
            resolver,
            tier: tier_enum,
            window: MarketWindow {
                open: window_open,
                lock: window_lock,
                resolve: window_resolve,
            },
            creator,
        };
        RegistryClient::new(&env, &registry).register(&info);

        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
        market
    }

    /// Create a trajectory market: N independent per-checkpoint Gaussians
    /// sharing one collateral pool (ADR-4, whitepaper §16). `checkpoints` are
    /// Unix timestamps (ascending, ≤ `window_resolve`); `mus0`/`sigmas0` have
    /// one entry per checkpoint, all WAD.
    pub fn create_trajectory_market(
        env: Env,
        creator: Address,
        k: i128,
        b: i128,
        fee_bps: u32,
        resolver: Address,
        tier: u32,
        checkpoints: Vec<u64>,
        window_open: u64,
        window_lock: u64,
        window_resolve: u64,
        mus0: Vec<i128>,
        sigmas0: Vec<i128>,
    ) -> Address {
        creator.require_auth();
        let s = env.storage().instance();
        let wasm: BytesN<32> = s
            .get(&DataKey::MarketWasm)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        let registry: Address = s.get(&DataKey::Registry).unwrap();
        let usdc: Address = s.get(&DataKey::Usdc).unwrap();

        if k <= 0 {
            panic_with_error!(&env, KaidoError::InvalidK);
        }
        if b <= 0 {
            panic_with_error!(&env, KaidoError::InvalidB);
        }
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, KaidoError::FeeTooHigh);
        }
        let tier_enum = match tier {
            0 => ResolverTier::Reflector,
            1 => ResolverTier::Attested,
            2 => ResolverTier::Optimistic,
            3 => ResolverTier::Designated,
            _ => panic_with_error!(&env, KaidoError::InvalidTier),
        };
        let n = checkpoints.len();
        if n == 0 || mus0.len() != n || sigmas0.len() != n {
            panic_with_error!(&env, KaidoError::TrajectoryNotSupported);
        }
        if !(window_open <= window_lock && window_lock <= window_resolve)
            || window_resolve <= env.ledger().timestamp()
        {
            panic_with_error!(&env, KaidoError::InvalidWindow);
        }
        let sigma_min = kaido_math::sigma_floor(k, b);
        for i in 0..n {
            if sigmas0.get(i).unwrap() < sigma_min {
                panic_with_error!(&env, KaidoError::SigmaBelowFloor);
            }
        }

        let counter: u64 = s.get(&DataKey::Counter).unwrap();
        s.set(&DataKey::Counter, &(counter + 1));
        let salt = BytesN::from_array(&env, &salt_bytes(counter));
        let market = env
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm, ());
        DistributionMarketClient::new(&env, &market).init_trajectory(
            &k,
            &b,
            &fee_bps,
            &resolver,
            &tier,
            &checkpoints,
            &window_open,
            &window_lock,
            &window_resolve,
            &mus0,
            &sigmas0,
            &usdc,
        );

        let info = MarketInfo {
            market: market.clone(),
            outcome_space: OutcomeSpace::Trajectory(checkpoints),
            parameterization: Parameterization::Gaussian,
            capped: false,
            resolver,
            tier: tier_enum,
            window: MarketWindow {
                open: window_open,
                lock: window_lock,
                resolve: window_resolve,
            },
            creator,
        };
        RegistryClient::new(&env, &registry).register(&info);

        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
        market
    }

    /// Re-point the `DistributionMarket` WASM hash (e.g. after a contract
    /// upgrade); only affects markets created afterwards. Admin-gated.
    pub fn set_market_wasm(env: Env, new_wasm: BytesN<32>) {
        let s = env.storage().instance();
        let admin: Address = s
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized));
        admin.require_auth();
        s.set(&DataKey::MarketWasm, &new_wasm);
        s.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
    }

    // ----------------------------------------------------------------- //
    // Views
    // ----------------------------------------------------------------- //

    pub fn market_wasm(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::MarketWasm)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized))
    }

    pub fn registry(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Registry)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized))
    }

    pub fn usdc(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Usdc)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized))
    }

    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, KaidoError::NotInitialized))
    }

    /// Number of markets created so far (= the next deploy salt).
    pub fn count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Counter).unwrap_or(0)
    }
}

/// The deploy salt for the `n`-th market: the counter, big-endian, zero-padded
/// to 32 bytes. Deterministic and collision-free for a given factory.
fn salt_bytes(n: u64) -> [u8; 32] {
    let mut b = [0u8; 32];
    b[24..32].copy_from_slice(&n.to_be_bytes());
    b
}

#[cfg(test)]
mod test;
