"use client";

import { clientSettlementAsset } from "@/lib/settlement-asset";
import { TESTNET_USDC_ISSUER, USDC_FAUCET_URL } from "@/lib/stellar/usdc";

import { DemoFaucetButton } from "./demo-faucet-button";
import { useWallet } from "./provider";
import { useClassicAssetBalance } from "./use-classic-asset-balance";

type ChipVariant = "dark" | "light";

function BalanceChip({
  symbol,
  formatted,
  loading,
  variant,
}: {
  symbol: string;
  formatted: string | null;
  loading: boolean;
  variant: ChipVariant;
}) {
  const shell =
    variant === "light"
      ? "border-[#0b0b0c]/10 bg-[#f3efe6]/80 text-[#0b0b0c]/70"
      : "border-white/[0.08] bg-[#1c1c21] text-white/60";

  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2.5 py-1.5 font-mono text-[10px] tabular-nums tracking-tight ${shell}`}
      title={`${symbol} balance`}
    >
      {loading ? "…" : `${formatted ?? "—"} ${symbol}`}
    </span>
  );
}

/**
 * Settlement balance + faucet affordance for navbars.
 * Demo mode: KAIDO + Circle USDC via Horizon (matches Freighter).
 */
export function SettlementWalletChip({
  variant = "dark",
  onFaucetSuccess,
}: {
  variant?: ChipVariant;
  onFaucetSuccess?: () => void;
}) {
  const { wallet, horizonUrl, usdcSacId } = useWallet();
  const settlement = clientSettlementAsset();

  const kaidoBal = useClassicAssetBalance(
    horizonUrl ?? undefined,
    settlement.isDemo ? settlement.symbol : undefined,
    settlement.issuer,
    wallet?.accountId,
  );
  const usdcBal = useClassicAssetBalance(
    horizonUrl ?? undefined,
    "USDC",
    TESTNET_USDC_ISSUER,
    wallet?.accountId,
  );

  if (!wallet || !usdcSacId) return null;

  const afterFaucet = () => {
    kaidoBal.refresh();
    onFaucetSuccess?.();
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {settlement.isDemo ? (
        <>
          <BalanceChip
            symbol={settlement.symbol}
            formatted={kaidoBal.formatted}
            loading={kaidoBal.loading}
            variant={variant}
          />
          <BalanceChip
            symbol="USDC"
            formatted={usdcBal.formatted}
            loading={usdcBal.loading}
            variant={variant}
          />
          <DemoFaucetButton
            symbol={settlement.symbol}
            issuer={settlement.issuer}
            onSuccess={afterFaucet}
            compact
          />
        </>
      ) : (
        <>
          <BalanceChip
            symbol={settlement.symbol}
            formatted={usdcBal.formatted}
            loading={usdcBal.loading}
            variant={variant}
          />
          {usdcBal.balance7dp != null && usdcBal.balance7dp <= 0n ? (
            <a
              href={USDC_FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#d8c69a] underline underline-offset-2"
            >
              Faucet
            </a>
          ) : null}
        </>
      )}
    </div>
  );
}
