/**
 * Static, public Stellar network parameters used by the web app.
 *
 * Source of truth: https://developers.stellar.org/docs/networks — this file is
 * kept in sync with `config/networks.json` and `contracts/network.toml`
 * (build.md §0a). It deliberately holds **only** static params: passphrases and
 * default RPC/Horizon/Friendbot URLs. Per-network contract ids (the USDC SAC,
 * the Reflector feed, the deployed Kaido contracts, the admin multisig,
 * Launchtube) are NOT here — they are resolved at deploy time and surfaced via
 * the indexer / runtime env. Nothing off-chain may treat a testnet contract id
 * as permanent (testnet resets ~2-4×/year; next: 2026-06-17, 2026-12-16).
 */

export type StellarNetworkId = "local" | "testnet" | "futurenet" | "mainnet";

export interface StellarNetworkConfig {
  /** Network passphrase — must match the target network exactly. */
  readonly networkPassphrase: string;
  /** Default Soroban RPC endpoint (overridable via the `RPC_URL` env var). */
  readonly rpcUrl: string | null;
  /** Horizon endpoint (legacy / historical queries). */
  readonly horizonUrl: string | null;
  /** Friendbot funding endpoint, where one exists. */
  readonly friendbotUrl: string | null;
}

export const STELLAR_NETWORKS: Record<StellarNetworkId, StellarNetworkConfig> = {
  local: {
    networkPassphrase: "Standalone Network ; February 2017",
    rpcUrl: "http://localhost:8000/rpc",
    horizonUrl: "http://localhost:8000",
    friendbotUrl: "http://localhost:8000/friendbot",
  },
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    friendbotUrl: "https://friendbot.stellar.org",
  },
  futurenet: {
    networkPassphrase: "Test SDF Future Network ; October 2022",
    rpcUrl: "https://rpc-futurenet.stellar.org",
    horizonUrl: "https://horizon-futurenet.stellar.org",
    friendbotUrl: "https://friendbot-futurenet.stellar.org",
  },
  mainnet: {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    // Mainnet has no canonical public RPC/Horizon — configure a third-party
    // provider via env (https://developers.stellar.org/docs/data/apis/rpc/providers).
    rpcUrl: null,
    horizonUrl: null,
    friendbotUrl: null,
  },
};

/** Which network this process targets, from `STELLAR_NETWORK` (default: local). */
export function activeNetworkId(): StellarNetworkId {
  const v = process.env.STELLAR_NETWORK;
  if (v === "testnet" || v === "futurenet" || v === "mainnet" || v === "local") {
    return v;
  }
  return "local";
}

/** Resolved config for the active network, with env overrides applied. */
export function activeNetwork(): StellarNetworkConfig {
  const base = STELLAR_NETWORKS[activeNetworkId()];
  return {
    ...base,
    rpcUrl: process.env.RPC_URL ?? base.rpcUrl,
    horizonUrl: process.env.HORIZON_URL ?? base.horizonUrl,
    friendbotUrl: process.env.FRIENDBOT_URL ?? base.friendbotUrl,
  };
}
