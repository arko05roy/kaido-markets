#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  Address,
  Contract,
  Horizon,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc as StellarRpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

const root = path.resolve(process.cwd());
const count = Number.parseInt(process.argv[2] ?? "15", 10);
const network = process.env.STELLAR_NETWORK ?? "testnet";
const walletPrefix = process.env.DEMO_WALLET_PREFIX ?? "kaido-demo-wallet";
const marketId = process.env.DEMO_MARKET_ID ?? "";
const rpcUrl = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";
const manifestPath = process.env.DEMO_WALLET_MANIFEST ?? path.join(root, "docs", "demo-wallets.testnet.md");
const activityPath =
  process.env.DEMO_ACTIVITY_MANIFEST ?? path.join(root, "docs", "demo-wallet-activity.testnet.md");
const maxCollateral7dp = BigInt(process.env.DEMO_MAX_COLLATERAL_7DP ?? "30000000");
const faucetAmount7dp = BigInt(process.env.KAIDO_FAUCET_AMOUNT_7DP ?? "500000000000");
const friendbotUrl = process.env.FRIENDBOT_URL ?? "https://friendbot.stellar.org";
const explorerBase = process.env.STELLAR_EXPERT_BASE ?? "https://stellar.expert/explorer/testnet";
const passphrase = network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

if (!Number.isInteger(count) || count < 15) {
  throw new Error("count must be an integer >= 15");
}
if (!marketId) {
  throw new Error("DEMO_MARKET_ID is required");
}

const treasurySecret = process.env.KAIDO_TREASURY_SECRET_KEY;
if (!treasurySecret) {
  throw new Error("KAIDO_TREASURY_SECRET_KEY is required in .env");
}

const cfg = JSON.parse(await fs.readFile(path.join(root, "web", "config", `networks.${network}.json`), "utf8"));
const sacId = cfg?.external?.usdcSacId;
const issuer = cfg?.external?.kaidoIssuer;
const settlementSymbol = cfg?.external?.settlementSymbol ?? "KAIDO";
if (!sacId || !issuer) {
  throw new Error(`missing settlement asset config in web/config/networks.${network}.json`);
}

const horizonUrl =
  network === "mainnet" ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
const horizon = new Horizon.Server(horizonUrl);
const rpc = new StellarRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
const treasury = Keypair.fromSecret(treasurySecret);

function cli(args) {
  return execFileSync("stellar", args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  }).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function accountExists(accountId) {
  try {
    await rpc.getAccount(accountId);
    return true;
  } catch {
    return false;
  }
}

async function friendbotFund(accountId) {
  const url = new URL(friendbotUrl);
  url.searchParams.set("addr", accountId);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : typeof body?.title === "string"
          ? body.title
          : `friendbot failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

async function submitContractTx(source, operation) {
  const account = await rpc.getAccount(source.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: "500000",
    networkPassphrase: passphrase,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarRpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error ?? "simulation failed");
  }

  const assembled = StellarRpc.assembleTransaction(tx, sim).build();
  assembled.sign(source);
  const sent = await rpc.sendTransaction(assembled);
  if (sent.status !== "PENDING" && sent.status !== "DUPLICATE") {
    throw new Error(`send failed with status ${sent.status}`);
  }

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const txResult = await rpc.getTransaction(sent.hash);
    if (txResult.status === "SUCCESS") {
      let returnValue = null;
      if (txResult.returnValue) {
        if (typeof txResult.returnValue === "string" || Buffer.isBuffer(txResult.returnValue)) {
          const scVal = xdr.ScVal.fromXDR(txResult.returnValue, "base64");
          returnValue = scValToNative(scVal);
        } else {
          returnValue = scValToNative(txResult.returnValue);
        }
      }
      return { hash: sent.hash, returnValue };
    }
    if (txResult.status === "FAILED") {
      throw new Error(`transaction failed on-chain: ${sent.hash}`);
    }
    await sleep(1000);
  }

  throw new Error(`timed out waiting for ${sent.hash}`);
}

async function hasTrustline(accountId) {
  const account = await horizon.loadAccount(accountId);
  return account.balances.some(
    (balance) =>
      balance.asset_type !== "native" &&
      balance.asset_code === settlementSymbol &&
      balance.asset_issuer === issuer,
  );
}

async function ensureTrustline(wallet) {
  if (await hasTrustline(wallet.address)) return null;
  return submitContractTx(
    wallet.keypair,
    new Contract(sacId).call("trust", new Address(wallet.address).toScVal()),
  );
}

async function fundKaido(wallet) {
  return submitContractTx(
    treasury,
    new Contract(sacId).call(
      "transfer",
      new Address(treasury.publicKey()).toScVal(),
      new Address(wallet.address).toScVal(),
      nativeToScVal(faucetAmount7dp, { type: "i128" }),
    ),
  );
}

function parseMarketState() {
  const raw = cli([
    "contract",
    "invoke",
    "--id",
    marketId,
    "--network",
    network,
    "--source-account",
    process.env.DEPLOYER_KEY_NAME ?? "kaido-wallet",
    "--send=no",
    "--",
    "get_state",
  ]);
  const state = JSON.parse(raw);
  const status =
    typeof state.status === "string"
      ? state.status
      : state.status && typeof state.status === "object"
        ? Object.keys(state.status)[0]
        : "";
  if (status !== "Open") {
    throw new Error(`market ${marketId} is not open`);
  }
  return {
    mu: BigInt(state.belief.mu),
    sigma: BigInt(state.belief.sigma),
  };
}

async function trade(wallet, mu2, sigma2) {
  return submitContractTx(
    wallet.keypair,
    new Contract(marketId).call(
      "trade",
      new Address(wallet.address).toScVal(),
      nativeToScVal(mu2, { type: "i128" }),
      nativeToScVal(sigma2, { type: "i128" }),
      nativeToScVal(maxCollateral7dp, { type: "i128" }),
    ),
  );
}

function txLink(hash) {
  return `${explorerBase}/tx/${hash}`;
}

function walletLink(accountId) {
  return `${explorerBase}/account/${accountId}`;
}

const wallets = Array.from({ length: count }, (_, index) => {
  const keyName = `${walletPrefix}-${index + 1}`;
  const secret = cli(["keys", "secret", keyName]);
  const address = cli(["keys", "address", keyName]);
  return { index: index + 1, keyName, keypair: Keypair.fromSecret(secret), address };
});

const state = parseMarketState();
const centerIndex = Math.ceil(count / 2);
const results = [];

for (const wallet of wallets) {
  const offset = BigInt(wallet.index - centerIndex) * 200_000_000_000_000_000n;
  const sigmaBump = BigInt((wallet.index - 1) % 3) * 100_000_000_000_000_000n;
  const mu2 = state.mu + offset;
  const sigma2 = state.sigma + sigmaBump;

  try {
    console.log(`[${wallet.index}/${count}] ${wallet.keyName}: preparing`);

    let friendbot = null;
    if (!(await accountExists(wallet.address))) {
      friendbot = await friendbotFund(wallet.address);
    }

    const trustTx = await ensureTrustline(wallet);
    const fundingTx = await fundKaido(wallet);
    const tradeTx = await trade(wallet, mu2, sigma2);

    results.push({
      index: wallet.index,
      keyName: wallet.keyName,
      address: wallet.address,
      friendbotHash: friendbot?.hash ?? null,
      trustHash: trustTx?.hash ?? null,
      fundingHash: fundingTx.hash,
      tradeHash: tradeTx.hash,
      positionId:
        tradeTx.returnValue === null || tradeTx.returnValue === undefined
          ? null
          : tradeTx.returnValue.toString(),
      mu2: mu2.toString(),
      sigma2: sigma2.toString(),
    });

    console.log(`[${wallet.index}/${count}] ${wallet.keyName}: traded ${tradeTx.hash}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${wallet.keyName} failed: ${message}`);
  }
}

await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(
  manifestPath,
  [
    `# Demo wallets (Stellar ${network})`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| # | Wallet | Address | Explorer |",
    "|---:|---|---|---|",
    ...results.map(
      (item) =>
        `| ${item.index} | \`${item.keyName}\` | \`${item.address}\` | [account](${walletLink(item.address)}) |`,
    ),
    "",
  ].join("\n"),
);

await fs.writeFile(
  activityPath,
  [
    `# Demo wallet activity (Stellar ${network})`,
    "",
    `Market: \`${marketId}\``,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| # | Wallet | Address | Friendbot | Trustline | KAIDO funding | Market trade | Position |",
    "|---:|---|---|---|---|---|---|---:|",
    ...results.map((item) => {
      const friendbotCell = item.friendbotHash ? `[tx](${txLink(item.friendbotHash)})` : "existing";
      const trustCell = item.trustHash ? `[tx](${txLink(item.trustHash)})` : "existing";
      return `| ${item.index} | \`${item.keyName}\` | \`${item.address}\` | ${friendbotCell} | ${trustCell} | [tx](${txLink(item.fundingHash)}) | [tx](${txLink(item.tradeHash)}) | ${item.positionId ?? "-"} |`;
    }),
    "",
    "## Trade inputs",
    "",
    `- Max collateral per wallet: \`${maxCollateral7dp.toString()}\` (7dp units)`,
    `- KAIDO drip per wallet: \`${faucetAmount7dp.toString()}\` (7dp units)`,
    `- Market explorer: [${marketId}](${walletLink(marketId).replace("/account/", "/contract/")})`,
    "",
  ].join("\n"),
);

console.log(`Wrote ${manifestPath}`);
console.log(`Wrote ${activityPath}`);
