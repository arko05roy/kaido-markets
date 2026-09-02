# ADR-3 — σ-floor by default; capped Gaussian opt-in

- **Status:** Accepted (Sprint 1; capped-Gaussian implementation lands Sprint 5)
- **Context:** build.md §2.3, E7; whitepaper Part II §10
- **Supersedes:** the "TODO (Sprint 1–2)" row in `docs/adr/README.md`

## Decision

A continuous distribution market is solvent iff the aggregate payout curve never
promises more than the collateral on hand: `max_x f(x) ≤ b` (whitepaper §9–10).
A finite L²-norm does **not** guarantee that in infinite dimensions (the Dirac
spike), so every market enforces the cap one of two ways. **Kaido v1 uses the
σ-floor by default and offers the capped Gaussian as an explicit per-market
opt-in.**

### Default: σ-floor (whitepaper §10 option 1)

For a scaled Gaussian `f(x) = λ φ_{μ,σ}(x)` with `λ = k√(2σ√π)`, the peak is
`f(μ) = k / √(σ√π)`. Requiring `f(μ) ≤ b` gives

> **σ ≥ σ_min(k, b) = k² / (b² · √π)**

`distribution-market` rejects any `trade` whose post-trade `σ` is below the
market's `σ_min` with a dedicated error (`SigmaBelowFloor`). `σ_min` is derived
from `(k, b)` at market creation and surfaced in the UI ("you can't claim to be
*more* certain than this"). `kaido_math::sigma_floor(k, b)` is the single
implementation; the constructor stores the result.

Rationale for making this the default: it is the simplest invariant to audit —
one inequality on one stored number, checked on every trade — and it keeps the
on-chain curve a *pure* Gaussian (no piecewise `min`), which keeps settlement
and the conformance vectors simple.

### Opt-in: capped Gaussian (whitepaper §10 option 2) — Sprint 5

A market may set a `capped` flag, after which the payout curve is
`f(x) = min(b, λ' φ_{μ,σ}(x))` — a Gaussian with its top sliced flat at height
`b` — with `λ'` rescaled (by a fixed-point root-find, the open question in
ADR-1) so `‖f‖₂ = k` still holds. Any `σ` is then allowed. This path is for
markets that genuinely need sharp beliefs; it is **not** the default because the
λ-solve and the capped-norm / capped-settlement math are more delicate and ship
later (build.md E7, Sprint 5; conformance vectors extended there).

### What a position stores either way

`PositionData` (ADR-2) records `(μ, σ, λ)` before and after the trade; the cap
mode is a market-level flag, so settlement knows whether to apply the `min(·, b)`
clip. A market cannot switch modes after creation.

## Consequences

- The common case (σ-floor) has a trivial solvency proof and is what the
  property tests assert: `f(x) ≤ b ∀x` reduces to `peak ≤ b` reduces to
  `σ ≥ σ_min`, all integer comparisons after the `kaido_math` calls.
- `σ_min` depends on `k` and `b` but **not** on `μ` — consistent with whitepaper
  §11 "you can slide the mean for free". Moving the consensus centre is cheap;
  sharpening it is what costs collateral and is what the floor caps.
- Markets that need the capped path are explicitly flagged in the registry and
  the UI; users always know which regime they are in.
- BlendTap per-market borrow caps (ADR-6) compose on top of this:
  the σ-floor bounds *per-trade* payout obligation; the vault cap bounds
  *aggregate* protocol exposure.

## Alternatives considered

- **Capped Gaussian as the only mode:** rejected for v1 — strictly more
  complex math on the hot path and in the audit, for a capability most markets
  don't need. Revisit if a class of markets makes the σ-floor too restrictive
  in practice.
- **No cap, rely on "nobody would do that":** rejected — a single adversarial
  near-delta belief makes the AMM insolvent; this is the mechanism's one known
  failure mode and it is not optional to fix.
