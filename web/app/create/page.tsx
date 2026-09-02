/**
 * /create — permissionless market-creation wizard (build.md E3).
 */
import { type KaidoConfig } from "@kaido/sdk";

import { CreateMarketHeader } from "@/components/create/create-market-header";
import { ErrorState, Panel } from "@/components/app/kaido-ui";
import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";

import { CreateMarketWizard, type DefaultResolvers } from "./_wizard";

export const dynamic = "force-dynamic";

function ConfigNotice({ children, network }: { children: React.ReactNode; network: string }) {
  return (
    <div className="relative mx-auto w-full max-w-4xl space-y-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.04),transparent_65%)]"
      />
      <div className="relative space-y-6">
        <CreateMarketHeader network={network} />
        <Panel className="px-6 py-8">
          <ErrorState title="Configuration required" body={children} />
        </Panel>
      </div>
    </div>
  );
}

export default function CreateMarketPage() {
  const net = activeNetwork();
  const networkId = activeNetworkId();
  if (!net.rpcUrl) {
    return (
      <ConfigNotice network={networkId}>
        No Stellar RPC URL for network “{networkId}”. Set{" "}
        <code className="font-mono text-[#d8c69a]">RPC_URL</code>.
      </ConfigNotice>
    );
  }
  let deployed: ReturnType<typeof deployedConfig>;
  try {
    deployed = deployedConfig();
  } catch (e) {
    return (
      <ConfigNotice network={networkId}>
        {e instanceof Error ? e.message : "Kaido contracts not configured."}
      </ConfigNotice>
    );
  }
  const usdcSacId = deployed.external.usdcSacId ?? process.env.NEXT_PUBLIC_KAIDO_USDC_SAC;
  if (!usdcSacId) {
    return (
      <ConfigNotice network={networkId}>
        USDC SAC id not configured for network “{networkId}”. Set{" "}
        <code className="font-mono text-[#d8c69a]">external.usdcSacId</code> (settlement SAC) in{" "}
        <code className="font-mono text-[#d8c69a]">config/networks.{networkId}.json</code>.
      </ConfigNotice>
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
    <div className="relative mx-auto w-full max-w-4xl space-y-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.04),transparent_65%)]"
      />

      <div className="relative space-y-6">
        <CreateMarketHeader network={networkId} />
        <CreateMarketWizard config={config} resolvers={resolvers} />
      </div>
    </div>
  );
}
