"use client";

import { clientSettlementAsset } from "@/lib/settlement-asset";
import { USDC_FAUCET_URL } from "@/lib/stellar/usdc";

import { DemoFaucetButton } from "./demo-faucet-button";
import { useWallet } from "./provider";
import { useUsdcBalance } from "./use-usdc-balance";

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

/** Settlement SAC balance + faucet affordance for navbars. */
export function SettlementWalletChip({
  variant = "dark",
  onFaucetSuccess,
}: {
  variant?: ChipVariant;
  onFaucetSuccess?: () => void;
}) {
  const { wallet, rpcUrl, usdcSacId, networkPassphrase } = useWallet();
  const settlement = clientSettlementAsset();
  const sym = settlement.symbol;

  const { balance7dp, formatted, loading, refresh } = useUsdcBalance(
    rpcUrl ?? undefined,
    networkPassphrase,
    usdcSacId ?? undefined,
    wallet?.accountId,
  );

  if (!wallet || !usdcSacId) return null;

  const afterFaucet = () => {
    refresh();
    onFaucetSuccess?.();
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <BalanceChip symbol={sym} formatted={formatted} loading={loading} variant={variant} />
      {settlement.isDemo ? (
        <DemoFaucetButton symbol={sym} issuer={settlement.issuer} onSuccess={afterFaucet} compact />
      ) : balance7dp != null && balance7dp <= 0n ? (
        <a
          href={USDC_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#d8c69a] underline underline-offset-2"
        >
          Faucet
        </a>
      ) : null}
    </div>
  );
}
