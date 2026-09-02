import { Kaido, WAD } from "@kaido/sdk";
import { NextResponse } from "next/server";

import { DemoServerError, requireDemoTreasury, treasurySigner } from "@/lib/demo-server";

const MARKET_ID_RE = /^C[A-Z2-7]{55}$/;

/**
 * POST /api/seed-market — testnet demo: treasury LP-seeds a new market (scale = 100%).
 */
export async function POST(req: Request) {
  let marketId: string;
  try {
    const body = (await req.json()) as { marketId?: string };
    marketId = body.marketId ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!MARKET_ID_RE.test(marketId)) {
    return NextResponse.json({ error: "Invalid market contract id." }, { status: 400 });
  }

  try {
    const { secret, config } = requireDemoTreasury();
    const signer = treasurySigner(secret);
    const kaido = new Kaido(config);
    await kaido.addLiquidityScaled(marketId, WAD, signer);
    return NextResponse.json({ ok: true, marketId });
  } catch (e: unknown) {
    if (e instanceof DemoServerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
