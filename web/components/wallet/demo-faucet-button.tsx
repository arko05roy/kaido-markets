"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useWallet } from "@/components/wallet/provider";

export function DemoFaucetButton({
  symbol = "KAIDO",
  issuer,
  onSuccess,
  compact,
}: {
  symbol?: string;
  issuer?: string;
  onSuccess?: () => void;
  compact?: boolean;
}) {
  const { wallet } = useWallet();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!wallet) return null;

  const claim = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: wallet.accountId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        amount?: string;
        symbol?: string;
        error?: string;
        needsTrustline?: boolean;
        issuerWallet?: boolean;
        issuer?: string;
      };
      if (!res.ok) {
        if (data.issuerWallet) {
          toast({
            title: "Use a trading wallet",
            description: data.error ?? "The KAIDO issuer account cannot hold KAIDO.",
            variant: "error",
          });
        } else if (data.needsTrustline && (data.issuer ?? issuer)) {
          toast({
            title: `Add ${symbol} trustline`,
            description: `In Freighter, trust ${symbol} issued by ${(data.issuer ?? issuer)!.slice(0, 8)}… then retry.`,
            variant: "error",
          });
        } else {
          toast({
            title: "Faucet failed",
            description: data.error ?? "Try again.",
            variant: "error",
          });
        }
        return;
      }
      toast({
        title: `${data.amount ?? ""} ${data.symbol ?? symbol} sent`,
        description: "Balance updates in a few seconds.",
      });
      onSuccess?.();
    } catch {
      toast({ title: "Faucet failed", description: "Network error.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void claim()}
      className={
        compact
          ? "h-8 rounded-lg border-[#d8c69a]/35 bg-transparent px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#d8c69a] hover:bg-[#d8c69a]/10"
          : "border-[#d8c69a]/30 text-[11px] uppercase tracking-[0.14em] text-[#d8c69a]"
      }
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {compact ? "Faucet" : `Get demo ${symbol}`}
    </Button>
  );
}
