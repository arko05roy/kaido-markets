import { NextResponse } from "next/server";

import { saveMarketQuestionToStore } from "@/lib/market-metadata-store";
import { activeNetworkId } from "@/lib/stellar/networks";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { question?: string };
  try {
    body = (await req.json()) as { question?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (question.length > 280) {
    return NextResponse.json({ error: "question must be 280 characters or fewer" }, { status: 400 });
  }

  try {
    const saved = saveMarketQuestionToStore(activeNetworkId(), id, question);
    return NextResponse.json({ ok: true, ...saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed to save metadata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
