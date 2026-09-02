/**
 * T1 attested resolver — canonical signed-report payload (matches on-chain
 * `resolver-attested::report_message`).
 */
import { Keypair } from "@stellar/stellar-sdk";

export const ATTESTED_REPORT_PREFIX = "\x19Kaido Attested Report v1\x00";

/** Big-endian 16-byte encoding for Soroban `i128`. */
export function i128ToBeBytes(value: bigint): Buffer {
  const buf = Buffer.alloc(16);
  let v = value;
  for (let i = 15; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

export function u64ToBeBytes(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(value);
  return buf;
}

/** Build the exact byte string the contract verifies with `ed25519_verify`. */
export function buildAttestedReportMessage(
  resolverContractId: string,
  valueWad: bigint,
  reportedAt: bigint,
): Buffer {
  return Buffer.concat([
    Buffer.from(ATTESTED_REPORT_PREFIX, "latin1"),
    Buffer.from(resolverContractId, "utf8"),
    i128ToBeBytes(valueWad),
    u64ToBeBytes(reportedAt),
  ]);
}

/** Sign a report with a Stellar keypair (server-side poster or tests). */
export function signAttestedReport(
  secretKey: string,
  resolverContractId: string,
  valueWad: bigint,
  reportedAt: bigint,
): { signature: Buffer; publicKey: string } {
  const kp = Keypair.fromSecret(secretKey);
  const msg = buildAttestedReportMessage(resolverContractId, valueWad, reportedAt);
  return { signature: kp.sign(msg), publicKey: kp.publicKey() };
}
