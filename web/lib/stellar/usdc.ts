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
  xdr,
} from "@stellar/stellar-sdk";

/** Stellar classic max amount (7dp stroops) — not a real SAC balance. */
const STELLAR_MAX_AMOUNT = 9_223_372_036_854_775_807n;

function balanceFromScVal(retval: xdr.ScVal): bigint | null {
  try {
    const n = scValToBigInt(retval);
    if (n < 0n || n >= STELLAR_MAX_AMOUNT) return 0n;
    return n;
  } catch {
    return null;
  }
}

/** Testnet USDC issuer (classic asset code USDC). */
export const TESTNET_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

/** Circle testnet USDC SAC (Blend pool reserve; independent of KAIDO demo settlement). */
export const TESTNET_CIRCLE_USDC_SAC =
  "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU";

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
    return balanceFromScVal(retval);
  } catch {
    return null;
  }
}

/** Format 7-decimal stroops for display. */
export function formatUsdcBalance(amount7dp: bigint): string {
  const neg = amount7dp < 0n;
  const abs = neg ? -amount7dp : amount7dp;
  const whole = abs / 10_000_000n;
  const frac = abs % 10_000_000n;
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${fracStr ? "." + fracStr : ""}`;
}

function parseClassicBalance7dp(balance: string): bigint {
  const neg = balance.startsWith("-");
  const raw = neg ? balance.slice(1) : balance;
  const [whole, frac = ""] = raw.split(".");
  const frac7 = (frac + "0000000").slice(0, 7);
  const n = BigInt(whole || "0") * 10_000_000n + BigInt(frac7 || "0");
  return neg ? -n : n;
}

/**
 * Classic (Horizon) balance for a specific asset — matches Freighter display.
 * Returns 0 when the trustline is missing; null on fetch failure.
 */
export async function fetchClassicAssetBalance7dp(
  horizonUrl: string,
  accountId: string,
  assetCode: string,
  assetIssuer: string,
): Promise<bigint | null> {
  const base = horizonUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/accounts/${accountId}`);
    if (res.status === 404) return 0n;
    if (!res.ok) return null;
    const data = (await res.json()) as {
      balances: Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
      }>;
    };
    const row = data.balances.find(
      (b) =>
        b.asset_type !== "native" &&
        b.asset_code === assetCode &&
        b.asset_issuer === assetIssuer,
    );
    if (!row) return 0n;
    return parseClassicBalance7dp(row.balance);
  } catch {
    return null;
  }
}
