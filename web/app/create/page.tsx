/**
 * /create — permissionless market-creation wizard (build.md E3). Server
 * component: resolves the live network + deployed-contract config (nothing
 * hardcoded — `config/networks.<network>.json` via `deployedConfig()`),
 * pre-fills the default resolver address per tier, and renders the client
 * wizard inside a `WalletProvider`. `force-dynamic` (no build-time RPC).
 */
import { type KaidoConfig } from "@kaido/sdk";

import { WalletProvider } from "@/components/wallet/provider";
import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";

import { CreateMarketWizard, type DefaultResolvers } from "./_wizard";

export const dynamic = "force-dynamic";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">Create a market</h1>
      <p className="max-w-xl text-sm text-muted-foreground">{children}</p>
    </main>
  );
}

export default function CreateMarketPage() {
  const net = activeNetwork();
  const networkId = activeNetworkId();
  if (!net.rpcUrl) {
    return (
      <Notice>
        No Stellar RPC URL for network “{networkId}”. Set <code className="font-mono">RPC_URL</code>.
      </Notice>
    );
  }
  let deployed: ReturnType<typeof deployedConfig>;
  try {
    deployed = deployedConfig();
  } catch (e) {
    return <Notice>{e instanceof Error ? e.message : "Kaido contracts not configured."}</Notice>;
  }
  const usdcSacId = deployed.external.usdcSacId ?? process.env.NEXT_PUBLIC_KAIDO_USDC_SAC;
  if (!usdcSacId) {
    return (
      <Notice>
        USDC SAC id not configured for network “{networkId}”. Set <code className="font-mono">external.usdcSacId</code> in{" "}
        <code className="font-mono">config/networks.{networkId}.json</code>.
      </Notice>
    );
  }

  const config: KaidoConfig = {
    network: networkId,
    rpcUrl: net.rpcUrl,
    networkPassphrase: net.networkPassphrase,
    contracts: { marketFactory: deployed.contracts.marketFactory, registry: deployed.contracts.registry },
    usdcSacId,
  };
  const resolvers: DefaultResolvers = {
    reflector: deployed.contracts.resolverReflector,
    attested: deployed.contracts.resolverAttested,
    optimistic: deployed.contracts.resolverOptimistic,
    designated: deployed.contracts.resolverDesignated,
  };

  return (
    <main className="flex flex-1 flex-col p-6 sm:p-8">
      <WalletProvider network={networkId} networkPassphrase={net.networkPassphrase}>
        <CreateMarketWizard config={config} resolvers={resolvers} />
      </WalletProvider>
    </main>
  );
}
