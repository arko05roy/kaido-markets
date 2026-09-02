/**
 * SDK integration test — drives `@kaido/sdk` against a live Stellar RPC, using
 * the contracts recorded in `config/networks.<network>.json` (written by
 * `make deploy:<network>`). Covers "create → register → read … resolve" via the
 * SDK only.
 *
 * Gated: skipped unless `KAIDO_INTEGRATION=1` (it needs network + a deployed
 * suite, and writes a fresh market each run — fine on testnet, which resets).
 * The *write* path additionally needs `KAIDO_INTEGRATION_SECRET` = a funded
 * testnet account's secret seed; without it only the read path runs. The
 * settlement asset (USDC) and a per-account trustline are NOT required for
 * `createMarket` / `resolve` — only `add_liquidity` / `trade` / `claim` move
 * USDC, so the create→register→read→resolve loop is fully exercisable here.
 *
 * Run:  KAIDO_INTEGRATION=1 pnpm --filter @kaido/sdk test
 *       KAIDO_INTEGRATION=1 KAIDO_INTEGRATION_SECRET=S... pnpm --filter @kaido/sdk test
 *       KAIDO_INTEGRATION=1 KAIDO_INTEGRATION_LIFECYCLE=1 KAIDO_INTEGRATION_SECRET=S... pnpm --filter @kaido/sdk test
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  Address,
  Contract,
  rpc as StellarRpc,
  scValToBigInt,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, it, expect, beforeAll } from "vitest";

import { Kaido, keypairSigner, type KaidoConfig, distributionMarket } from "../src/index";

const ENABLED = process.env.KAIDO_INTEGRATION === "1";
const SECRET = process.env.KAIDO_INTEGRATION_SECRET;
const LIFECYCLE = process.env.KAIDO_INTEGRATION_LIFECYCLE === "1";
const NETWORK = (process.env.STELLAR_NETWORK ?? "testnet") as KaidoConfig["network"];

interface NetworksFile {
  networkPassphrase: string;
  rpcUrl: string;
  external?: { usdcSacId?: string | null };
  contracts: Record<string, { id: string }>;
  fixtures?: {
    lifecycleMarket?: string;
    demoMarket?: string;
  };
}

function loadNetworksFile(): NetworksFile {
  const file = join(process.cwd(), "..", "..", "config", `networks.${NETWORK}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as NetworksFile;
}

function loadConfig(): KaidoConfig {
  const raw = loadNetworksFile();
  const usdc = raw.external?.usdcSacId ?? "";
  return {
    network: NETWORK,
    rpcUrl: raw.rpcUrl,
    networkPassphrase: raw.networkPassphrase,
    contracts: { marketFactory: raw.contracts.marketFactory.id, registry: raw.contracts.registry.id },
    usdcSacId: usdc || "C".padEnd(56, "A"),
  };
}

async function usdcBalance7dp(
  rpcUrl: string,
  passphrase: string,
  sacId: string,
  accountId: string,
): Promise<bigint | null> {
  const server = new StellarRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  try {
    const account = await server.getAccount(accountId);
    const contract = new Contract(sacId);
    const tx = new TransactionBuilder(account, { fee: "100000", networkPassphrase: passphrase })
      .addOperation(contract.call("balance", new Address(accountId).toScVal()))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (StellarRpc.Api.isSimulationError(sim) || !sim.result?.retval) return null;
    return scValToBigInt(sim.result.retval);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntilResolved(
  kaido: Kaido,
  marketId: string,
  resolveAfterSec: bigint,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { state, params } = await kaido.getMarket(marketId);
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (state.status.tag === "Resolved" || state.status.tag === "ResolvedVec") return;
    if (now >= resolveAfterSec) return;
    if (state.status.tag === "Locked" && now >= params.window.resolve) return;
    await sleep(15_000);
  }
  throw new Error(`timed out waiting for market ${marketId} to reach resolve window`);
}

describe.skipIf(!ENABLED)("@kaido/sdk integration (live RPC)", () => {
  let kaido: Kaido;
  let config: KaidoConfig;

  beforeAll(() => {
    config = loadConfig();
    kaido = new Kaido(config);
  });

  it("lists registered markets and reads each one", async () => {
    const addrs = await kaido.listMarkets();
    expect(Array.isArray(addrs)).toBe(true);
    expect(addrs.length).toBeGreaterThan(0);
    for (const addr of addrs.slice(0, 4)) {
      const info = await kaido.getMarketInfo(addr);
      expect(info.market).toBe(addr);
      const { params, state, beliefs } = await kaido.getMarket(addr);
      expect(typeof params.k).toBe("bigint");
      expect(typeof params.b).toBe("bigint");
      expect(["Open", "Locked", "Resolved", "ResolvedVec", "Disputable"]).toContain(state.status.tag);
      expect(Array.isArray(beliefs)).toBe(true);
      // a trajectory market reports one belief per checkpoint; a scalar one reports ≥1.
      if (params.outcome_space.tag === "Trajectory") {
        expect(beliefs.length).toBe(params.outcome_space.values[0].length);
      } else {
        expect(beliefs.length).toBeGreaterThanOrEqual(1);
      }
    }
  }, 30_000);

  it("polls contract events without error", async () => {
    const server = new StellarRpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith("http://") });
    const latest = await server.getLatestLedger();
    const errors: unknown[] = [];
    let seen = 0;
    const sub = kaido.subscribeEvents({
      startLedger: Math.max(1, latest.sequence - 200),
      intervalMs: 1_000,
      onEvent: () => {
        seen += 1;
      },
      onError: (e) => errors.push(e),
    });
    await new Promise((r) => setTimeout(r, 3_000));
    sub.stop();
    expect(errors).toEqual([]);
    expect(seen).toBeGreaterThanOrEqual(0); // may legitimately be 0 in a quiet window
  }, 15_000);

  it.skipIf(!SECRET)("creates a market via the SDK and reads it back from the registry", async () => {
    const signer = keypairSigner(SECRET as string);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const k = 1_000_000_000_000_000_000n; // 1 (WAD)
    const b = 100_000_000_000_000_000_000n; // 100 (WAD)
    const beforeCount = (await kaido.listMarkets()).length;

    const newId = await kaido.createMarket(
      {
        k,
        b,
        feeBps: 30,
        // any resolver address is fine — it's only *called* at resolve(); use the registry id as a stand-in.
        resolver: config.contracts.registry,
        tier: distributionMarket.ResolverTier.Designated,
        windowOpen: now,
        windowLock: now + 3_600n,
        windowResolve: now + 7_200n,
        mu0: 50_000_000_000_000_000_000n, // 50 (WAD)
        sigma0: 1_000_000_000_000_000_000n, // 1 (WAD)
      },
      signer,
    );

    expect(typeof newId).toBe("string");
    expect(newId.startsWith("C")).toBe(true);
    expect(newId.length).toBe(56);

    // registered:
    const after = await kaido.listMarkets();
    expect(after).toContain(newId);
    expect(after.length).toBe(beforeCount + 1);

    // registry entry + on-chain params reflect what we passed:
    const info = await kaido.getMarketInfo(newId);
    expect(info.market).toBe(newId);
    expect(info.creator).toBe(signer.accountId);
    expect(info.tier).toBe(distributionMarket.ResolverTier.Designated);

    const { params, state } = await kaido.getMarket(newId);
    expect(params.k).toBe(k);
    expect(params.b).toBe(b);
    expect(params.fee_bps).toBe(30);
    expect(params.window.resolve).toBe(now + 7_200n);
    expect(state.status.tag).toBe("Open");
    expect(state.belief.mu).toBe(50_000_000_000_000_000_000n);
  }, 120_000);

  it.skipIf(!SECRET || !LIFECYCLE)(
    "trade → resolve (Reflector) → claim on fixtures.lifecycleMarket",
    async () => {
      const signer = keypairSigner(SECRET as string);
      const nets = loadNetworksFile();
      const marketId = nets.fixtures?.lifecycleMarket;
      if (!marketId) {
        throw new Error(
          "fixtures.lifecycleMarket missing — run make deploy:testnet && make seed:testnet",
        );
      }
      const bal = await usdcBalance7dp(
        config.rpcUrl,
        config.networkPassphrase,
        config.usdcSacId,
        signer.accountId,
      );
      if (bal == null || bal < 1_000_000n) {
        throw new Error(
          `KAIDO_INTEGRATION_SECRET account needs a USDC trustline + balance (have ${bal ?? "none"})`,
        );
      }

      const { params, state } = await kaido.getMarket(marketId);
      expect(params.outcome_space.tag).toBe("Scalar");
      if (state.status.tag !== "Open") {
        throw new Error(`lifecycle market status is ${state.status.tag} — re-run make seed:testnet`);
      }

      const mu2 = state.belief.mu + 1_000_000_000_000_000_000n;
      const sigma2 = state.belief.sigma;
      const positionId = await kaido.trade(
        marketId,
        { mu2, sigma2, maxCollateral7dp: 5_000_000n },
        signer,
      );
      expect(positionId).toBeGreaterThan(0n);

      await waitUntilResolved(kaido, marketId, params.window.resolve, 12 * 60_000);

      await kaido.resolve(marketId, signer);
      const after = await kaido.getMarket(marketId);
      expect(["Resolved", "ResolvedVec", "Disputable"]).toContain(after.state.status.tag);

      const payout = await kaido.claim(marketId, positionId, signer);
      expect(payout).toBeGreaterThanOrEqual(0n);
    },
    15 * 60_000,
  );
});
