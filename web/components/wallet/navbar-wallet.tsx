"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, LogOut, Wallet, ChevronDown } from "lucide-react";

import { useWallet } from "./provider";
import type { WalletKind } from "./types";

/**
 * Compact navbar wallet trigger. Disconnected → single ink pill
 * ("Connect wallet") that opens a small popover of available
 * connectors. Connected → account pill + disconnect.
 */
export function NavbarWallet() {
  const {
    wallet,
    connecting,
    restoring,
    error,
    connectors,
    connect,
    disconnect,
  } = useWallet();
  const [available, setAvailable] = useState<Record<WalletKind, boolean> | null>(null);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (restoring) {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0b0b0c]/10 px-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#0b0b0c]/50">
        <Loader2 className="size-3.5 animate-spin" />
        Wallet
      </span>
    );
  }

  if (wallet) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          title={wallet.accountId}
          className="inline-flex h-9 items-center rounded-full bg-[#0b0b0c] px-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#f3efe6]"
        >
          {wallet.label}
        </span>
        <button
          onClick={() => void disconnect()}
          aria-label="Disconnect wallet"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#0b0b0c]/60 transition-colors hover:bg-[#0b0b0c]/5 hover:text-[#0b0b0c]"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={popRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={connecting}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0b0b0c] pl-3.5 pr-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[#f3efe6] transition-colors hover:bg-[#1a1a1c] disabled:opacity-60"
      >
        {connecting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Wallet className="size-3.5" />
        )}
        Connect
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-60 origin-top-right overflow-hidden rounded-2xl border border-black/10 bg-[#f3efe6] p-1.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.55)]">
          <div className="px-3 pb-2 pt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#0b0b0c]/50">
            Choose a wallet
          </div>
          <div className="flex flex-col">
            {connectors.map((c) => {
              const ok = available?.[c.kind] ?? false;
              return (
                <button
                  key={c.kind}
                  disabled={!ok || connecting}
                  onClick={() => {
                    setOpen(false);
                    void connect(c.kind).catch(() => {});
                  }}
                  className="group flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#0b0b0c]/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="flex items-center gap-2.5">
                    <Wallet className="size-4 text-[#0b0b0c]/60 group-hover:text-[#0b0b0c]" />
                    <span className="text-sm font-medium text-[#0b0b0c]">
                      {c.name.replace(/\s*\(.*?\)/, "")}
                    </span>
                  </span>
                  {!ok && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#0b0b0c]/40">
                      n/a
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {error && (
            <p className="px-3 py-2 text-[11px] text-red-600">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
