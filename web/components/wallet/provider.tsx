"use client";

/**
 * `WalletProvider` — holds the active wallet session and exposes `useWallet()`.
 *
 * Wrap the app (or a subtree) in `<WalletProvider network … networkPassphrase …>`
 * and call `useWallet()` to connect/disconnect and read the connected account +
 * `KaidoSigner`. The last-used connector is persisted in `localStorage` and
 * restored silently on refresh when the wallet extension still authorizes this site.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { freighterConnector } from "./freighter";
import type { ConnectedWallet, WalletConnector, WalletKind } from "./types";

export const LAST_KIND_KEY = "kaido.wallet.lastKind";

const CONNECTORS: Record<WalletKind, WalletConnector> = {
  freighter: freighterConnector,
};

function readLastKind(): WalletKind | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(LAST_KIND_KEY);
  return v === "freighter" ? v : null;
}

interface WalletContextValue {
  /** The connected wallet, or `null` when disconnected. */
  wallet: ConnectedWallet | null;
  /** True while a connect() is in flight. */
  connecting: boolean;
  /** True while a prior session is being restored after load. */
  restoring: boolean;
  /** Last connect error message, if any (cleared on the next attempt). */
  error: string | null;
  /** Connectors available to offer in the UI. */
  connectors: WalletConnector[];
  /** The connector kind used last (for "reconnect with …" affordances). */
  lastKind: WalletKind | null;
  /** Soroban RPC URL for the active network (for balance reads). */
  rpcUrl: string | null;
  /** Horizon URL for classic balance reads (navbar). */
  horizonUrl: string | null;
  /** USDC SAC contract id for the active network. */
  usdcSacId: string | null;
  networkPassphrase: string;
  connect: (kind: WalletKind) => Promise<ConnectedWallet>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export interface WalletProviderProps {
  network: string;
  networkPassphrase: string;
  rpcUrl?: string | null;
  horizonUrl?: string | null;
  usdcSacId?: string | null;
  children: React.ReactNode;
}

export function WalletProvider({
  network,
  networkPassphrase,
  rpcUrl = null,
  horizonUrl = null,
  usdcSacId = null,
  children,
}: WalletProviderProps) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKind, setLastKind] = useState<WalletKind | null>(readLastKind);

  useEffect(() => {
    const kind = readLastKind();
    if (!kind) return;

    let cancelled = false;
    void (async () => {
      setRestoring(true);
      try {
        const connector = CONNECTORS[kind];
        const restored = await connector.restoreSession({ network, networkPassphrase });
        if (!cancelled && restored) {
          setWallet((current) => current ?? restored);
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [network, networkPassphrase]);

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
        setLastKind(kind);
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
    if (typeof window !== "undefined") window.localStorage.removeItem(LAST_KIND_KEY);
    setLastKind(null);
  }, [wallet]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallet,
      connecting,
      restoring,
      error,
      connectors: Object.values(CONNECTORS),
      lastKind,
      rpcUrl,
      horizonUrl,
      usdcSacId,
      networkPassphrase,
      connect,
      disconnect,
    }),
    [wallet, connecting, restoring, error, lastKind, rpcUrl, horizonUrl, usdcSacId, networkPassphrase, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a <WalletProvider>");
  return ctx;
}
