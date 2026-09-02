/**
 * Server-only helpers for KAIDO demo mode (faucet, market seed).
 */
import { type KaidoConfig, keypairSigner } from "@kaido/sdk";

import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";

export function requireDemoTreasury(): { secret: string; config: KaidoConfig } {
  const treasurySecret = process.env.KAIDO_TREASURY_SECRET_KEY;
  if (!treasurySecret) {
    throw new DemoServerError("Treasury not configured (KAIDO_TREASURY_SECRET_KEY missing).", 503);
  }

  const networkId = activeNetworkId();
  if (networkId !== "testnet") {
    throw new DemoServerError("Demo treasury ops are testnet-only.", 403);
  }

  let deployed;
  try {
    deployed = deployedConfig();
  } catch {
    throw new DemoServerError("Deploy config missing.", 503);
  }
  if (!deployed.external.demoMode || !deployed.external.usdcSacId) {
    throw new DemoServerError("Demo treasury ops require KAIDO demo mode.", 403);
  }

  const net = activeNetwork();
  if (!net.rpcUrl) {
    throw new DemoServerError("No RPC URL for active network.", 503);
  }

  const config: KaidoConfig = {
    network: networkId,
    rpcUrl: net.rpcUrl,
    networkPassphrase: net.networkPassphrase,
    contracts: {
      marketFactory: deployed.contracts.marketFactory,
      registry: deployed.contracts.registry,
    },
    usdcSacId: deployed.external.usdcSacId,
  };

  return { secret: treasurySecret, config };
}

export function treasurySigner(secret: string) {
  return keypairSigner(secret);
}

export class DemoServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DemoServerError";
  }
}
