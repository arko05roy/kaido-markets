/**
 * /create — permissionless market-creation wizard (build.md E3).
 */
import { type KaidoConfig } from "@kaido/sdk";

import { DashboardPageHeader } from "@/components/app/dashboard-page-header";
import { ErrorState, Panel } from "@/components/app/kaido-ui";
import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";

import { CreateMarketWizard, type DefaultResolvers } from "./_wizard";

export const dynamic = "force-dynamic";

function ConfigNotice({ children, network }: { children: React.ReactNode; network: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <DashboardPageHeader
        title="Create market"
        description="Configure a new range market on Stellar."
        network={network}
      />
      <Panel className="px-6 py-8">
        <ErrorState title="Configuration required" body={children} />
      </Panel>
    </div>
  );
}

export default function CreateMarketPage() {
  const net = activeNetwork();
  const networkId = activeNetworkId();
  if (!net.rpcUrl) {
    return (
      <ConfigNotice network={networkId}>
        No Stellar RPC URL for network “{networkId}”. Set <code className="font-mono text-[#d8c69a]">RPC_URL</code>.
      </ConfigNotice>
    );
  }
  let deployed: ReturnType<typeof deployedConfig>;
  try {
    deployed = deployedConfig();
  } catch (e) {
    return <ConfigNotice network={networkId}>{e instanceof Error ? e.message : "Kaido contracts not configured."}</ConfigNotice>;
  }
  const usdcSacId = deployed.external.usdcSacId ?? process.env.NEXT_PUBLIC_KAIDO_USDC_SAC;
  if (!usdcSacId) {
    return (
      <ConfigNotice network={networkId}>
        USDC SAC id not configured for network “{networkId}”. Set{" "}
        <code className="font-mono text-[#d8c69a]">external.usdcSacId</code> in{" "}
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
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <DashboardPageHeader
        title="Create market"
        description="Set the question, seed the crowd curve, and choose when trading opens and settles."
        network={networkId}
      />
      <CreateMarketWizard config={config} resolvers={resolvers} />
    </div>
  );
}
