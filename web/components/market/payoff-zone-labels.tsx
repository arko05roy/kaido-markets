"use client";

/** Band labels under the scalar payoff chart (plan §4.3). */
export function PayoffZoneLabels() {
  const zones = [
    { label: "Bad miss", className: "text-red-300/70" },
    { label: "Still alive", className: "text-white/40" },
    { label: "Max payoff", className: "text-[#d8c69a]" },
    { label: "Miss zone", className: "text-white/35" },
  ];

  return (
    <div className="grid grid-cols-4 gap-1 px-1 pt-2">
      {zones.map((z) => (
        <span
          key={z.label}
          className={`text-center font-mono text-[9px] uppercase tracking-[0.14em] ${z.className}`}
        >
          {z.label}
        </span>
      ))}
    </div>
  );
}
