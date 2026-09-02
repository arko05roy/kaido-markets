//! Resolver T3 — a single named party reports the outcome.
//!
//! Sprint-0 scaffold: compiles to WASM with a single no-op entrypoint so the
//! build/CI/deploy pipeline can exercise it. Real logic lands in later sprints
//! (see build.md epics & sprint plan).

#![no_std]

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct ResolverDesignated;

#[contractimpl]
impl ResolverDesignated {
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
        let id = env.register(ResolverDesignated, ());
        let client = ResolverDesignatedClient::new(&env, &id);
        assert_eq!(client.scaffold_version(), 0);
    }
}
