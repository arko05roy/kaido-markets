/**
 * Read USDC SAC balance for a Stellar account via Soroban RPC simulation.
 * No mocks — hits the deployed SAC contract on the live network.
 */
import {
  Address,
  Contract,
  rpc as StellarRpc,
  scValToBigInt,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

/** Testnet USDC issuer (classic asset code USDC). */
export const TESTNET_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export const USDC_FAUCET_URL = "https://faucet.circle.com/";

/**
 * Simulate `token.balance(id)` on the USDC SAC. Returns balance in 7-decimal
 * stroops, or `null` if the account has no balance entry / simulation fails
 * (often missing trustline).
 */
export async function fetchUsdcBalance7dp(
  rpcUrl: string,
  networkPassphrase: string,
  usdcSacId: string,
  accountId: string,
): Promise<bigint | null> {
  const server = new StellarRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  try {
    const account = await server.getAccount(accountId);
    const contract = new Contract(usdcSacId);
    const tx = new TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase,
    })
      .addOperation(contract.call("balance", new Address(accountId).toScVal()))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (StellarRpc.Api.isSimulationError(sim)) return null;
    const retval = sim.result?.retval;
    if (!retval) return null;
    return scValToBigInt(retval);
  } catch {
    return null;
  }
}

/** Format 7-decimal USDC for display. */
export function formatUsdcBalance(amount7dp: bigint): string {
  const neg = amount7dp < 0n;
  const abs = neg ? -amount7dp : amount7dp;
  const whole = abs / 10_000_000n;
  const frac = abs % 10_000_000n;
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${fracStr ? "." + fracStr : ""}`;
}
