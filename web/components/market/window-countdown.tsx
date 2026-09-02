"use client";

import { useLedgerNow } from "@/components/providers/ledger-time-provider";

function fmtCountdown(targetSec: number, nowSec: number): string {
  const delta = Math.max(0, targetSec - nowSec);
  if (delta === 0) return "now";
  const d = Math.floor(delta / 86400);
  const h = Math.floor((delta % 86400) / 3600);
  const m = Math.floor((delta % 3600) / 60);
  const s = delta % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function WindowCountdown({
  windowOpen,
  windowLock,
  windowResolve,
  statusTag,
}: {
  windowOpen: number;
  windowLock: number;
  windowResolve: number;
  statusTag: string;
}) {
  const { nowSec } = useLedgerNow();

  if (statusTag === "Resolved" || statusTag === "ResolvedVec") {
    return (
      <p className="text-sm text-white/45">
        Market resolved · window ended {new Date(windowResolve * 1000).toUTCString()}
      </p>
    );
  }

  const next =
    nowSec < windowOpen
      ? { label: "Trading opens", at: windowOpen }
      : nowSec < windowLock
        ? { label: "Trading closes", at: windowLock }
        : nowSec < windowResolve
          ? { label: "Resolves", at: windowResolve }
          : { label: "Ready to resolve", at: windowResolve };

  return (
    <p className="text-sm text-white/45">
      <span className="font-medium text-[#f3efe6]">{next.label}</span>
      {nowSec < windowResolve ? (
        <>
          {" "}
          in <span className="font-mono tabular-nums text-[#d8c69a]">{fmtCountdown(next.at, nowSec)}</span>
        </>
      ) : (
        " — awaiting oracle"
      )}
    </p>
  );
}
