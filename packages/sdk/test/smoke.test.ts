import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { Kaido, keypairSigner, WAD, USDC_DECIMALS, distributionMarket } from "../src/index";

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

describe("@kaido/sdk", () => {
  it("exposes the WAD scale and USDC decimals", () => {
    expect(WAD).toBe(1_000_000_000_000_000_000n);
    expect(USDC_DECIMALS).toBe(7);
  });

  it("keypairSigner reports the keypair's public key", () => {
    const kp = Keypair.random();
    const signer = keypairSigner(kp.secret());
    expect(signer.accountId).toBe(kp.publicKey());
  });

  it("keypairSigner requires a network passphrase to sign", async () => {
    const signer = keypairSigner(Keypair.random().secret());
    await expect(signer.signTransaction("AAAA")).rejects.toThrow(/networkPassphrase/);
  });

  it("createTrajectoryMarket rejects mismatched array lengths before any RPC", async () => {
    const kaido = new Kaido({
      network: "testnet",
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: NETWORK_PASSPHRASE,
      contracts: {
        marketFactory: "C".padEnd(56, "A"),
        registry: "C".padEnd(56, "B"),
      },
      usdcSacId: "C".padEnd(56, "C"),
    });
    const signer = keypairSigner(Keypair.random().secret());
    await expect(
      kaido.createTrajectoryMarket(
        {
          k: WAD,
          b: WAD,
          feeBps: 30,
          resolver: "C".padEnd(56, "D"),
          tier: distributionMarket.ResolverTier.Reflector,
          windowOpen: 0n,
          windowLock: 0n,
          windowResolve: 0n,
          checkpoints: [1n, 2n],
          mus0: [WAD],
          sigmas0: [WAD, WAD],
        },
        signer,
      ),
    ).rejects.toThrow(/equal length/);
  });
});
