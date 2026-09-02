import { rpc } from "@stellar/stellar-sdk";

import { activeNetwork } from "@/lib/stellar/networks";

/** Latest ledger close time (unix seconds) — what Soroban uses for market windows. */
export async function fetchLedgerNowSec(rpcUrl: string): Promise<number | null> {
  try {
    const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
    const latest = await server.getLatestLedger();
    const sec = Number(latest.closeTime);
    return Number.isFinite(sec) ? sec : null;
  } catch {
    return null;
  }
}

/** Ledger now for the active network (SSR pages). */
export async function getLedgerNowSec(): Promise<number | null> {
  const net = activeNetwork();
  return net.rpcUrl ? fetchLedgerNowSec(net.rpcUrl) : null;
}
