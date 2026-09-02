import { NextResponse } from "next/server";

import { getMarketState } from "@/lib/stellar/kaido";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { state } = await getMarketState(id);
    return NextResponse.json({
      muWad: state.belief.mu.toString(),
      sigmaWad: state.belief.sigma.toString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to read crowd";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
