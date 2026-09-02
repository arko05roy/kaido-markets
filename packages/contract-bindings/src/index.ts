/**
 * Barrel for the generated Kaido contract bindings.
 *
 * Each subdirectory is a `stellar contract bindings typescript` output (with its
 * own package.json/tsconfig.json for standalone publishing later). This barrel
 * re-exports each contract's `Client` + spec under a namespace so app and SDK
 * code can `import { distributionMarket } from "@kaido/contract-bindings"`.
 *
 * Regenerate with `cargo make --cwd contracts bindings`. CI fails on a diff
 * (bindings-staleness check — build.md Sprint 3 acceptance & §6).
 */
export * as marketFactory from "./market-factory/src/index.js";
export * as distributionMarket from "./distribution-market/src/index.js";
export * as registry from "./registry/src/index.js";
export * as houseVault from "./house-vault/src/index.js";
export * as resolverReflector from "./resolver-reflector/src/index.js";
export * as resolverAttested from "./resolver-attested/src/index.js";
export * as resolverOptimistic from "./resolver-optimistic/src/index.js";
export * as resolverDesignated from "./resolver-designated/src/index.js";
