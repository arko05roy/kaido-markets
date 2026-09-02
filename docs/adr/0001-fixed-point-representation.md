# ADR-1 — Fixed-point representation

- **Status:** Accepted (Sprint 0; working scale fixed and `exp`/`erf` error
  bounds established in Sprint 1 — see "Resolved in Sprint 1" below)
- **Context:** build.md §2.1, ADR list; whitepaper Part II §10–11

## Decision

**No `f64` (or any float) anywhere in contract code.** All money and all
AMM/Gaussian math is integer / fixed-point.

- **Money:** 7-decimal units, matching the Stellar / USDC stroop convention.
- **Internal AMM math:** WAD-scaled `i128` — **working scale = 1e18** (resolved
  Sprint 1, see ADR-2). On the *contract* side, money↔WAD conversions and any
  ordinary `mul`/`div` at the boundary use
  [`soroban-fixed-point-math`](https://github.com/script3/soroban-fixed-point-math)
  (`fixed_mul_floor` / `fixed_mul_ceil` / `fixed_div_floor` on `i128`, and the
  `SorobanFixedPoint` `I256`/`U256` path when an `Env` is in hand). Convert at
  the contract boundary.
- **`kaido-math` rounding & 256-bit intermediates.** `kaido-math` is a *pure*
  `no_std` crate with no `Env`, so it cannot use the script3 `SorobanFixedPoint`
  `I256` path (that one needs the host) and the pure `FixedPoint` trait only
  reports overflow rather than widening. `kaido-math` therefore carries its own
  small, audited 256-bit widening `mul_div` and `isqrt256` (module `fp`) and
  uses **truncation toward zero** consistently (matches Rust integer `/` and
  JS `BigInt` `/`, so the TS conformance side reproduces it for free). This is
  a deliberate, documented deviation from the literal "use
  soroban-fixed-point-math everywhere" wording in build.md §0 — the script3
  crate is still the dependency of record on the *contract* side.
- **Gaussian primitives** (`exp`, `erf`, `erfc`, `gaussian_l2_norm`, `lambda`,
  `gaussian_pdf_scaled`, `sigma_floor`, `worst_case_collateral`) live in the
  `kaido-math` crate as deterministic fixed-point series / rational
  approximations (range reduction + Taylor/minimax polynomial + continued
  fraction for `erfc`) with **documented max relative error** — see below.
- **Overflow:** `overflow-checks = true` in the release profile; `kaido-math`'s
  `fp::mul_div` widens to 256 bits internally and only the *final* `i128`
  narrowing can fail (it panics, documented as a precondition — e.g. `exp_wad`
  argument above `MAX_EXP_ARG`).
- **Cross-language conformance:** the canonical numbers live in
  `docs/test-vectors/*.json` and are executed by **both** `kaido-math` (Rust)
  and `web/lib/curve` (TS). A mismatch fails CI on both sides — this is what
  prevents "drew X, recorded Y" disputes (see ADR-8).

## Consequences

- Deterministic across the host/guest boundary and across re-execution — a hard
  requirement for consensus and for replayable settlement.
- `kaido-math` is `#![no_std]`, float-free, and `forbid(unsafe_code)`.
- The frontend's curve-fit must reproduce the contract's rounding rules
  byte-for-byte; the shared vectors are the enforcement mechanism.

## Resolved in Sprint 1

- **Working scale = 1e18 (WAD).** Rationale in ADR-2.
- **`exp_wad` accuracy.** Argument range-reduced as `x = n·ln2 + r`,
  `|r| ≤ ln2/2`; `exp(r)` via the degree-8 Taylor polynomial in Horner form
  (the first dropped term is `r⁹/9! ≈ 5e-11` over `|r| ≤ ln2/2`), then scaled by
  `2ⁿ`. Combined relative error is below 1e-9 over the supported domain
  `[-MAX_EXP_ARG, MAX_EXP_ARG]` (`MAX_EXP_ARG = 46·WAD`, the point where the
  WAD result still fits `i128`); for `x ≲ -41.45·WAD` the WAD result rounds to 0
  and `exp_wad` returns 0 exactly. Verified against `mpmath` (50-digit)
  reference vectors in `docs/test-vectors/`.
- **`erf_wad` / `erfc_wad` accuracy.** `|x| ≤ 2`: the convergent Maclaurin
  series for `erf` (no catastrophic cancellation in that range). `|x| > 2`:
  `erfc(|x|)` via Lentz's continued fraction (all-positive convergents),
  `erf = sign·(1 − erfc)`; for `|x| ≥ 6` `erf` is `±WAD` to within a wad-unit.
  Relative error below 1e-9 over the supported domain; verified against the same
  reference vectors. (`erf`/`erfc` are only *used* by the capped-Gaussian path
  in Sprint 5; they are implemented and pinned now per build.md Sprint 1.)

## Open questions (tracked in build.md)

- Convergence/precision of the capped-Gaussian λ root-find in fixed point
  (Sprint 5) — will reuse `fp::mul_div` and `erf_wad`.
