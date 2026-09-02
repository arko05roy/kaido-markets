/**
 * Read-only HouseVault views via Soroban simulation (no mocks).
 */
import { houseVault } from "@kaido/contract-bindings";

import { activeNetwork } from "@/lib/stellar/networks";

export async function getHouseExposure(
  vaultId: string,
  marketId: string,
): Promise<bigint | null> {
  const net = activeNetwork();
  if (!net.rpcUrl) return null;
  try {
    const client = new houseVault.Client({
      contractId: vaultId,
      networkPassphrase: net.networkPassphrase,
      rpcUrl: net.rpcUrl,
      publicKey: marketId,
    });
    const tx = await client.exposure({ market: marketId }, { simulate: true });
    return typeof tx.result === "bigint" ? tx.result : null;
  } catch {
    return null;
  }
}

export async function getHouseCap(vaultId: string, marketId: string): Promise<bigint | null> {
  const net = activeNetwork();
  if (!net.rpcUrl) return null;
  try {
    const client = new houseVault.Client({
      contractId: vaultId,
      networkPassphrase: net.networkPassphrase,
      rpcUrl: net.rpcUrl,
      publicKey: marketId,
    });
    const tx = await client.cap({ market: marketId }, { simulate: true });
    return typeof tx.result === "bigint" ? tx.result : null;
  } catch {
    return null;
  }
}

/** Format 7dp USDC for display. */
export function fmtHouseUsdc(amount7dp: bigint): string {
  const whole = amount7dp / 10_000_000n;
  const frac = amount7dp % 10_000_000n;
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}${fracStr ? "." + fracStr : ""}`;
}
