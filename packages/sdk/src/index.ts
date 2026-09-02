/**
 * `@kaido/sdk` — TypeScript SDK for Kaido.
 *
 * Surface lands incrementally (build.md E9):
 *   - Sprint 3 (alpha): `createMarket`, `trade`, `addLiquidity`, `resolve`,
 *     `getMarket`, `subscribeEvents`; pluggable signer (passkey-kit / Freighter).
 *   - Sprint 5: LP methods, fee claims, capped-Gaussian markets, T3 helper.
 *   - Sprint 6: SDK 1.0 — frozen public API, semver, full docs, npm publish.
 *
 * Sprint 0: package scaffold only. No `any` in the public surface (DoD §4).
 */

/** Networks Kaido SDK clients can target. */
export type KaidoNetwork = "local" | "testnet" | "futurenet" | "mainnet";

/** Placeholder export so the package is non-empty and importable. */
export const SDK_VERSION = "0.0.0" as const;
