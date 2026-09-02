/**
 * Barrel for the generated Kaido contract bindings.
 *
 * The per-contract binding packages are generated into sibling directories by:
 *
 *   cargo make --cwd contracts bindings
 *
 * which runs `stellar contract bindings typescript` for each contract. The
 * output is committed and CI fails if regenerating produces a diff
 * (bindings-staleness check — build.md Sprint 3 acceptance & §6).
 *
 * Sprint 0: nothing is generated yet (the contracts are scaffolds). This file
 * will re-export `./market-factory`, `./distribution-market`, etc. once they
 * exist.
 */
export {};
