//! Resolver T2 — optimistic propose/dispute with USDC bonds (ADR-5 / whitepaper §17).
//!
//! After `resolve_time`, anyone may `propose(value, bond)`. During the dispute
//! window anyone may `dispute(alternative, bond)` (bond ≥ proposer's). If
//! undisputed after the window, `finalize()` returns the bond and finalizes the
//! proposal. On dispute, `arbitrate(value)` (committee auth) picks the winner and
//! transfers the loser's bond to the winner.

#![no_std]

use kaido_common::ResolverStatus;
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env};

const LEDGERS_PER_DAY: u32 = 17_280;
const INSTANCE_TTL_TARGET: u32 = 365 * LEDGERS_PER_DAY;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL_TARGET - 30 * LEDGERS_PER_DAY;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Usdc,
    Committee,
    ResolveTime,
    DisputeWindowSecs,
    MinBond,
    Finalized,
    ActiveProposal,
    Dispute,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub proposer: Address,
    pub value: i128,
    pub bond: i128,
    pub proposed_at: u64,
    pub dispute_deadline: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeRecord {
    pub disputer: Address,
    pub value: i128,
    pub bond: i128,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum OptimisticPhase {
    AwaitingProposal = 0,
    DisputeWindow = 1,
    Disputed = 2,
    Finalized = 3,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ResolverError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotYetResolveTime = 3,
    BondTooSmall = 4,
    AlreadyFinalized = 5,
    ActiveProposalExists = 6,
    NoActiveProposal = 7,
    DisputeWindowClosed = 8,
    BondTooLowForDispute = 9,
    AlreadyDisputed = 10,
    NotInDisputeWindow = 11,
    NotDisputed = 12,
    NotFinalized = 13,
    UnauthorizedCommittee = 14,
}

#[contract]
pub struct ResolverOptimistic;

fn extend_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
}

fn require_init(env: &Env) -> soroban_sdk::storage::Instance {
    let s = env.storage().instance();
    if !s.has(&DataKey::Usdc) {
        panic_with_error!(env, ResolverError::NotInitialized);
    }
    s
}

fn pull_bond(env: &Env, from: &Address, amount: i128) {
    let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
    token::TokenClient::new(env, &usdc).transfer(from, &env.current_contract_address(), &amount);
}

fn push_bond(env: &Env, to: &Address, amount: i128) {
    let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
    token::TokenClient::new(env, &usdc).transfer(&env.current_contract_address(), to, &amount);
}

#[contractimpl]
impl ResolverOptimistic {
    pub fn __constructor(
        env: Env,
        usdc: Address,
        committee: Address,
        resolve_time: u64,
        dispute_window_secs: u64,
        min_bond: i128,
    ) {
        let s = env.storage().instance();
        if s.has(&DataKey::Usdc) {
            panic_with_error!(&env, ResolverError::AlreadyInitialized);
        }
        if min_bond <= 0 {
            panic_with_error!(&env, ResolverError::BondTooSmall);
        }
        s.set(&DataKey::Usdc, &usdc);
        s.set(&DataKey::Committee, &committee);
        s.set(&DataKey::ResolveTime, &resolve_time);
        s.set(&DataKey::DisputeWindowSecs, &dispute_window_secs);
        s.set(&DataKey::MinBond, &min_bond);
        extend_ttl(&env);
    }

    pub fn propose(env: Env, proposer: Address, value: i128, bond: i128) {
        proposer.require_auth();
        let s = require_init(&env);
        if s.has(&DataKey::Finalized) {
            panic_with_error!(&env, ResolverError::AlreadyFinalized);
        }
        if s.has(&DataKey::ActiveProposal) || s.has(&DataKey::Dispute) {
            panic_with_error!(&env, ResolverError::ActiveProposalExists);
        }
        let resolve_time: u64 = s.get(&DataKey::ResolveTime).unwrap();
        if env.ledger().timestamp() < resolve_time {
            panic_with_error!(&env, ResolverError::NotYetResolveTime);
        }
        let min_bond: i128 = s.get(&DataKey::MinBond).unwrap();
        if bond < min_bond {
            panic_with_error!(&env, ResolverError::BondTooSmall);
        }
        pull_bond(&env, &proposer, bond);
        let window: u64 = s.get(&DataKey::DisputeWindowSecs).unwrap();
        let proposal = Proposal {
            proposer: proposer.clone(),
            value,
            bond,
            proposed_at: env.ledger().timestamp(),
            dispute_deadline: env.ledger().timestamp().saturating_add(window),
        };
        s.set(&DataKey::ActiveProposal, &proposal);
        extend_ttl(&env);
    }

    pub fn dispute(env: Env, disputer: Address, value: i128, bond: i128) {
        disputer.require_auth();
        let s = require_init(&env);
        if s.has(&DataKey::Finalized) {
            panic_with_error!(&env, ResolverError::AlreadyFinalized);
        }
        if s.has(&DataKey::Dispute) {
            panic_with_error!(&env, ResolverError::AlreadyDisputed);
        }
        let proposal: Proposal = match s.get(&DataKey::ActiveProposal) {
            Some(p) => p,
            None => panic_with_error!(&env, ResolverError::NoActiveProposal),
        };
        if env.ledger().timestamp() > proposal.dispute_deadline {
            panic_with_error!(&env, ResolverError::DisputeWindowClosed);
        }
        if bond < proposal.bond {
            panic_with_error!(&env, ResolverError::BondTooLowForDispute);
        }
        pull_bond(&env, &disputer, bond);
        let record = DisputeRecord {
            disputer: disputer.clone(),
            value,
            bond,
        };
        s.set(&DataKey::Dispute, &record);
        extend_ttl(&env);
    }

    pub fn finalize(env: Env) {
        let s = require_init(&env);
        if s.has(&DataKey::Finalized) {
            panic_with_error!(&env, ResolverError::AlreadyFinalized);
        }
        if s.has(&DataKey::Dispute) {
            panic_with_error!(&env, ResolverError::AlreadyDisputed);
        }
        let proposal: Proposal = match s.get(&DataKey::ActiveProposal) {
            Some(p) => p,
            None => panic_with_error!(&env, ResolverError::NoActiveProposal),
        };
        if env.ledger().timestamp() <= proposal.dispute_deadline {
            panic_with_error!(&env, ResolverError::NotInDisputeWindow);
        }
        push_bond(&env, &proposal.proposer, proposal.bond);
        s.set(&DataKey::Finalized, &proposal.value);
        s.set(&DataKey::ActiveProposal, &());
        extend_ttl(&env);
    }

    /// Committee picks the winning value; loser's bond goes to the winner.
    pub fn arbitrate(env: Env, arbiter: Address, value: i128) {
        arbiter.require_auth();
        let s = require_init(&env);
        if s.has(&DataKey::Finalized) {
            panic_with_error!(&env, ResolverError::AlreadyFinalized);
        }
        let committee: Address = s.get(&DataKey::Committee).unwrap();
        if arbiter != committee {
            panic_with_error!(&env, ResolverError::UnauthorizedCommittee);
        }
        let proposal: Proposal = match s.get(&DataKey::ActiveProposal) {
            Some(p) => p,
            None => panic_with_error!(&env, ResolverError::NoActiveProposal),
        };
        let dispute: DisputeRecord = match s.get(&DataKey::Dispute) {
            Some(d) => d,
            None => panic_with_error!(&env, ResolverError::NotDisputed),
        };
        let proposer_wins = value == proposal.value;
        if proposer_wins {
            push_bond(&env, &proposal.proposer, proposal.bond + dispute.bond);
        } else if value == dispute.value {
            push_bond(&env, &dispute.disputer, proposal.bond + dispute.bond);
        } else {
            // Committee picked a third value — both bonds to committee.
            push_bond(&env, &committee, proposal.bond + dispute.bond);
        }
        s.set(&DataKey::Finalized, &value);
        s.set(&DataKey::ActiveProposal, &());
        s.set(&DataKey::Dispute, &());
        extend_ttl(&env);
    }

    pub fn resolve(env: Env) -> i128 {
        let s = require_init(&env);
        s.get(&DataKey::Finalized)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotFinalized))
    }

    pub fn status(env: Env) -> ResolverStatus {
        match Self::phase(env.clone()) {
            OptimisticPhase::Finalized => {
                let s = env.storage().instance();
                ResolverStatus::Resolved(s.get(&DataKey::Finalized).unwrap())
            }
            OptimisticPhase::Disputed => ResolverStatus::Stale,
            OptimisticPhase::DisputeWindow | OptimisticPhase::AwaitingProposal => {
                ResolverStatus::Pending
            }
        }
    }

    pub fn phase(env: Env) -> OptimisticPhase {
        let s = env.storage().instance();
        if !s.has(&DataKey::Usdc) {
            return OptimisticPhase::AwaitingProposal;
        }
        if s.has(&DataKey::Finalized) {
            return OptimisticPhase::Finalized;
        }
        if s.has(&DataKey::Dispute) {
            return OptimisticPhase::Disputed;
        }
        if s.get::<_, Proposal>(&DataKey::ActiveProposal).is_some() {
            return OptimisticPhase::DisputeWindow;
        }
        OptimisticPhase::AwaitingProposal
    }

    pub fn active_proposal(env: Env) -> Option<Proposal> {
        env.storage().instance().get(&DataKey::ActiveProposal)
    }

    pub fn active_dispute(env: Env) -> Option<DisputeRecord> {
        env.storage().instance().get(&DataKey::Dispute)
    }

    pub fn min_bond(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::MinBond)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotInitialized))
    }

    pub fn resolve_time(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ResolveTime)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotInitialized))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{token, Address, Env};

    fn setup_usdc(env: &Env, admin: &Address) -> (Address, token::StellarAssetClient<'static>) {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc = sac.address();
        let sa = token::StellarAssetClient::new(env, &usdc);
        sa.mint(admin, &10_000_000_000i128);
        (usdc, sa)
    }

    #[test]
    fn propose_finalize_resolve() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let (usdc, sa) = setup_usdc(&env, &admin);
        let committee = Address::generate(&env);
        let proposer = Address::generate(&env);
        sa.mint(&proposer, &1_000_000i128);
        let id = env.register(
            ResolverOptimistic,
            (usdc, committee, 100u64, 60u64, 100_000i128),
        );
        let client = ResolverOptimisticClient::new(&env, &id);
        env.ledger().set_timestamp(100);
        let x0 = 55_000_000_000_000_000_000i128;
        client.propose(&proposer, &x0, &100_000i128);
        env.ledger().set_timestamp(161);
        client.finalize();
        assert!(matches!(client.status(), ResolverStatus::Resolved(v) if v == x0));
        assert_eq!(client.resolve(), x0);
    }

    #[test]
    fn dispute_then_arbitrate() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let (usdc, sa) = setup_usdc(&env, &admin);
        let committee = Address::generate(&env);
        let proposer = Address::generate(&env);
        let disputer = Address::generate(&env);
        sa.mint(&proposer, &1_000_000i128);
        sa.mint(&disputer, &1_000_000i128);
        let id = env.register(
            ResolverOptimistic,
            (usdc, committee.clone(), 0u64, 600u64, 50_000i128),
        );
        let client = ResolverOptimisticClient::new(&env, &id);
        client.propose(&proposer, &10i128, &50_000i128);
        client.dispute(&disputer, &20i128, &50_000i128);
        assert!(matches!(client.status(), ResolverStatus::Stale));
        client.arbitrate(&committee, &20i128);
        assert!(matches!(client.status(), ResolverStatus::Resolved(v) if v == 20));
    }
}
