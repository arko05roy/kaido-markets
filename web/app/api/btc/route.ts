/**
 * `GET /api/btc` — the current BTC/USD price, read live from the configured
 * Reflector SEP-40 oracle feed (the same feed the T0 `resolver-reflector`
 * contract reads at resolution). Server-only so the RPC URL / feed id stay out
 * of the bundle; nothing is hardcoded — the feed id comes from
 * `config/networks.<network>.json` (`external.reflectorFeedId`) or
 * `NEXT_PUBLIC_KAIDO_REFLECTOR_FEED` / `REFLECTOR_FEED_ID`.
 *
 * Response: `{ priceWad: string, price: number, timestamp: number, decimals: number }`
 * or `409` with `{ error }` if the feed isn't configured / has no usable price.
 */
import { NextResponse } from "next/server";
import {
  Contract,
  TransactionBuilder,
  Account,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
  rpc as StellarRpc,
} from "@stellar/stellar-sdk";

import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetwork } from "@/lib/stellar/networks";

export const dynamic = "force-dynamic";

// A throwaway source account for read-only simulation (never submitted).
const SIM_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF5";

function resolveFeedId(): string {
  const fromCfg = (() => {
    try {
      return deployedConfig().external.reflectorFeedId;
    } catch {
      return null;
    }
  })();
  const id =
    fromCfg ?? process.env.NEXT_PUBLIC_KAIDO_REFLECTOR_FEED ?? process.env.REFLECTOR_FEED_ID;
  if (!id) {
    throw new Error(
      "Reflector feed not configured: set external.reflectorFeedId in " +
        "config/networks.<network>.json (written by `make deploy:<network>`) " +
        "or the REFLECTOR_FEED_ID env var.",
    );
  }
  return id;
}

/** `Asset::Other(Symbol("BTC"))` as an ScVal — the SEP-40 enum variant. */
function btcAsset(): xdr.ScVal {
  return xdr.ScVal.scvVec([
    nativeToScVal("Other", { type: "symbol" }),
    nativeToScVal("BTC", { type: "symbol" }),
  ]);
}

async function simulate(
  server: StellarRpc.Server,
  passphrase: string,
  contract: Contract,
  method: string,
  args: xdr.ScVal[],
): Promise<unknown> {
  const tx = new TransactionBuilder(new Account(SIM_SOURCE, "0"), {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (StellarRpc.Api.isSimulationError(sim)) {
    throw new Error(`simulate ${method}: ${sim.error}`);
  }
  const retval = sim.result?.retval;
  return retval ? scValToNative(retval) : undefined;
}

export async function GET() {
  try {
    const net = activeNetwork();
    if (!net.rpcUrl) {
      return NextResponse.json({ error: "No Stellar RPC URL for the active network" }, { status: 409 });
    }
    const feedId = resolveFeedId();
    const server = new StellarRpc.Server(net.rpcUrl, {
      allowHttp: net.rpcUrl.startsWith("http://"),
    });
    const feed = new Contract(feedId);

    const [decimalsRaw, lastPrice] = await Promise.all([
      simulate(server, net.networkPassphrase, feed, "decimals", []),
      simulate(server, net.networkPassphrase, feed, "lastprice", [btcAsset()]),
    ]);

    if (lastPrice == null) {
      return NextResponse.json({ error: "Reflector has no usable BTC price right now" }, { status: 409 });
    }
    const decimals = Number(decimalsRaw ?? 14);
    const pd = lastPrice as { price: bigint; timestamp: bigint };
    const rawPrice = BigInt(pd.price);
    if (rawPrice <= 0n) {
      return NextResponse.json({ error: "Reflector returned a non-positive price" }, { status: 409 });
    }
    // Convert oracle-decimals → WAD (mirrors resolver-reflector::to_wad).
    const priceWad =
      decimals === 18
        ? rawPrice
        : decimals < 18
          ? rawPrice * 10n ** BigInt(18 - decimals)
          : rawPrice / 10n ** BigInt(decimals - 18);

    return NextResponse.json(
      {
        priceWad: priceWad.toString(),
        price: Number(rawPrice) / 10 ** decimals,
        timestamp: Number(pd.timestamp),
        decimals,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to read BTC price" },
      { status: 409 },
    );
  }
}
