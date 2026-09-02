import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

import { buildAttestedReportMessage, signAttestedReport } from "@kaido/sdk";

const execFileAsync = promisify(execFile);

async function posterSecret(): Promise<string | null> {
  if (process.env.ATTESTED_POSTER_SECRET_KEY) {
    return process.env.ATTESTED_POSTER_SECRET_KEY;
  }
  const keyName = process.env.ATTESTED_POSTER_KEY_NAME ?? process.env.DEPLOYER_KEY_NAME;
  if (!keyName) return null;
  try {
    const { stdout } = await execFileAsync("stellar", ["keys", "secret", keyName], {
      timeout: 10_000,
    });
    const secret = stdout.trim();
    return secret.startsWith("S") ? secret : null;
  } catch {
    return null;
  }
}

/**
 * Off-chain T1 poster — signs attested reports with a server-held key.
 * POST { resolverId, value, reportedAt? } → { value, reportedAt, signature (hex) }
 *
 * Configure either ATTESTED_POSTER_SECRET_KEY or ATTESTED_POSTER_KEY_NAME
 * (falls back to DEPLOYER_KEY_NAME — reads via `stellar keys secret`).
 */
export async function POST(req: Request) {
  const secret = await posterSecret();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Configure ATTESTED_POSTER_SECRET_KEY or import your wallet with stellar keys add and set ATTESTED_POSTER_KEY_NAME / DEPLOYER_KEY_NAME",
      },
      { status: 503 },
    );
  }

  let body: { resolverId?: string; value?: number; reportedAt?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const resolverId = body.resolverId?.trim();
  const value = body.value;
  if (!resolverId || typeof value !== "number" || !Number.isFinite(value)) {
    return NextResponse.json(
      { error: "resolverId and numeric value are required" },
      { status: 400 },
    );
  }

  const reportedAt = Math.floor(body.reportedAt ?? Date.now() / 1000);
  const valueWad = BigInt(Math.round(value * 1e18));
  const reportedAtBig = BigInt(reportedAt);

  const { signature, publicKey } = signAttestedReport(
    secret,
    resolverId,
    valueWad,
    reportedAtBig,
  );

  // Sanity: message matches what the contract hashes.
  buildAttestedReportMessage(resolverId, valueWad, reportedAtBig);

  return NextResponse.json({
    resolverId,
    value,
    valueWad: valueWad.toString(),
    reportedAt,
    posterPublicKey: publicKey,
    signature: signature.toString("hex"),
  });
}
