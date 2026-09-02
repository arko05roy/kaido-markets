# ForecastCanvas

Trajectory mode (draw a path → checkpoint values) and distribution mode (draw a
hump → `(μ, σ)`). The curve-fit lives in `web/lib/curve` and MUST match
`kaido-math` semantics exactly (ADR-8); the fitted curve is rendered back to the
user before they confirm. Built across Sprints 2–6 (build.md E10/E11).
