import { NextResponse } from "next/server";

import { saveMarketQuestionToStore } from "@/lib/market-metadata-store";
import { activeNetworkId } from "@/lib/stellar/networks";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: {
    question?: string;
    marketStyle?: string;
    outcomeMin?: number;
    outcomeMax?: number;
    divisions?: number[];
    divisionLabels?: string[];
    optionLow?: string;
    optionHigh?: string;
  };
  try {
    body = (await req.json()) as typeof body;
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
    const saved = await saveMarketQuestionToStore(activeNetworkId(), id, {
      question,
      ...(body.marketStyle === "binary" || body.marketStyle === "kaido"
        ? { marketStyle: body.marketStyle }
        : {}),
      ...(typeof body.outcomeMin === "number" ? { outcomeMin: body.outcomeMin } : {}),
      ...(typeof body.outcomeMax === "number" ? { outcomeMax: body.outcomeMax } : {}),
      ...(Array.isArray(body.divisions) ? { divisions: body.divisions } : {}),
      ...(Array.isArray(body.divisionLabels)
        ? { divisionLabels: body.divisionLabels.map((s) => String(s).trim()) }
        : {}),
      ...(typeof body.optionLow === "string" ? { optionLow: body.optionLow.trim() } : {}),
      ...(typeof body.optionHigh === "string" ? { optionHigh: body.optionHigh.trim() } : {}),
    });
    return NextResponse.json({ ok: true, ...saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed to save metadata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
