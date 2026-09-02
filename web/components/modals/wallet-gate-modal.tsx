"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

import { DemoFaucetButton } from "@/components/wallet/demo-faucet-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clientSettlementAsset } from "@/lib/settlement-asset";
import { USDC_FAUCET_URL } from "@/lib/stellar/usdc";

export type WalletGateMode = "connect" | "no-funds" | "wrong-network";

export function WalletGateModal({
  open,
  mode,
  onOpenChange,
  onConnect,
  connecting,
  networkLabel,
  onFaucetSuccess,
}: {
  open: boolean;
  mode: WalletGateMode;
  onOpenChange: (open: boolean) => void;
  onConnect?: () => void;
  connecting?: boolean;
  networkLabel?: string;
  onFaucetSuccess?: () => void;
}) {
  const settlement = clientSettlementAsset();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {mode === "connect" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect Freighter</DialogTitle>
              <DialogDescription>
                Sign beliefs on Stellar testnet. One wallet, one click.
              </DialogDescription>
            </DialogHeader>
            <p className="text-xs text-white/40">
              Don&apos;t have Freighter?{" "}
              <a
                href="https://www.freighter.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#d8c69a] underline underline-offset-2"
              >
                Install the extension
              </a>
              .
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => onConnect?.()}
                disabled={connecting}
                className="bg-[#f3efe6] text-[#141416] hover:bg-white"
              >
                {connecting ? <Loader2 className="size-4 animate-spin" /> : null}
                Connect Freighter
              </Button>
            </DialogFooter>
          </>
        )}

        {mode === "no-funds" && (
          <>
            <DialogHeader>
              <DialogTitle>You need {settlement.symbol}</DialogTitle>
              <DialogDescription>
                Your wallet balance is 0 {settlement.symbol}. Grab test funds before placing a
                belief.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              {settlement.isDemo ? (
                <DemoFaucetButton
                  symbol={settlement.symbol}
                  issuer={settlement.issuer}
                  onSuccess={() => {
                    onFaucetSuccess?.();
                    onOpenChange(false);
                  }}
                />
              ) : (
                <Button asChild className="bg-[#f3efe6] text-[#141416] hover:bg-white">
                  <a href={USDC_FAUCET_URL} target="_blank" rel="noopener noreferrer">
                    Open faucet
                  </a>
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {mode === "wrong-network" && (
          <>
            <DialogHeader>
              <DialogTitle>Wrong network</DialogTitle>
              <DialogDescription>
                Freighter is on a different network. Switch to{" "}
                <span className="font-mono text-[#d8c69a]">{networkLabel ?? "testnet"}</span> and
                try again.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => onConnect?.()}
                disabled={connecting}
                className="bg-[#f3efe6] text-[#141416] hover:bg-white"
              >
                Retry connect
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TradeErrorModal({
  open,
  message,
  onOpenChange,
  onRetry,
}: {
  open: boolean;
  message: string;
  onOpenChange: (open: boolean) => void;
  onRetry?: () => void;
}) {
  const settlement = clientSettlementAsset();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trade didn&apos;t go through</DialogTitle>
          <DialogDescription className="text-red-300/90">{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {settlement.isDemo ? (
            <DemoFaucetButton symbol={settlement.symbol} issuer={settlement.issuer} />
          ) : (
            <Button variant="outline" asChild>
              <Link href={USDC_FAUCET_URL} target="_blank" rel="noopener noreferrer">
                Get USDC
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Dismiss
          </Button>
          {onRetry && (
            <Button onClick={onRetry} className="bg-[#f3efe6] text-[#141416] hover:bg-white">
              Try again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
