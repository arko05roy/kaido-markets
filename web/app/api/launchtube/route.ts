/**
 * `POST /api/launchtube` — submit a signed transaction XDR via Launchtube.
 *
 * Launchtube sponsors the network fee for passkey-signed (smart-wallet) txs so
 * a brand-new player needs no XLM. The Launchtube JWT is a server secret — it
 * lives in `LAUNCHTUBE_JWT` and never reaches the browser; the passkey
 * connector POSTs the signed XDR here and we forward it. Endpoint + JWT are
 * per-network config (build.md §0a) — nothing hardcoded.
 *
 * Body: `{ xdr: string }`. Response: `{ hash: string }` or an error status.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = process.env.LAUNCHTUBE_URL;
  const jwt = process.env.LAUNCHTUBE_JWT;
  if (!url || !jwt) {
    return NextResponse.json(
      { error: "Launchtube not configured: set LAUNCHTUBE_URL and LAUNCHTUBE_JWT" },
      { status: 501 },
    );
  }
  let xdr: string;
  try {
    const body = (await req.json()) as { xdr?: unknown };
    if (typeof body.xdr !== "string" || body.xdr.length === 0) {
      throw new Error("missing `xdr`");
    }
    xdr = body.xdr;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "invalid request body" },
      { status: 400 },
    );
  }

  const form = new URLSearchParams({ xdr });
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Launchtube unreachable: ${e instanceof Error ? e.message : e}` },
      { status: 502 },
    );
  }
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: `Launchtube ${res.status}: ${text}` }, { status: 502 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { hash: text.trim() };
  }
  const hash =
    parsed && typeof parsed === "object" && "hash" in parsed
      ? String((parsed as { hash: unknown }).hash)
      : undefined;
  if (!hash) {
    return NextResponse.json({ error: "Launchtube returned no transaction hash" }, { status: 502 });
  }
  return NextResponse.json({ hash });
}
