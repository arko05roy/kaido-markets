/**
 * Serializable market list types — shared between server reads and client board.
 */
import type { registry } from "@kaido/contract-bindings";

export type MarketCard = {
  address: string;
  info: registry.MarketInfo;
  status: registry.MarketStatus | null;
  crowdMuWad?: bigint;
  crowdSigmaWad?: bigint;
  kWad?: bigint;
  bWad?: bigint;
  blendBackedDepth7dp?: bigint;
};
