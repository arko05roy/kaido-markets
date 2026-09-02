"use client";

import { Loader2, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { useWallet } from "./provider";
import { useUsdcBalance } from "./use-usdc-balance";
import type { WalletKind } from "./types";
import { USDC_FAUCET_URL } from "@/lib/stellar/usdc";

/**
 * Wallet connect/disconnect control. Disconnected: a row of available
 * connectors (today: Freighter). Connected: the account pill + a disconnect
 * button.
 */
export function ConnectButton() {
  const { wallet, connecting, restoring, error, connectors, connect, disconnect, rpcUrl, networkPassphrase, usdcSacId } = useWallet();
  const { formatted: usdcBal, loading: usdcLoading, balance7dp } = useUsdcBalance(
    rpcUrl ?? undefined,
    networkPassphrase,
    usdcSacId ?? undefined,
    wallet?.accountId,
  );
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
        {usdcSacId && (
          <span className="hidden rounded-lg border border-white/[0.06] bg-[#1c1c21] px-2.5 py-1.5 font-mono text-[10px] tabular-nums tracking-tight text-white/55 sm:inline">
            {usdcLoading ? "…" : usdcBal != null ? `${usdcBal} USDC` : "0 USDC"}
            {balance7dp != null && balance7dp <= 0n && (
              <>
                {" · "}
                <Link
                  href={USDC_FAUCET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#d8c69a] underline underline-offset-2"
                >
                  Faucet
                </Link>
              </>
            )}
          </span>
        )}
        <span
          className="max-w-[8.5rem] truncate rounded-xl border border-[#d8c69a]/20 bg-[#1c1c21] px-3 py-1.5 font-mono text-xs text-[#f3efe6] sm:max-w-[10rem]"
          title={wallet.accountId}
        >
          {wallet.label}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void disconnect()}
          aria-label="Disconnect wallet"
          className="size-9 rounded-xl border border-white/[0.06] text-white/45 hover:bg-white/[0.04] hover:text-[#f3efe6]"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    );
  }

  if (restoring) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        className="h-9 rounded-xl border-white/[0.1] bg-transparent font-mono text-[10px] uppercase tracking-[0.14em] text-white/45"
      >
        <Loader2 className="size-4 animate-spin" />
        Wallet
      </Button>
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
              variant="outline"
              disabled={connecting || !ok}
              onClick={() => void connect(c.kind).catch(() => {})}
              title={ok ? `Connect with ${c.name}` : `${c.name} unavailable`}
              className="h-9 rounded-xl border-white/[0.1] bg-[#1c1c21] font-mono text-[10px] uppercase tracking-[0.14em] text-[#f3efe6] hover:border-[#d8c69a]/30 hover:bg-[#d8c69a]/10"
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
