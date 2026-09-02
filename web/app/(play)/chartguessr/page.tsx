/**
 * ChartGuessr route (build.md E12). Server component: resolves the live network
 * + deployed-contract config (nothing hardcoded — `config/networks.<network>.json`
 * via `deployedConfig()`), reads the configured ChartGuessr market off-chain,
 * and hands both to the client game wrapped in a `WalletProvider`.
 *
 * `force-dynamic` — no build-time RPC, and a testnet reset must not bake stale
 * ids into the bundle.
 */
import { Kaido, type KaidoConfig } from "@kaido/sdk";

import { WalletProvider } from "@/components/wallet/provider";
import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";

import { ChartGuessrGame, type ChartGuessrMarket } from "./_game";

export const dynamic = "force-dynamic";

function ConfigNotice({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">ChartGuessr</h1>
      <p className="max-w-xl text-sm text-muted-foreground">{children}</p>
    </main>
  );
}

async function loadMarket(kaido: Kaido, address: string): Promise<ChartGuessrMarket | null> {
  try {
    const c = kaido.market(address);
    const [params, checkpoints, beliefs] = await Promise.all([
      c.get_params().then((t) => t.result),
      c.get_checkpoints().then((t) => t.result as bigint[]),
      c.get_beliefs().then((t) => t.result as Array<{ mu: bigint }>),
    ]);
    const cps = (checkpoints.length ? checkpoints : []).map((x) => Number(x));
    return {
      address,
      kWad: params.k.toString(),
      bWad: params.b.toString(),
      checkpoints: cps,
      consensusMusWad: beliefs.map((b) => b.mu.toString()).slice(0, Math.max(cps.length, 1)),
      windowOpen: Number(params.window.open),
      windowLock: Number(params.window.lock),
      windowResolve: Number(params.window.resolve),
    };
  } catch {
    return null;
  }
}

export default async function ChartGuessrPage() {
  const net = activeNetwork();
  const networkId = activeNetworkId();
  if (!net.rpcUrl) {
    return (
      <ConfigNotice>
        No Stellar RPC URL for network “{networkId}”. Set <code className="font-mono">RPC_URL</code>.
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
        USDC SAC id not configured for network “{networkId}”. Set <code className="font-mono">external.usdcSacId</code> in{" "}
        <code className="font-mono">config/networks.{networkId}.json</code> (or{" "}
        <code className="font-mono">NEXT_PUBLIC_KAIDO_USDC_SAC</code>).
      </ConfigNotice>
    );
  }

  const config: KaidoConfig = {
    network: networkId,
    rpcUrl: net.rpcUrl,
    networkPassphrase: net.networkPassphrase,
    contracts: {
      marketFactory: deployed.contracts.marketFactory,
      registry: deployed.contracts.registry,
    },
    usdcSacId,
  };

  const kaido = new Kaido(config);
  const marketAddress =
    process.env.NEXT_PUBLIC_CHARTGUESSR_MARKET ?? deployed.demo.chartGuessrMarket ?? null;
  const market = marketAddress ? await loadMarket(kaido, marketAddress) : null;

  return (
    <main className="flex flex-1 flex-col p-6 sm:p-8">
      <WalletProvider network={networkId} networkPassphrase={net.networkPassphrase}>
        <ChartGuessrGame config={config} market={market} />
      </WalletProvider>
    </main>
  );
}
