"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Panel } from "@/components/app/kaido-ui";
import { Input } from "@/components/ui/input";
import { TickLabelsEditor } from "@/components/market/tick-labels-editor";
import { saveMarketMetadata } from "@/lib/market-metadata";
import {
  parseTickLabels,
  resizeTickLabels,
  tickLabelsFromConfig,
} from "@/lib/outcome-scale";

export function OutcomeAxisPanel({
  marketId,
  question,
  outcomeMin,
  outcomeMax,
  divisions,
  divisionLabels,
}: {
  marketId: string;
  question: string;
  outcomeMin: number;
  outcomeMax: number;
  divisions: number[];
  divisionLabels?: string[];
}) {
  const router = useRouter();
  const [rangeMin, setRangeMin] = useState(String(outcomeMin));
  const [rangeMax, setRangeMax] = useState(String(outcomeMax));
  const [tickCount, setTickCount] = useState(divisions.length);
  const [tickLabels, setTickLabels] = useState<string[]>(() =>
    tickLabelsFromConfig(divisions, divisionLabels),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const min = Number(rangeMin);
  const max = Number(rangeMax);
  const boundsOk = Number.isFinite(min) && Number.isFinite(max) && max > min;
  const parsed = useMemo(
    () => (boundsOk ? parseTickLabels(tickLabels, min, max) : null),
    [boundsOk, tickLabels, min, max],
  );

  const handleCountChange = (n: number) => {
    setTickCount(n);
    if (boundsOk) setTickLabels((prev) => resizeTickLabels(prev, n, min, max));
  };

  const save = async () => {
    if (!parsed) {
      setError("Add at least two tick labels.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveMarketMetadata(marketId, {
        question: question.trim(),
        marketStyle: "kaido",
        outcomeMin: min,
        outcomeMax: max,
        divisions: parsed.divisions,
        ...(parsed.divisionLabels ? { divisionLabels: parsed.divisionLabels } : {}),
      });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save chart axis");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="space-y-4 border-white/[0.06] bg-[#141416]/50 px-4 py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            Lower limit
          </span>
          <Input value={rangeMin} onChange={(e) => setRangeMin(e.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            Upper limit
          </span>
          <Input value={rangeMax} onChange={(e) => setRangeMax(e.target.value)} />
        </label>
      </div>

      <TickLabelsEditor
        count={tickCount}
        onCountChange={handleCountChange}
        labels={tickLabels}
        onLabelChange={(i, v) =>
          setTickLabels((prev) => prev.map((x, j) => (j === i ? v : x)))
        }
        rangeMin={min}
        rangeMax={max}
      />

      {error && <p className="text-sm text-red-300">{error}</p>}
      {saved && <p className="text-sm text-[#d8c69a]">Chart axis saved.</p>}
      <button
        type="button"
        disabled={saving || !parsed}
        onClick={() => void save()}
        className="rounded-lg border border-[#d8c69a]/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d8c69a] hover:bg-[#d8c69a]/10 disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save chart axis"}
      </button>
    </Panel>
  );
}
