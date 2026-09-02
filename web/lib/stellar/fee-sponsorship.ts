import {
  Address,
  FeeBumpTransaction,
  Keypair,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const SPONSORED_METHODS = new Set([
  "trade",
  "trade_trajectory",
  "add_liquidity",
  "remove_liquidity",
  "claim",
  "claim_trajectory",
]);

export class FeeSponsorshipError extends Error {}

export interface SponsorRequest {
  readonly signedInnerTxXdr: string;
  readonly sponsorSecret: string;
  readonly allowedContractId: string;
  readonly networkPassphrase: string;
  readonly maxInnerFeeStroops: bigint;
  readonly baseFeeStroops: string;
  readonly now?: number;
}

function contractAndMethod(tx: Transaction): { contractId: string; method: string } {
  if (tx.operations.length !== 1) {
    throw new FeeSponsorshipError("Only one Kaido contract invocation may be sponsored.");
  }
  const operation = tx.toEnvelope().v1().tx().operations()[0];
  if (operation.body().switch().name !== "invokeHostFunction") {
    throw new FeeSponsorshipError("Only Soroban contract invocations may be sponsored.");
  }
  const hostFunction = operation.body().invokeHostFunctionOp().hostFunction();
  if (hostFunction.switch().name !== "hostFunctionTypeInvokeContract") {
    throw new FeeSponsorshipError("Only direct contract calls may be sponsored.");
  }
  const invoke = hostFunction.invokeContract();
  return {
    contractId: Address.fromScAddress(invoke.contractAddress()).toString(),
    method: invoke.functionName().toString(),
  };
}

/** Wrap a user-signed, allow-listed Kaido transaction in a fee-bump envelope. */
export function sponsorKaidoTransaction(request: SponsorRequest): string {
  const parsed = TransactionBuilder.fromXDR(request.signedInnerTxXdr, request.networkPassphrase);
  if (parsed instanceof FeeBumpTransaction) {
    throw new FeeSponsorshipError("Transaction is already fee-bumped.");
  }
  if (!(parsed instanceof Transaction) || parsed.signatures.length === 0) {
    throw new FeeSponsorshipError("A user-signed transaction is required.");
  }
  if (BigInt(parsed.fee) > request.maxInnerFeeStroops) {
    throw new FeeSponsorshipError("Transaction fee exceeds the sponsorship cap.");
  }
  const maxTime = parsed.timeBounds?.maxTime;
  const now = request.now ?? Math.floor(Date.now() / 1000);
  if (!maxTime || BigInt(maxTime) <= BigInt(now) || BigInt(maxTime) > BigInt(now + 300)) {
    throw new FeeSponsorshipError("Transaction must expire within five minutes.");
  }
  const { contractId, method } = contractAndMethod(parsed);
  if (contractId !== request.allowedContractId || !SPONSORED_METHODS.has(method)) {
    throw new FeeSponsorshipError("Transaction is not an eligible Kaido action.");
  }
  const sponsor = Keypair.fromSecret(request.sponsorSecret);
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    sponsor,
    request.baseFeeStroops,
    parsed,
    request.networkPassphrase,
  );
  feeBump.sign(sponsor);
  return feeBump.toXDR();
}
