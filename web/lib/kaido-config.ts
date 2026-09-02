import { type KaidoConfig } from "@kaido/sdk";

import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";

export function buildKaidoConfig(): KaidoConfig | null {
  try {
    const net = activeNetwork();
    if (!net.rpcUrl) return null;
    const d = deployedConfig();
    const usdcSacId = d.external.usdcSacId ?? process.env.NEXT_PUBLIC_KAIDO_USDC_SAC;
    if (!usdcSacId) return null;
    return {
      network: activeNetworkId(),
      rpcUrl: net.rpcUrl,
      networkPassphrase: net.networkPassphrase,
      contracts: { marketFactory: d.contracts.marketFactory, registry: d.contracts.registry },
      usdcSacId,
    };
  } catch {
    return null;
  }
}
