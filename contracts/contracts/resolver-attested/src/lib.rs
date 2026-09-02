//! Resolver T1 — verifies an Ed25519-signed report from a registered poster,
//! with a challenge window before the outcome finalizes (ADR-5 / whitepaper §17).
//!
//! Message format (EIP-191-style domain prefix):
//! `"\x19Kaido Attested Report v1\x00" || contract_id || value_wad (i128 BE) || reported_at (u64 BE)`

#![no_std]

use kaido_common::ResolverStatus;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env,
};

const LEDGERS_PER_DAY: u32 = 17_280;
const INSTANCE_TTL_TARGET: u32 = 365 * LEDGERS_PER_DAY;
const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL_TARGET - 30 * LEDGERS_PER_DAY;

const REPORT_PREFIX: &[u8] = b"\x19Kaido Attested Report v1\x00";

#[contracttype]
#[derive(Clone)]
enum DataKey {
    PosterPubkey,
    ResolveTime,
    ChallengeWindowSecs,
    Finalized,
    PendingReport,
    Disputed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingReport {
    pub value: i128,
    pub reported_at: u64,
    pub challenge_deadline: u64,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AttestedPhase {
    AwaitingReport = 0,
    ChallengeWindow = 1,
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
    BadSignature = 4,
    ReportExpired = 5,
    AlreadyFinalized = 6,
    NoPendingReport = 7,
    ChallengeWindowClosed = 8,
    AlreadyDisputed = 9,
    NotInChallengeWindow = 10,
    NotFinalized = 11,
}

#[contract]
pub struct ResolverAttested;

fn extend_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_TARGET);
}

fn require_init(env: &Env) -> soroban_sdk::storage::Instance {
    let s = env.storage().instance();
    if !s.has(&DataKey::PosterPubkey) {
        panic_with_error!(env, ResolverError::NotInitialized);
    }
    s
}

fn report_message(env: &Env, value: i128, reported_at: u64) -> Bytes {
    let mut msg = Bytes::new(env);
    msg.extend_from_slice(REPORT_PREFIX);
    msg.append(&env.current_contract_address().to_string().to_bytes());
    msg.extend_from_slice(&value.to_be_bytes());
    msg.extend_from_slice(&reported_at.to_be_bytes());
    msg
}

fn verify_report_signature(
    env: &Env,
    pubkey: &BytesN<32>,
    value: i128,
    reported_at: u64,
    signature: &BytesN<64>,
) {
    let msg = report_message(env, value, reported_at);
    env.crypto()
        .ed25519_verify(pubkey, &msg, signature);
}

#[contractimpl]
impl ResolverAttested {
    pub fn __constructor(
        env: Env,
        poster_pubkey: BytesN<32>,
        resolve_time: u64,
        challenge_window_secs: u64,
    ) {
        let s = env.storage().instance();
        if s.has(&DataKey::PosterPubkey) {
            panic_with_error!(&env, ResolverError::AlreadyInitialized);
        }
        s.set(&DataKey::PosterPubkey, &poster_pubkey);
        s.set(&DataKey::ResolveTime, &resolve_time);
        s.set(&DataKey::ChallengeWindowSecs, &challenge_window_secs);
        extend_ttl(&env);
    }

    pub fn submit_report(
        env: Env,
        value: i128,
        reported_at: u64,
        signature: BytesN<64>,
    ) {
        let s = require_init(&env);
        if s.has(&DataKey::Finalized) {
            panic_with_error!(&env, ResolverError::AlreadyFinalized);
        }
        if s.has(&DataKey::Disputed) {
            panic_with_error!(&env, ResolverError::AlreadyDisputed);
        }
        let resolve_time: u64 = s.get(&DataKey::ResolveTime).unwrap();
        if env.ledger().timestamp() < resolve_time {
            panic_with_error!(&env, ResolverError::NotYetResolveTime);
        }
        if reported_at < resolve_time {
            panic_with_error!(&env, ResolverError::ReportExpired);
        }
        let pubkey: BytesN<32> = s.get(&DataKey::PosterPubkey).unwrap();
        verify_report_signature(&env, &pubkey, value, reported_at, &signature);
        let window: u64 = s.get(&DataKey::ChallengeWindowSecs).unwrap();
        let deadline = env.ledger().timestamp().saturating_add(window);
        let pending = PendingReport {
            value,
            reported_at,
            challenge_deadline: deadline,
        };
        s.set(&DataKey::PendingReport, &pending);
        extend_ttl(&env);
    }

    pub fn dispute(env: Env, _disputer: Address) {
        let s = require_init(&env);
        if s.has(&DataKey::Finalized) {
            panic_with_error!(&env, ResolverError::AlreadyFinalized);
        }
        if s.has(&DataKey::Disputed) {
            panic_with_error!(&env, ResolverError::AlreadyDisputed);
        }
        let pending: PendingReport = match s.get(&DataKey::PendingReport) {
            Some(p) => p,
            None => panic_with_error!(&env, ResolverError::NoPendingReport),
        };
        if env.ledger().timestamp() > pending.challenge_deadline {
            panic_with_error!(&env, ResolverError::ChallengeWindowClosed);
        }
        s.set(&DataKey::Disputed, &true);
        s.set(&DataKey::PendingReport, &());
        extend_ttl(&env);
    }

    pub fn finalize(env: Env) {
        let s = require_init(&env);
        if s.has(&DataKey::Finalized) {
            panic_with_error!(&env, ResolverError::AlreadyFinalized);
        }
        if s.has(&DataKey::Disputed) {
            panic_with_error!(&env, ResolverError::AlreadyDisputed);
        }
        let pending: PendingReport = match s.get(&DataKey::PendingReport) {
            Some(p) => p,
            None => panic_with_error!(&env, ResolverError::NoPendingReport),
        };
        if env.ledger().timestamp() <= pending.challenge_deadline {
            panic_with_error!(&env, ResolverError::NotInChallengeWindow);
        }
        s.set(&DataKey::Finalized, &pending.value);
        s.set(&DataKey::PendingReport, &());
        extend_ttl(&env);
    }

    pub fn resolve(env: Env) -> i128 {
        let s = require_init(&env);
        s.get(&DataKey::Finalized)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotFinalized))
    }

    pub fn status(env: Env) -> ResolverStatus {
        match Self::phase(env.clone()) {
            AttestedPhase::Finalized => {
                let s = env.storage().instance();
                ResolverStatus::Resolved(s.get(&DataKey::Finalized).unwrap())
            }
            AttestedPhase::Disputed => ResolverStatus::Stale,
            AttestedPhase::ChallengeWindow | AttestedPhase::AwaitingReport => {
                ResolverStatus::Pending
            }
        }
    }

    pub fn phase(env: Env) -> AttestedPhase {
        let s = env.storage().instance();
        if !s.has(&DataKey::PosterPubkey) {
            return AttestedPhase::AwaitingReport;
        }
        if s.has(&DataKey::Finalized) {
            return AttestedPhase::Finalized;
        }
        if s.has(&DataKey::Disputed) {
            return AttestedPhase::Disputed;
        }
        if s.get::<_, PendingReport>(&DataKey::PendingReport).is_some() {
            return AttestedPhase::ChallengeWindow;
        }
        AttestedPhase::AwaitingReport
    }

    pub fn pending_report(env: Env) -> Option<PendingReport> {
        env.storage().instance().get(&DataKey::PendingReport)
    }

    pub fn poster_pubkey(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::PosterPubkey)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotInitialized))
    }

    pub fn resolve_time(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ResolveTime)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotInitialized))
    }

    pub fn challenge_window_secs(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ChallengeWindowSecs)
            .unwrap_or_else(|| panic_with_error!(&env, ResolverError::NotInitialized))
    }

    /// SHA-256 of the canonical signed payload (for off-chain poster tooling).
    pub fn report_message_hash(env: Env, value: i128, reported_at: u64) -> BytesN<32> {
        env.crypto()
            .sha256(&report_message(&env, value, reported_at))
            .to_bytes()
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{Address, Env};

    fn sign_report(
        env: &Env,
        contract: &Address,
        sk: &ed25519_dalek::SigningKey,
        value: i128,
        reported_at: u64,
    ) -> BytesN<64> {
        let mut msg = std::vec::Vec::from(REPORT_PREFIX);
        let id_bytes = contract.to_string().to_bytes();
        for i in 0..id_bytes.len() {
            msg.push(id_bytes.get(i).unwrap());
        }
        msg.extend_from_slice(&value.to_be_bytes());
        msg.extend_from_slice(&reported_at.to_be_bytes());
        use ed25519_dalek::Signer;
        let sig = sk.sign(&msg);
        BytesN::from_array(env, &sig.to_bytes())
    }

    #[test]
    fn signed_report_finalize_and_resolve() {
        let env = Env::default();
        let sk = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let pk = BytesN::from_array(&env, sk.verifying_key().as_bytes());
        let id = env.register(ResolverAttested, (pk, 1_000u64, 300u64));
        let client = ResolverAttestedClient::new(&env, &id);
        env.ledger().set_timestamp(1_000);
        let x0 = 42_500_000_000_000_000_000i128;
        let sig = sign_report(&env, &id, &sk, x0, 1_000);
        client.submit_report(&x0, &1_000, &sig);
        assert!(matches!(client.status(), ResolverStatus::Pending));
        env.ledger().set_timestamp(1_301);
        client.finalize();
        assert!(matches!(client.status(), ResolverStatus::Resolved(v) if v == x0));
        assert_eq!(client.resolve(), x0);
    }

    #[test]
    fn bad_signature_reverts() {
        let env = Env::default();
        let sk = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let pk = BytesN::from_array(&env, sk.verifying_key().as_bytes());
        let id = env.register(ResolverAttested, (pk, 0u64, 60u64));
        let client = ResolverAttestedClient::new(&env, &id);
        let bad = BytesN::from_array(&env, &[0u8; 64]);
        assert!(client.try_submit_report(&1i128, &0, &bad).is_err());
    }

    #[test]
    fn dispute_makes_stale() {
        let env = Env::default();
        env.mock_all_auths();
        let sk = ed25519_dalek::SigningKey::from_bytes(&[9u8; 32]);
        let pk = BytesN::from_array(&env, sk.verifying_key().as_bytes());
        let id = env.register(ResolverAttested, (pk, 0u64, 600u64));
        let client = ResolverAttestedClient::new(&env, &id);
        let sig = sign_report(&env, &id, &sk, 10i128, 0);
        client.submit_report(&10i128, &0, &sig);
        let disputer = Address::generate(&env);
        client.dispute(&disputer);
        assert!(matches!(client.status(), ResolverStatus::Stale));
    }
}
