"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type LiveCrowdSnapshot = {
  consensusMusWad: string[];
  consensusSigmasWad: string[];
};

const POLL_MS = 12_000;

function snapshotsEqual(a: LiveCrowdSnapshot, b: LiveCrowdSnapshot): boolean {
  return (
    a.consensusMusWad.join() === b.consensusMusWad.join() &&
    a.consensusSigmasWad.join() === b.consensusSigmasWad.join()
  );
}

async function fetchCrowdSnapshot(marketId: string): Promise<LiveCrowdSnapshot | null> {
  const res = await fetch(`/api/markets/${marketId}/crowd`);
  const body = (await res.json()) as {
    error?: string;
    kind?: string;
    muWad?: string;
    sigmaWad?: string;
    musWad?: string[];
    sigmasWad?: string[];
  };
  if (!res.ok || body.error) return null;
  if (body.kind === "trajectory" && body.musWad?.length && body.sigmasWad?.length) {
    return { consensusMusWad: body.musWad, consensusSigmasWad: body.sigmasWad };
  }
  if (body.muWad != null && body.sigmaWad != null) {
    return { consensusMusWad: [body.muWad], consensusSigmasWad: [body.sigmaWad] };
  }
  return null;
}

/** Poll on-chain crowd belief; apply optimistic updates after local trades. */
export function useLiveCrowd(marketId: string, initial: LiveCrowdSnapshot) {
  const [consensus, setConsensus] = useState(initial);

  const applyOptimistic = useCallback((next: LiveCrowdSnapshot) => {
    setConsensus((prev) => (snapshotsEqual(prev, next) ? prev : next));
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchCrowdSnapshot(marketId);
    if (next) setConsensus((prev) => (snapshotsEqual(prev, next) ? prev : next));
  }, [marketId]);

  useEffect(() => {
    setConsensus(initial);
  }, [marketId, initial.consensusMusWad.join(), initial.consensusSigmasWad.join()]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const crowdMuWad = useMemo(
    () => BigInt(consensus.consensusMusWad[0] ?? "0"),
    [consensus.consensusMusWad],
  );

  return { consensus, crowdMuWad, applyOptimistic, refresh };
}
