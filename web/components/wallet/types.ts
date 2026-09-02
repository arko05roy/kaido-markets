/**
 * Wallet abstraction for the Kaido web app.
 *
 * A {@link WalletConnector} knows how to establish a session and hand back a
 * {@link ConnectedWallet} — an account id plus a signer that satisfies
 * `@kaido/sdk`'s `KaidoSigner`. Two connectors ship:
 *   - `freighter` (power-user fallback) — `@stellar/freighter-api`.
 *   - `passkey` (default onboarding, Sprint 4 polish) — `passkey-kit` + Launchtube;
 *     the signing key never reaches the browser.
 *
 * The provider (`provider.tsx`) holds the active session and exposes `useWallet()`.
 */
import type { KaidoSigner } from "@kaido/sdk";

export type WalletKind = "freighter" | "passkey";

export interface ConnectedWallet {
  readonly kind: WalletKind;
  /** Stellar account id (G… for Freighter, C… smart-wallet for passkeys). */
  readonly accountId: string;
  /** A signer usable with `@kaido/sdk` (`new Kaido(cfg).trade(market, …, signer)`). */
  readonly signer: KaidoSigner;
  /** Human label for the connected identity (truncated address, passkey name…). */
  readonly label: string;
}

export interface WalletConnector {
  readonly kind: WalletKind;
  /** Display name in the connect UI. */
  readonly name: string;
  /** True if this connector can run in the current environment (extension present, etc.). */
  isAvailable(): Promise<boolean>;
  /** Establish a session. Rejects if the user cancels or the wallet is unavailable. */
  connect(opts: { networkPassphrase: string; network: string }): Promise<ConnectedWallet>;
  /** Tear down any session state (best-effort). */
  disconnect(): Promise<void>;
}
