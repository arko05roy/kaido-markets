import { NextResponse } from "next/server";

import { getBeliefs, getMarketState } from "@/lib/stellar/kaido";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { params: mp, state } = await getMarketState(id);
    if (mp.outcome_space.tag === "Trajectory") {
      const beliefs = await getBeliefs(id);
      if (beliefs.length === 0) {
        return NextResponse.json({
          kind: "trajectory",
          musWad: [state.belief.mu.toString()],
          sigmasWad: [state.belief.sigma.toString()],
        });
      }
      return NextResponse.json({
        kind: "trajectory",
        musWad: beliefs.map((b) => b.mu.toString()),
        sigmasWad: beliefs.map((b) => b.sigma.toString()),
      });
    }
    return NextResponse.json({
      kind: "scalar",
      muWad: state.belief.mu.toString(),
      sigmaWad: state.belief.sigma.toString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to read crowd";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
