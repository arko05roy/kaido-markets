/**
 * `@kaido/sdk` — TypeScript SDK for Kaido.
 *
 * Sprint 3 (alpha): `createMarket` / `createTrajectoryMarket`, `trade` /
 * `tradeTrajectory`, `addLiquidity` / `removeLiquidity`, `resolve`, `claim`,
 * `getMarket`, `listMarkets`, `subscribeEvents` — all wrapping
 * `@kaido/contract-bindings` (build → simulate → sign → send → poll) over a
 * pluggable signer (passkey-kit, Freighter, or a raw keypair).
 *
 * No `any` in the public surface (DoD §4). Nothing network-specific is
 * hardcoded: callers pass a {@link KaidoConfig} resolved from
 * `config/networks.<network>.json` + env.
 */
import {
  marketFactory,
  registry,
  distributionMarket,
  resolverDesignated,
} from "@kaido/contract-bindings";
import {
  Keypair,
  TransactionBuilder,
  rpc as StellarRpc,
} from "@stellar/stellar-sdk";

export type KaidoNetwork = "local" | "testnet" | "futurenet" | "mainnet";

/** Minimal signer contract — satisfied by Freighter, passkey-kit, and {@link keypairSigner}. */
export interface KaidoSigner {
  /** Stellar account id (G... or C... for a smart wallet) this signer authorizes for. */
  readonly accountId: string;
  /**
   * Sign a transaction envelope XDR, returning the signed XDR (and optionally the
   * signer address — required by some smart-wallet flows). Mirrors the
   * `@stellar/stellar-sdk` `basicNodeSigner` / Freighter `signTransaction` shape.
   */
  signTransaction(
    xdr: string,
    opts?: {
      networkPassphrase?: string;
      address?: string;
      submit?: boolean;
      submitUrl?: string;
    },
  ): Promise<{ signedTxXdr: string; signerAddress?: string }>;
}

/** Network + deployed-contract ids the SDK needs. Resolve these from your app config. */
export interface KaidoConfig {
  readonly network: KaidoNetwork;
  readonly rpcUrl: string;
  readonly networkPassphrase: string;
  readonly contracts: {
    readonly marketFactory: string;
    readonly registry: string;
  };
  /** USDC SAC id for this network (passed through to `DistributionMarket.init`). */
  readonly usdcSacId: string;
}

/** Build a {@link KaidoSigner} from a raw secret seed (server-side / scripts only). */
export function keypairSigner(secret: string): KaidoSigner {
  const kp = Keypair.fromSecret(secret);
  return {
    accountId: kp.publicKey(),
    async signTransaction(xdr, opts) {
      const passphrase = opts?.networkPassphrase;
      if (!passphrase) throw new Error("keypairSigner: networkPassphrase required");
      const tx = TransactionBuilder.fromXDR(xdr, passphrase);
      tx.sign(kp);
      return { signedTxXdr: tx.toXDR(), signerAddress: kp.publicKey() };
    },
  };
}

function clientOptions(config: KaidoConfig, contractId: string, signer?: KaidoSigner) {
  return {
    contractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    allowHttp: config.rpcUrl.startsWith("http://"),
    publicKey: signer?.accountId,
    signTransaction: signer
      ? (xdr: string, opts?: { networkPassphrase?: string }) =>
          signer.signTransaction(xdr, {
            ...opts,
            networkPassphrase: opts?.networkPassphrase ?? config.networkPassphrase,
          })
      : undefined,
  };
}

/**
 * Build → simulate → (if a signer is given) sign+send+poll an assembled tx, and
 * return the typed result. Without a signer it stops after simulation (read /
 * dry-run), which is what `getMarket` and friends use.
 */
async function settle<T>(
  tx: {
    result: T;
    signAndSend: (o: { force?: boolean }) => Promise<{ result: T }>;
  },
  signer: KaidoSigner | undefined,
  _config: KaidoConfig,
  { force = false }: { force?: boolean } = {},
): Promise<T> {
  if (!signer) return tx.result;
  const sent = await tx.signAndSend({ force });
  return sent.result;
}

/** WAD scale (1e18) — the contracts' internal fixed-point unit (ADR-1). */
export const WAD = 1_000_000_000_000_000_000n;
/** USDC has 7 decimals on Stellar; collateral amounts are passed in 7dp units. */
export const USDC_DECIMALS = 7;

export interface CreateMarketArgs {
  k: bigint;
  b: bigint;
  feeBps: number;
  resolver: string;
  tier: distributionMarket.ResolverTier;
  windowOpen: bigint;
  windowLock: bigint;
  windowResolve: bigint;
  /** Initial consensus belief (WAD). */
  mu0: bigint;
  sigma0: bigint;
  /** Enable capped Gaussians (sharp beliefs allowed; Sprint 5). */
  capped?: boolean;
}

export interface CreateTrajectoryMarketArgs
  extends Omit<CreateMarketArgs, "mu0" | "sigma0"> {
  /** Checkpoint timestamps (unix seconds), ascending. */
  checkpoints: bigint[];
  /** Per-checkpoint initial means / sigmas (WAD), same length as `checkpoints`. */
  mus0: bigint[];
  sigmas0: bigint[];
}

/** High-level Kaido client. One instance per network; pass a signer per write call. */
export class Kaido {
  constructor(readonly config: KaidoConfig) {}

  private factory(signer?: KaidoSigner) {
    return new marketFactory.Client(
      clientOptions(this.config, this.config.contracts.marketFactory, signer),
    );
  }
  private registry() {
    return new registry.Client(
      clientOptions(this.config, this.config.contracts.registry),
    );
  }
  /** A client bound to a specific `DistributionMarket` instance. */
  market(marketId: string, signer?: KaidoSigner) {
    return new distributionMarket.Client(
      clientOptions(this.config, marketId, signer),
    );
  }

  // --- factory ------------------------------------------------------------

  /** Deploy + register a scalar Gaussian market. Returns the new market id. */
  async createMarket(args: CreateMarketArgs, signer: KaidoSigner): Promise<string> {
    const tx = await this.factory(signer).create_market({
      creator: signer.accountId,
      k: args.k,
      b: args.b,
      fee_bps: args.feeBps,
      resolver: args.resolver,
      tier: args.tier,
      window_open: args.windowOpen,
      window_lock: args.windowLock,
      window_resolve: args.windowResolve,
      mu0: args.mu0,
      sigma0: args.sigma0,
      capped_flag: args.capped ? 1 : 0,
    });
    return settle(tx, signer, this.config, { force: true });
  }

  /** Deploy + register an N-checkpoint trajectory market. Returns the new market id. */
  async createTrajectoryMarket(
    args: CreateTrajectoryMarketArgs,
    signer: KaidoSigner,
  ): Promise<string> {
    if (
      args.checkpoints.length !== args.mus0.length ||
      args.checkpoints.length !== args.sigmas0.length
    ) {
      throw new Error("checkpoints, mus0 and sigmas0 must have equal length");
    }
    const tx = await this.factory(signer).create_trajectory_market({
      creator: signer.accountId,
      k: args.k,
      b: args.b,
      fee_bps: args.feeBps,
      resolver: args.resolver,
      tier: args.tier,
      checkpoints: args.checkpoints,
      window_open: args.windowOpen,
      window_lock: args.windowLock,
      window_resolve: args.windowResolve,
      mus0: args.mus0,
      sigmas0: args.sigmas0,
    });
    return settle(tx, signer, this.config, { force: true });
  }

  // --- trading ------------------------------------------------------------

  /** Move the scalar belief to `(mu2, sigma2)`. Returns the new position id. */
  async trade(
    marketId: string,
    args: { mu2: bigint; sigma2: bigint; maxCollateral7dp: bigint },
    signer: KaidoSigner,
  ): Promise<bigint> {
    const tx = await this.market(marketId, signer).trade({
      trader: signer.accountId,
      mu2: args.mu2,
      sigma2: args.sigma2,
      max_collateral_7dp: args.maxCollateral7dp,
    });
    return settle(tx, signer, this.config, { force: true });
  }

  /** Move every checkpoint belief. Returns the new trajectory position id. */
  async tradeTrajectory(
    marketId: string,
    args: { mus2: bigint[]; sigmas2: bigint[]; maxCollateral7dp: bigint },
    signer: KaidoSigner,
  ): Promise<bigint> {
    const tx = await this.market(marketId, signer).trade_trajectory({
      trader: signer.accountId,
      mus2: args.mus2,
      sigmas2: args.sigmas2,
      max_collateral_7dp: args.maxCollateral7dp,
    });
    return settle(tx, signer, this.config, { force: true });
  }

  // --- liquidity ----------------------------------------------------------

  /** Add liquidity at scale `scaleYWad` (WAD = 100%). Returns LP shares minted. */
  async addLiquidityScaled(
    marketId: string,
    scaleYWad: bigint,
    signer: KaidoSigner,
  ): Promise<bigint> {
    const tx = await this.market(marketId, signer).add_liquidity({
      lp: signer.accountId,
      scale_y: scaleYWad,
    });
    return settle(tx, signer, this.config, { force: true });
  }

  /** @deprecated Use {@link addLiquidityScaled} — computes scale from a USDC amount. */
  async addLiquidity(marketId: string, amount7dp: bigint, signer: KaidoSigner): Promise<bigint> {
    const free = await this.market(marketId).free_collateral().then((t) => t.result);
    if (free <= 0n) throw new Error("no free collateral for LP");
    const amountWad = amount7dp * 10_000_000_000n;
    let scale = (amountWad * WAD) / BigInt(free);
    if (scale > WAD) scale = WAD;
    if (scale <= 0n) scale = 1n;
    return this.addLiquidityScaled(marketId, scale, signer);
  }

  /** Burn `shares` LP shares. Returns USDC (7dp) returned. */
  async removeLiquidity(marketId: string, shares: bigint, signer: KaidoSigner): Promise<bigint> {
    const tx = await this.market(marketId, signer).remove_liquidity({
      lp: signer.accountId,
      shares,
    });
    return settle(tx, signer, this.config, { force: true });
  }

  /** Treasury claims accrued fee share (7dp USDC). */
  async claimTreasuryFees(marketId: string, signer: KaidoSigner): Promise<bigint> {
    const tx = await this.market(marketId, signer).claim_treasury_fees();
    return settle(tx, signer, this.config, { force: true });
  }

  /** Market creator claims accrued fee share (7dp USDC). */
  async claimCreatorFees(marketId: string, signer: KaidoSigner): Promise<bigint> {
    const tx = await this.market(marketId, signer).claim_creator_fees();
    return settle(tx, signer, this.config, { force: true });
  }

  /**
   * T3 designated resolver: the named reporter posts the outcome (WAD).
   * Call before `resolve()` on the market.
   */
  async reportDesignatedOutcome(
    resolverId: string,
    valueWad: bigint,
    signer: KaidoSigner,
  ): Promise<void> {
    const tx = await new resolverDesignated.Client(
      clientOptions(this.config, resolverId, signer),
    ).report({ reporter: signer.accountId, value: valueWad });
    await settle(tx, signer, this.config, { force: true });
  }

  // --- resolution / claims ------------------------------------------------

  /** Pull the outcome from the market's resolver and finalize it. */
  async resolve(marketId: string, signer: KaidoSigner): Promise<void> {
    const tx = await this.market(marketId, signer).resolve();
    await settle(tx, signer, this.config, { force: true });
  }

  /** Claim a settled scalar position. Returns the payout (7dp). */
  async claim(marketId: string, positionId: bigint, signer: KaidoSigner): Promise<bigint> {
    const tx = await this.market(marketId, signer).claim({ position_id: positionId });
    return settle(tx, signer, this.config, { force: true });
  }

  /** Claim a settled trajectory position. Returns the aggregate payout (7dp). */
  async claimTrajectory(marketId: string, positionId: bigint, signer: KaidoSigner): Promise<bigint> {
    const tx = await this.market(marketId, signer).claim_trajectory({ position_id: positionId });
    return settle(tx, signer, this.config, { force: true });
  }

  // --- reads --------------------------------------------------------------

  /**
   * Live params + state for a market (simulate-only, no signer needed).
   * `beliefs` is the per-checkpoint consensus for a trajectory market, or
   * `[state.belief]` for a scalar market (so callers always get an array).
   */
  async getMarket(marketId: string): Promise<{
    params: distributionMarket.MarketParams;
    state: distributionMarket.MarketState;
    beliefs: distributionMarket.Belief[];
  }> {
    const c = this.market(marketId);
    const [params, state] = await Promise.all([
      c.get_params().then((t) => t.result),
      c.get_state().then((t) => t.result),
    ]);
    let beliefs: distributionMarket.Belief[] = [state.belief];
    if (params.outcome_space.tag === "Trajectory") {
      const raw = (await c.get_beliefs()).result;
      if (Array.isArray(raw) && raw.length > 0) beliefs = raw as distributionMarket.Belief[];
    }
    return { params, state, beliefs };
  }

  /** Every registered market address, oldest first. */
  async listMarkets(): Promise<string[]> {
    return (await this.registry().all()).result;
  }

  /** The registry's indexed summary for a market. */
  async getMarketInfo(marketId: string): Promise<registry.MarketInfo> {
    return (await this.registry().get({ market: marketId })).result;
  }

  // --- events -------------------------------------------------------------

  /**
   * Poll for contract events emitted by `marketId` (or the registry/factory if
   * `marketId` is omitted) since `startLedger`. Calls `onEvent` per event and
   * returns a `stop()` function. RPC keeps ~7 days of events; pass the ledger
   * you last saw to resume. (A websocket/streaming variant lands with the
   * indexer in Sprint 4.)
   */
  subscribeEvents(opts: {
    marketId?: string;
    startLedger: number;
    intervalMs?: number;
    onEvent: (event: StellarRpc.Api.EventResponse) => void;
    onError?: (err: unknown) => void;
  }): { stop: () => void } {
    const server = new StellarRpc.Server(this.config.rpcUrl, {
      allowHttp: this.config.rpcUrl.startsWith("http://"),
    });
    const contractIds = [
      opts.marketId ?? this.config.contracts.registry,
    ];
    let cursorLedger = opts.startLedger;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await server.getEvents({
          startLedger: cursorLedger,
          filters: [{ type: "contract", contractIds }],
        });
        for (const ev of res.events) {
          opts.onEvent(ev);
          cursorLedger = Math.max(cursorLedger, ev.ledger + 1);
        }
      } catch (err) {
        opts.onError?.(err);
      }
      if (!stopped) timer = setTimeout(tick, opts.intervalMs ?? 5_000);
    };
    let timer = setTimeout(tick, 0);
    return {
      stop() {
        stopped = true;
        clearTimeout(timer);
      },
    };
  }
}

export { distributionMarket, marketFactory, registry };
