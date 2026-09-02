import { NextResponse } from "next/server";

import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";

// Thin BFF route (build.md ADR-10): no secrets, no business logic — just a
// liveness probe that echoes which network this deployment targets.
export const dynamic = "force-dynamic";

export function GET() {
  const id = activeNetworkId();
  const net = activeNetwork();
  return NextResponse.json({
    ok: true,
    network: id,
    networkPassphrase: net.networkPassphrase,
    rpcConfigured: Boolean(net.rpcUrl),
  });
}
