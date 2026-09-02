# ADR-2 — Belief representation on-chain (parameters, not arrays)

- **Status:** Accepted (Sprint 1)
- **Context:** build.md §2.2, §15; whitepaper Part II §8, §11, §16
- **Supersedes:** the "TODO (Sprint 1)" row in `docs/adr/README.md`

## Decision

A market never stores a discretised curve. It stores the aggregate trader
belief as a small fixed set of **parameters**.

### Scalar market (Sprint 1)

The aggregate curve is a single scaled Gaussian `f(x) = λ · φ_{μ,σ}(x)` where
`φ_{μ,σ}` is the `N(μ, σ)` density. On-chain we store the triple

> `Belief = (μ, σ, λ)`

with `λ = k · √(2σ√π)` chosen so the AMM invariant `‖f‖₂ = k` holds (whitepaper
§11). All three are **WAD-scaled `i128`** (see ADR-1, §"Working scale" below).
`λ` is *derived* from `(k, σ)` and stored redundantly so reads never recompute a
square root; the constructor and every trade re-derive and assert it.

> **Working scale.** ADR-1 left "1e9 vs 1e18" open. **Resolved: 1e18 (WAD).**
> 18 decimal digits is comfortable headroom over the ≤ 1e-9 relative-error
> target for `exp`/`erf`; it is the de-facto DeFi convention; and `i128` holds
> WAD values up to ≈ 1.7e20 — enough for every quantity the Gaussian math
> touches (dimensionless ratios stay < ~50, money quantities stay well under
> 1e12 USD). Products that would phantom-overflow `i128` go through a 256-bit
> intermediate (`kaido_math::fp`, see ADR-1 note). **Money** stays at 7 dp
> (USDC stroop convention) at the contract boundary and is converted to WAD on
> the way in, back to 7 dp on the way out.

### Trader position (Sprint 2, recorded here for completeness)

A position records enough to recompute `g(x₀) − f(x₀)` at resolution without
any stored curve array:

> `PositionData = (μ_before, σ_before, λ_before, μ_after, σ_after, λ_after,
>                  collateral_posted, owner)`

i.e. the market curve immediately before the trade (`f`) and immediately after
(`g`), plus the collateral the trader locked and who owns the claim.

### Trajectory market (Sprint 2, recorded here)

Per ADR-4 (to be written) a trajectory market over checkpoints
`t₁ < … < t_n` is the product of `n` per-checkpoint scalar markets sharing one
collateral pool: the stored belief is `Vec<Belief>` of length `n` plus the
checkpoint timestamps. The math is the discrete-`N` case of whitepaper §7
stacked across time; v1 treats checkpoints as independent Gaussians.

## Consequences

- O(1) storage per market regardless of "resolution" — a market is a handful of
  `i128`s, not a histogram. Gas-cheap reads and writes.
- The exact curve is reconstructable off-chain (the frontend renders the *fitted*
  curve back to the user before confirm, ADR-8) from the same three numbers.
- Settlement is closed-form per position: `f(x₀)` is one `gaussian_pdf_scaled`
  call (capped path: `min(λφ(x₀), b)`), no integration, no array walk.
- Richer parameterisations (skew, multi-modal — build.md E18, post-M3) become
  *additional* parameter tuples behind a `Parameterization` tag; the storage
  shape generalises without a migration of existing markets.

## Alternatives considered

- **Discretised array of bucket masses** (the literal whitepaper §7 picture):
  rejected — storage and gas scale with bucket count, settlement is an array
  walk, and the curve-fit conformance contract (ADR-8) would have to pin a
  bucketing scheme forever. Parameters are strictly better for the Gaussian
  family and we only ever need a *family*, not arbitrary curves.
- **Store `(μ, σ)` only, derive `λ` on every read:** rejected — an extra
  `sqrt_wad` on the hot read path for no storage saving worth mentioning.
