import { NextResponse } from "next/server";

import { FeeSponsorshipError, sponsorKaidoTransaction } from "@/lib/stellar/fee-sponsorship";
import { activeNetwork } from "@/lib/stellar/networks";

export const runtime = "nodejs";

const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;

/** Sponsors only an already user-signed, allow-listed Kaido transaction. */
export async function POST(req: Request) {
  const sponsorSecret = process.env.KAIDO_FEE_SPONSOR_SECRET;
  const allowedContractId = process.env.KAIDO_FEE_SPONSOR_CONTRACT_ID;
  if (!sponsorSecret || !allowedContractId || !CONTRACT_ID_RE.test(allowedContractId)) {
    return NextResponse.json({ error: "Fee sponsorship is not configured." }, { status: 503 });
  }
  let signedInnerTxXdr = "";
  try {
    const body = (await req.json()) as { signedInnerTxXdr?: string };
    signedInnerTxXdr = body.signedInnerTxXdr ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!signedInnerTxXdr || signedInnerTxXdr.length > 100_000) {
    return NextResponse.json({ error: "Invalid signed transaction." }, { status: 400 });
  }
  try {
    const network = activeNetwork();
    const sponsoredTxXdr = sponsorKaidoTransaction({
      signedInnerTxXdr,
      sponsorSecret,
      allowedContractId,
      networkPassphrase: network.networkPassphrase,
      maxInnerFeeStroops: BigInt(process.env.KAIDO_FEE_SPONSOR_MAX_FEE_STROOPS ?? "2000000"),
      baseFeeStroops: process.env.KAIDO_FEE_SPONSOR_BASE_FEE_STROOPS ?? "100000",
    });
    return NextResponse.json({ sponsoredTxXdr });
  } catch (error) {
    const message = error instanceof FeeSponsorshipError ? error.message : "Unable to sponsor transaction.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
