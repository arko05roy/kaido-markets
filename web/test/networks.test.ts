import { describe, expect, it } from "vitest";

import { STELLAR_NETWORKS, activeNetworkId } from "@/lib/stellar/networks";

// Sprint-0 smoke: the static network table is well-formed and matches the
// published passphrases. Real tests (canvas math, curve preview, market state
// rendering, wallet flows) arrive alongside the features.
describe("stellar networks config", () => {
  it("has the four known networks", () => {
    expect(Object.keys(STELLAR_NETWORKS).sort()).toEqual([
      "futurenet",
      "local",
      "mainnet",
      "testnet",
    ]);
  });

  it("uses the published testnet/mainnet passphrases", () => {
    expect(STELLAR_NETWORKS.testnet.networkPassphrase).toBe(
      "Test SDF Network ; September 2015",
    );
    expect(STELLAR_NETWORKS.mainnet.networkPassphrase).toBe(
      "Public Global Stellar Network ; September 2015",
    );
  });

  it("defaults the active network to testnet when unset", () => {
    delete process.env.STELLAR_NETWORK;
    expect(activeNetworkId()).toBe("testnet");
  });
});
