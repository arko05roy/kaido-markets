import { gridOverRange, renderGaussian, fromWad, type GaussianBelief } from "@/lib/curve";

export interface ShareCurveInput {
  marketTitle: string;
  call: string;
  conviction: string;
  crowdTarget: string;
  maxWin: string;
  consensus: GaussianBelief;
  yours: GaussianBelief;
  market: { kWad: bigint; bWad: bigint; capped?: boolean };
}

/** Canvas PNG export for share curve (ponytail: no html-to-image dep). */
export function exportShareCurvePng(input: ShareCurveInput): void {
  const w = 1200;
  const h = 630;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#0a0a0b";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#d8c69a";
  ctx.font = "600 14px monospace";
  ctx.fillText("KAIDO", 48, 56);

  ctx.fillStyle = "#f3efe6";
  ctx.font = "italic 32px Georgia, serif";
  const title =
    input.marketTitle.length > 48 ? input.marketTitle.slice(0, 45) + "…" : input.marketTitle;
  ctx.fillText(title, 48, 110);

  const mu = fromWad(input.consensus.muWad);
  const sigma = Math.max(1e-12, fromWad(input.consensus.sigmaWad));
  const xMin = mu - 3 * sigma;
  const xMax = mu + 3 * sigma;
  const xs = gridOverRange(xMin, xMax, 64);
  const crowdPts = renderGaussian(input.consensus, input.market, xs);
  const yourPts = renderGaussian(input.yours, input.market, xs);
  const maxY = Math.max(...crowdPts.map((p) => p.y), ...yourPts.map((p) => p.y), 1e-9);

  const chartL = 48;
  const chartR = w - 48;
  const chartT = 150;
  const chartB = 380;
  const chartW = chartR - chartL;
  const chartH = chartB - chartT;

  const toX = (x: number) => chartL + ((x - xMin) / (xMax - xMin)) * chartW;
  const toY = (y: number) => chartB - (y / maxY) * chartH;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(chartL, chartB);
  ctx.lineTo(chartR, chartB);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  crowdPts.forEach((p, i) => {
    const px = toX(p.x);
    const py = toY(p.y);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  ctx.strokeStyle = "#d8c69a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  yourPts.forEach((p, i) => {
    const px = toX(p.x);
    const py = toY(p.y);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "13px monospace";
  ctx.fillText(`Your call ${input.call} · ${input.conviction}`, 48, 440);
  ctx.fillText(`Crowd ${input.crowdTarget} · Max win ${input.maxWin}`, 48, 468);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("kaido.markets · belief on a curve", 48, h - 40);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kaido-curve.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
