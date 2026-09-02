import { NextResponse } from "next/server";

import { getMarketEvents } from "@/lib/indexer";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const events = await getMarketEvents(id, { limit: 40 });
    return NextResponse.json({ events });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load events";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
