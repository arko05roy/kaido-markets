import {
  Keypair,
  Networks,
  TransactionBuilder,
  Contract,
  rpc as StellarRpc,
  nativeToScVal,
  Address,
} from "@stellar/stellar-sdk";
import { NextResponse } from "next/server";

import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetworkId } from "@/lib/stellar/networks";

const TESTNET_PASSPHRASE = Networks.TESTNET;

/** Per-claim demo drip (7-dp units). Default 50,000 KAIDO. */
const DEFAULT_CLAIM_7DP = 500_000_000_000n;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function faucetErrorFromSimulation(msg: string): {
  error: string;
  needsTrustline?: boolean;
  issuerWallet?: boolean;
} {
  if (msg.includes("trustline entry is missing") || msg.includes("Trust")) {
    return { error: "Approve the KAIDO trustline in Freighter, then retry.", needsTrustline: true };
  }
  if (msg.includes("operation invalid on issuer")) {
    return {
      error:
        "This wallet is the KAIDO issuer and cannot hold KAIDO. Import a separate testnet account in Freighter for trading.",
      issuerWallet: true,
    };
  }
  return { error: msg };
}

/**
 * POST /api/faucet — testnet-only KAIDO drip via SAC transfer (treasury signs).
 */
export async function POST(req: Request) {
  if (activeNetworkId() !== "testnet") {
    return NextResponse.json({ error: "Faucet is testnet-only." }, { status: 403 });
  }

  let accountId: string;
  try {
    const body = (await req.json()) as { accountId?: string };
    accountId = body.accountId ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!/^G[A-Z2-7]{55}$/.test(accountId)) {
    return NextResponse.json({ error: "Invalid Stellar account id." }, { status: 400 });
  }

  const treasurySecret = process.env.KAIDO_TREASURY_SECRET_KEY;
  if (!treasurySecret) {
    return NextResponse.json(
      { error: "Faucet not configured (KAIDO_TREASURY_SECRET_KEY missing)." },
      { status: 503 },
    );
  }

  let config;
  try {
    config = deployedConfig();
  } catch {
    return NextResponse.json({ error: "Deploy config missing." }, { status: 503 });
  }
  if (!config.external.demoMode || !config.external.usdcSacId) {
    return NextResponse.json({ error: "Faucet only runs in KAIDO demo mode." }, { status: 403 });
  }

  const sacId = config.external.usdcSacId;
  const symbol = config.external.settlementSymbol ?? "KAIDO";
  const issuer = config.external.kaidoIssuer ?? config.deployer;
  const claim7dp = BigInt(process.env.KAIDO_FAUCET_AMOUNT_7DP ?? DEFAULT_CLAIM_7DP);
  const rpcUrl = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";

  if (accountId === issuer) {
    return NextResponse.json(
      {
        error:
          "This wallet is the KAIDO issuer and cannot hold KAIDO. Import a separate testnet account in Freighter for trading.",
        issuerWallet: true,
        issuer,
        symbol,
      },
      { status: 400 },
    );
  }

  const treasury = Keypair.fromSecret(treasurySecret);
  const server = new StellarRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });

  try {
    const treasuryId = treasury.publicKey();
    const transferTx = new Contract(sacId).call(
      "transfer",
      new Address(treasuryId).toScVal(),
      new Address(accountId).toScVal(),
      nativeToScVal(claim7dp, { type: "i128" }),
    );
    const acct = await server.getAccount(treasuryId);
    const built = new TransactionBuilder(acct, {
      fee: "500000",
      networkPassphrase: TESTNET_PASSPHRASE,
    })
      .addOperation(transferTx)
      .setTimeout(60)
      .build();

    const sim = await server.simulateTransaction(built);
    if (StellarRpc.Api.isSimulationError(sim)) {
      const parsed = faucetErrorFromSimulation(sim.error ?? "Simulation failed.");
      return NextResponse.json(
        { ...parsed, issuer, symbol },
        { status: parsed.needsTrustline ? 409 : parsed.issuerWallet ? 400 : 502 },
      );
    }

    const signed = StellarRpc.assembleTransaction(built, sim).build();
    signed.sign(treasury);
    const sent = await server.sendTransaction(signed);
    if (sent.status !== "PENDING" && sent.status !== "DUPLICATE") {
      return NextResponse.json({ error: `Transfer submit failed: ${sent.status}` }, { status: 502 });
    }

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const tx = await server.getTransaction(sent.hash);
      if (tx.status === "SUCCESS") {
        const amount = (Number(claim7dp) / 1e7).toString();
        return NextResponse.json({ ok: true, amount, symbol, hash: sent.hash });
      }
      if (tx.status === "FAILED") {
        return NextResponse.json({ error: "Transfer failed on-chain.", hash: sent.hash }, { status: 502 });
      }
      await sleep(1000);
    }

    const amount = (Number(claim7dp) / 1e7).toString();
    return NextResponse.json({ ok: true, amount, symbol, hash: sent.hash, pending: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const parsed = faucetErrorFromSimulation(msg);
    return NextResponse.json(
      { ...parsed, issuer, symbol },
      { status: parsed.needsTrustline ? 409 : 502 },
    );
  }
}
