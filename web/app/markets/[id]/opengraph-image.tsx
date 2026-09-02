import { ImageResponse } from "next/og";

import { crowdTargetLabel } from "@/lib/market-display";
import { getSavedMarketQuestion } from "@/lib/market-metadata-store";
import { activeNetworkId } from "@/lib/stellar/networks";
import { getMarketState } from "@/lib/stellar/kaido";

export const alt = "Kaido prediction market";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const saved = getSavedMarketQuestion(activeNetworkId(), id);
  let crowd = "";
  try {
    const { state } = await getMarketState(id);
    crowd = crowdTargetLabel(state.belief.mu);
  } catch {
    /* omit crowd */
  }
  const title = saved ?? `Market ${id.slice(0, 8)}…`;
  const displayTitle = title.length > 72 ? `${title.slice(0, 69)}…` : title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0b",
          padding: 64,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ color: "#d8c69a", fontSize: 20, fontFamily: "monospace" }}>KAIDO</div>
          <div
            style={{
              color: "#f3efe6",
              fontSize: 48,
              fontStyle: "italic",
              lineHeight: 1.2,
              maxWidth: 1000,
            }}
          >
            {displayTitle}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {crowd ? (
            <div style={{ color: "#a8a29e", fontSize: 28 }}>Crowd target {crowd}</div>
          ) : null}
          <div style={{ color: "#78716c", fontSize: 22 }}>Call the number · Press conviction · Place belief</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
