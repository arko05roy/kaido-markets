import type { registry } from "@kaido/contract-bindings";

/** Checkpoint times for trajectory markets; empty for scalar. */
export function checkpointsFromOutcomeSpace(
  outcomeSpace: registry.MarketInfo["outcome_space"],
): number[] {
  if (outcomeSpace.tag !== "Trajectory") return [];
  const raw = outcomeSpace.values[0];
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => Number(c));
}
