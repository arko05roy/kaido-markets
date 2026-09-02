// @vitest-environment node

import { Account, Contract, Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { FeeSponsorshipError, sponsorKaidoTransaction } from "@/lib/stellar/fee-sponsorship";

const CONTRACT_ID = "CBRZBLU224KTJSANZIKAOHLXMQUV6GHQBEK5QAK46456WKY2BE6QZXA6";
const PASSPHRASE = Networks.TESTNET;
const USER = Keypair.fromSecret("SDMJBM35ULSFPTFT3CSMBREVHRLH5JDULU5WJFGPWC4JEIR4JUC2FVSS");
const SPONSOR = Keypair.fromSecret("SACJXS6XBVFKIQWAS2NMADI3QMW55OF7SPXVGRAOAAHZIXULYGFBAGFA");

function signedCall(method: string) {
  const tx = new TransactionBuilder(new Account(USER.publicKey(), "1"), {
    fee: "100000",
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(new Contract(CONTRACT_ID).call(method))
    .setTimeout(60)
    .build();
  tx.sign(USER);
  return tx.toXDR();
}

describe("fee sponsorship", () => {
  it("wraps a signed allow-listed Kaido trade in a fee-bump transaction", () => {
    const xdr = sponsorKaidoTransaction({
      signedInnerTxXdr: signedCall("trade"),
      sponsorSecret: SPONSOR.secret(),
      allowedContractId: CONTRACT_ID,
      networkPassphrase: PASSPHRASE,
      maxInnerFeeStroops: 2_000_000n,
      baseFeeStroops: "100000",
    });
    expect(TransactionBuilder.fromXDR(xdr, PASSPHRASE).constructor.name).toBe("FeeBumpTransaction");
  });

  it("refuses calls outside the Kaido sponsorship allow-list", () => {
    expect(() =>
      sponsorKaidoTransaction({
        signedInnerTxXdr: signedCall("init"),
        sponsorSecret: SPONSOR.secret(),
        allowedContractId: CONTRACT_ID,
        networkPassphrase: PASSPHRASE,
        maxInnerFeeStroops: 2_000_000n,
        baseFeeStroops: "100000",
      }),
    ).toThrow(FeeSponsorshipError);
  });
});
