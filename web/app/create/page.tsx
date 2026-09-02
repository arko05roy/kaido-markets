/**
 * /create — permissionless market-creation wizard (build.md E3).
 */
import { type KaidoConfig } from "@kaido/sdk";

import { AppShell, ErrorState, PageEyebrow, PageTitle } from "@/components/app/kaido-ui";
import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";

import { CreateMarketWizard, type DefaultResolvers } from "./_wizard";

export const dynamic = "force-dynamic";

function ConfigNotice({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="space-y-5">
        <PageEyebrow>Launch</PageEyebrow>
        <PageTitle title="Set up a market" />
        <ErrorState title="Configuration required" body={children} />
      </div>
    </AppShell>
  );
}

export default function CreateMarketPage() {
  const net = activeNetwork();
  const networkId = activeNetworkId();
  if (!net.rpcUrl) {
    return (
      <ConfigNotice>
        No Stellar RPC URL for network “{networkId}”. Set <code className="font-mono text-[#d8c69a]">RPC_URL</code>.
      </ConfigNotice>
    );
  }
  let deployed: ReturnType<typeof deployedConfig>;
  try {
    deployed = deployedConfig();
  } catch (e) {
    return <ConfigNotice>{e instanceof Error ? e.message : "Kaido contracts not configured."}</ConfigNotice>;
  }
  const usdcSacId = deployed.external.usdcSacId ?? process.env.NEXT_PUBLIC_KAIDO_USDC_SAC;
  if (!usdcSacId) {
    return (
      <ConfigNotice>
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
    <AppShell>
      <div className="space-y-10">
        <div className="space-y-5">
          <PageEyebrow>Launch · {networkId}</PageEyebrow>
          <PageTitle
            title={
              <>
                Set the <span className="text-white/40">question</span>
              </>
            }
            subtitle="Pick what traders will call, seed where the crowd starts, and choose when trading opens and settles. No probability homework — just the market setup."
          />
        </div>
        <CreateMarketWizard config={config} resolvers={resolvers} />
      </div>
    </AppShell>
  );
}
