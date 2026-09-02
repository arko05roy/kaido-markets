# ADR-1 — Fixed-point representation

- **Status:** Accepted (Sprint 0; error bounds finalised in Sprint 1–2)
- **Context:** build.md §2.1, ADR list; whitepaper Part II §10–11

## Decision

**No `f64` (or any float) anywhere in contract code.** All money and all
AMM/Gaussian math is integer / fixed-point.

- **Money:** 7-decimal units, matching the Stellar / USDC stroop convention.
- **Internal AMM math:** a higher-precision scaled `i128` (working scale to be
  fixed in Sprint 1 — candidates 1e9 or 1e18) using
  [`soroban-fixed-point-math`](https://github.com/script3/soroban-fixed-point-math)
  (`mul_floor` / `mul_ceil` / `div_floor` on `i128`/`u128`/`I256`/`U256`,
  handles phantom overflow). Convert at the contract boundary.
- **Gaussian primitives** (`exp`, `erf`, `erfc`, `gaussian_l2_norm`, `lambda`,
  `gaussian_pdf_scaled`, `sigma_floor`, `worst_case_collateral`) live in the
  `kaido-math` crate as deterministic fixed-point series / rational
  approximations (range reduction + minimax polynomial / continued fraction)
  with **documented, proven max relative error** — target ≤ 1e-9 over the
  working domain.
- **Overflow:** `overflow-checks = true` in the release profile; use `I256`
  intermediaries for products that could phantom-overflow `i128`.
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

## Open questions (tracked in build.md)

- Final working scale and the exact error bounds for `exp` / `erf`.
- Convergence of the capped-Gaussian λ root-find in fixed point (Sprint 5).
