# forecast

Slider-driven belief input + a read-only preview chart — the replacement for the
freehand "draw your forecast" canvas (which didn't survive real data).

- `belief-chart.tsx` — recharts render of a belief: scalar bell curves over a
  number line, or a trajectory path + ±σ band over checkpoints. Curves come from
  `web/lib/curve` (`renderGaussian`), the byte-exact `kaido-math` port — so what's
  shown is exactly what gets submitted (ADR-8).
- `range-slider.tsx` — labelled single-value slider over the Radix-backed
  `components/ui/slider.tsx` (accessible: keyboard, ARIA, touch).
- `scalar-belief-input.tsx` / `trajectory-belief-input.tsx` — set `(μ, σ)` (per
  checkpoint for trajectory) with sliders; σ is always clamped to the market's
  effective σ-floor so the contract's `peak ≤ b` re-check can't reject it.
- `consensus-chart.tsx` — read-only render of a market's current consensus
  distribution (re-hydrates the string-encoded market view across the RSC boundary).
- `trade-panel.tsx` — the trade surface on `/markets/[id]`: picks the scalar or
  trajectory input, a max-collateral field, submits via `@kaido/sdk` + the
  connected wallet. The resolver **tier badge** stays non-negotiable UI (ADR-5) —
  rendered by the page, not here.
