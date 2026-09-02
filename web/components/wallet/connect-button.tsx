"use client";

import { Loader2, LogOut, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { useWallet } from "./provider";
import type { WalletKind } from "./types";

/**
 * Wallet connect/disconnect control. Disconnected: a row of available
 * connectors (passkey first — the ~10s onboarding path; Freighter as the
 * power-user fallback). Connected: the account pill + a disconnect button.
 */
export function ConnectButton() {
  const { wallet, connecting, error, connectors, connect, disconnect } = useWallet();
  const [available, setAvailable] = useState<Record<WalletKind, boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(connectors.map((c) => c.isAvailable().then((ok) => [c.kind, ok] as const))).then(
      (entries) => {
        if (!cancelled) setAvailable(Object.fromEntries(entries) as Record<WalletKind, boolean>);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [connectors]);

  if (wallet) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="rounded-full border bg-card px-3 py-1.5 font-mono text-xs"
          title={wallet.accountId}
        >
          {wallet.label}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void disconnect()} aria-label="Disconnect wallet">
          <LogOut className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {connectors.map((c) => {
          const ok = available?.[c.kind] ?? false;
          return (
            <Button
              key={c.kind}
              size="sm"
              variant={c.kind === "passkey" ? "default" : "outline"}
              disabled={connecting || !ok}
              onClick={() => void connect(c.kind).catch(() => {})}
              title={ok ? `Connect with ${c.name}` : `${c.name} unavailable`}
            >
              {connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wallet className="size-4" />
              )}
              {c.name}
            </Button>
          );
        })}
      </div>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
