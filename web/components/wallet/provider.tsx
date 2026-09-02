"use client";

/**
 * `WalletProvider` — holds the active wallet session and exposes `useWallet()`.
 *
 * Wrap the app (or a subtree) in `<WalletProvider network … networkPassphrase …>`
 * and call `useWallet()` to connect/disconnect and read the connected account +
 * `KaidoSigner`. The last-used connector kind is remembered in `localStorage` so
 * a refresh re-offers (but does not silently re-establish) the same wallet.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { freighterConnector } from "./freighter";
import { passkeyConnector } from "./passkey";
import type { ConnectedWallet, WalletConnector, WalletKind } from "./types";

const LAST_KIND_KEY = "kaido.wallet.lastKind";

const CONNECTORS: Record<WalletKind, WalletConnector> = {
  passkey: passkeyConnector,
  freighter: freighterConnector,
};

interface WalletContextValue {
  /** The connected wallet, or `null` when disconnected. */
  wallet: ConnectedWallet | null;
  /** True while a connect() is in flight. */
  connecting: boolean;
  /** Last connect error message, if any (cleared on the next attempt). */
  error: string | null;
  /** Connectors available to offer in the UI. */
  connectors: WalletConnector[];
  /** The connector kind used last (for "reconnect with …" affordances). */
  lastKind: WalletKind | null;
  connect: (kind: WalletKind) => Promise<ConnectedWallet>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export interface WalletProviderProps {
  network: string;
  networkPassphrase: string;
  children: React.ReactNode;
}

export function WalletProvider({ network, networkPassphrase, children }: WalletProviderProps) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastKind = useMemo<WalletKind | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(LAST_KIND_KEY);
    return v === "passkey" || v === "freighter" ? v : null;
  }, []);

  const connect = useCallback(
    async (kind: WalletKind) => {
      setConnecting(true);
      setError(null);
      try {
        const connector = CONNECTORS[kind];
        if (!(await connector.isAvailable())) {
          throw new Error(`${connector.name} is not available in this browser.`);
        }
        const w = await connector.connect({ network, networkPassphrase });
        setWallet(w);
        if (typeof window !== "undefined") window.localStorage.setItem(LAST_KIND_KEY, kind);
        return w;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to connect wallet";
        setError(msg);
        throw e instanceof Error ? e : new Error(msg);
      } finally {
        setConnecting(false);
      }
    },
    [network, networkPassphrase],
  );

  const disconnect = useCallback(async () => {
    if (wallet) {
      try {
        await CONNECTORS[wallet.kind].disconnect();
      } catch {
        /* best-effort */
      }
    }
    setWallet(null);
  }, [wallet]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallet,
      connecting,
      error,
      connectors: Object.values(CONNECTORS),
      lastKind,
      connect,
      disconnect,
    }),
    [wallet, connecting, error, lastKind, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a <WalletProvider>");
  return ctx;
}
