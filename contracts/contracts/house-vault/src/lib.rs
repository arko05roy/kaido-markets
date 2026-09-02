//! HouseVault — protocol-owned underwriter that seeds markets as a Layer-1 LP-of-last-resort with per-market risk caps.
//!
//! Sprint-0 scaffold: compiles to WASM with a single no-op entrypoint so the
//! build/CI/deploy pipeline can exercise it. Real logic lands in later sprints
//! (see build.md epics & sprint plan).

#![no_std]

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct HouseVault;

#[contractimpl]
impl HouseVault {
    /// Placeholder so the contract has a callable interface. Replaced by the
    /// real API in a later sprint.
    pub fn scaffold_version(_env: Env) -> u32 {
        0
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn scaffold_version_is_zero() {
        let env = Env::default();
        let id = env.register(HouseVault, ());
        let client = HouseVaultClient::new(&env, &id);
        assert_eq!(client.scaffold_version(), 0);
    }
}
