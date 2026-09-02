import { describe, expect, it } from "vitest";

import type { DecodedEvent } from "@/lib/indexer";
import { positionsFromEvents, traderAddressString } from "@/lib/indexer/wallet-positions";

const WALLET = "GDAKWS5C6HWEZRVTJPIBIEML4IZ7SXCUZMZV5XBESS5IXOW6HA3E27Q7";

function tradeEvent(id: bigint, trader: string, ledger: number): DecodedEvent {
  return {
    id: `ev-${id}`,
    ledger,
    ledgerClosedAt: "2026-01-01T00:00:00Z",
    txHash: "abc",
    contractId: "C123",
    name: "Trade",
    topics: ["Trade"],
    data: { id, trader, collateral: 1_000_000_000_000_000_000n, fee: 0n },
  };
}

describe("wallet-positions", () => {
  it("parses trader address strings", () => {
    expect(traderAddressString(WALLET)).toBe(WALLET);
    expect(traderAddressString({ address: WALLET })).toBe(WALLET);
  });

  it("filters Trade events by wallet and dedupes ids", () => {
    const other = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    const events = [
      tradeEvent(1n, WALLET, 100),
      tradeEvent(2n, other, 101),
      tradeEvent(1n, WALLET, 102),
      {
        ...tradeEvent(3n, WALLET, 103),
        name: "TradeTrajectory" as const,
      },
    ];
    const rows = positionsFromEvents(events, WALLET);
    expect(rows.map((r) => r.id)).toEqual(["3", "1"]);
    expect(rows[1]!.openedAtLedger).toBe(102);
  });
});
