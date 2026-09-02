/**
 * Wallet abstraction for the Kaido web app.
 *
 * A {@link WalletConnector} knows how to establish a session and hand back a
 * {@link ConnectedWallet} — an account id plus a signer that satisfies
 * `@kaido/sdk`'s `KaidoSigner`. Today only Freighter is wired up; the
 * connector indirection is kept so additional wallets can plug in without
 * touching the provider or the call sites.
 *
 * The provider (`provider.tsx`) holds the active session and exposes `useWallet()`.
 */
import type { KaidoSigner } from "@kaido/sdk";

export type WalletKind = "freighter";

export interface ConnectedWallet {
  readonly kind: WalletKind;
  /** Stellar account id (G…). */
  readonly accountId: string;
  /** A signer usable with `@kaido/sdk` (`new Kaido(cfg).trade(market, …, signer)`). */
  readonly signer: KaidoSigner;
  /** Human label for the connected identity (truncated address, etc.). */
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
  /** Rehydrate an existing session without prompting (returns null if none). */
  restoreSession(opts: { networkPassphrase: string; network: string }): Promise<ConnectedWallet | null>;
  /** Tear down any session state (best-effort). */
  disconnect(): Promise<void>;
}
