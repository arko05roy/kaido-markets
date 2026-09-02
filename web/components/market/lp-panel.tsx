"use client";

import { Kaido, type KaidoConfig, WAD } from "@kaido/sdk";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LpConfirmModal } from "@/components/modals/claim-modals";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/provider";
import { useUsdcBalance } from "@/components/wallet/use-usdc-balance";
import { fromWad } from "@/lib/curve";

export interface LpMarketView {
  id: string;
  bWad: string;
  canAdd: boolean;
  canRemove: boolean;
}

function fmt7dp(stroops: bigint): string {
  const n = Number(stroops) / 1e7;
  return n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

export function LpPanel({ config, market }: { config: KaidoConfig; market: LpMarketView }) {
  const { wallet } = useWallet();
  const { balance7dp: usdcBal } = useUsdcBalance(
    config.rpcUrl,
    config.networkPassphrase,
    config.usdcSacId,
    wallet?.accountId,
  );
  const kaido = useMemo(() => new Kaido(config), [config]);

  const [pool, setPool] = useState<bigint>(0n);
  const [totalShares, setTotalShares] = useState<bigint>(0n);
  const [feePool, setFeePool] = useState<bigint>(0n);
  const [myShares, setMyShares] = useState<bigint>(0n);
  const [freeWad, setFreeWad] = useState<bigint>(0n);
  const [scalePct, setScalePct] = useState("25");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<"add" | "remove" | null>(null);

  const refresh = useCallback(async () => {
    const c = kaido.market(market.id);
    const [ps, shares, pending] = await Promise.all([
      c.pool_state().then((t) => t.result),
      wallet ? c.lp_shares({ lp: wallet.accountId }).then((t) => t.result) : Promise.resolve(0n),
      c.free_collateral().then((t) => t.result),
    ]);
    setPool(BigInt(ps[0]));
    setTotalShares(BigInt(ps[1]));
    setFeePool(BigInt(ps[2]));
    setMyShares(BigInt(shares));
    setFreeWad(BigInt(pending));
  }, [kaido, market.id, wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const scaleWad = useMemo(() => {
    const pct = Number(scalePct);
    if (!Number.isFinite(pct) || pct <= 0) return 0n;
    return BigInt(Math.min(100, Math.floor(pct))) * (WAD / 100n);
  }, [scalePct]);

  const estDeposit7dp = useMemo(() => {
    if (freeWad <= 0n || scaleWad <= 0n) return 0n;
    const depositWad = (scaleWad * freeWad) / WAD;
    return depositWad / 10_000_000_000n;
  }, [freeWad, scaleWad]);

  const sharePct =
    myShares > 0n && totalShares > 0n
      ? `${((Number(myShares) / Number(totalShares)) * 100).toFixed(1)}%`
      : "—";

  const addLp = async () => {
    if (!wallet || scaleWad <= 0n) return;
    setBusy(true);
    setError(null);
    setLastTx(null);
    try {
      await kaido.addLiquidityScaled(market.id, scaleWad, wallet.signer);
      setLastTx("Liquidity added");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "add liquidity failed");
    } finally {
      setBusy(false);
      setConfirmMode(null);
    }
  };

  const removeLp = async () => {
    if (!wallet || myShares <= 0n) return;
    setBusy(true);
    setError(null);
    setLastTx(null);
    try {
      const out = await kaido.removeLiquidity(market.id, myShares, wallet.signer);
      setLastTx(`Withdrew ${fmt7dp(out)} USDC`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "remove liquidity failed");
    } finally {
      setBusy(false);
      setConfirmMode(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="kaido-section-title">Liquidity</h2>
      <dl className="mb-5 mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Pool collateral</dt>
          <dd className="text-[#f3efe6]">{fromWad(pool / 10_000_000_000n).toFixed(4)} USDC</dd>
        </div>
        <div className="flex justify-between">
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Free to LP</dt>
          <dd className="text-[#f3efe6]">{fromWad(freeWad).toFixed(4)} / {fromWad(BigInt(market.bWad)).toFixed(4)} USDC</dd>
        </div>
        <div className="flex justify-between">
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Your shares</dt>
          <dd className="text-[#f3efe6]">{sharePct}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Accrued LP fees</dt>
          <dd className="text-[#f3efe6]">{fromWad(feePool / 10_000_000_000n).toFixed(6)} USDC</dd>
        </div>
        {wallet && usdcBal != null && (
          <div className="flex justify-between">
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Your USDC</dt>
            <dd className="font-mono text-[#f3efe6]">{fmt7dp(usdcBal)}</dd>
          </div>
        )}
      </dl>

      {market.canAdd && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Scale (% of free)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={scalePct}
              onChange={(e) => setScalePct(e.target.value)}
              className="kaido-input mt-1.5 block w-24"
            />
          </label>
          <span className="text-xs text-white/40">≈ {fmt7dp(estDeposit7dp)} USDC</span>
          <Button
            type="button"
            disabled={!wallet || busy || scaleWad <= 0n}
            onClick={() => setConfirmMode("add")}
            className="rounded-full bg-[#f3efe6] text-[#0b0b0c] hover:bg-white"
          >
            Add liquidity
          </Button>
        </div>
      )}

      {market.canRemove && myShares > 0n && (
        <Button
          type="button"
          variant="outline"
          disabled={!wallet || busy}
          onClick={() => setConfirmMode("remove")}
          className="border-white/20 text-[#f3efe6] hover:bg-white/5"
        >
          Remove all LP shares
        </Button>
      )}

      {!wallet && <p className="text-sm text-white/45">Connect Freighter to add or remove liquidity.</p>}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      {lastTx && <p className="text-sm text-white/50">{lastTx}</p>}

      <LpConfirmModal
        open={confirmMode != null}
        onOpenChange={(v) => !v && setConfirmMode(null)}
        mode={confirmMode ?? "add"}
        amountLabel={
          confirmMode === "add"
            ? `Add ≈ ${fmt7dp(estDeposit7dp)} USDC (${scalePct}% of free pool)`
            : `Remove all shares (${sharePct} of pool)`
        }
        warning={confirmMode === "remove" ? "This burns your entire LP position on this market." : undefined}
        onConfirm={() => void (confirmMode === "add" ? addLp() : removeLp())}
        confirming={busy}
      />
    </div>
  );
}
