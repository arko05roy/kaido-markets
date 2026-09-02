# Architecture Decision Records

One file per decision: `NNNN-title.md`. Status is one of
`Proposed | Accepted | Superseded by NNNN | Deprecated`.

The full set the build plan calls for (build.md §2) — written as the decisions
are actually made:

| #  | Title | Status |
|----|-------|--------|
| 0  | [Monorepo & toolchain](0000-monorepo-and-toolchain.md) | Accepted |
| 1  | [Fixed-point representation](0001-fixed-point-representation.md) | Accepted |
| 2  | Belief representation on-chain (params, not arrays) | TODO (Sprint 1) |
| 3  | σ-floor by default; capped-Gaussian opt-in | TODO (Sprint 1–2) |
| 4  | Trajectory market = product of per-checkpoint markets | TODO (Sprint 2) |
| 5  | [Resolver is an interface, not a contract](0005-resolver-interface.md) | Accepted |
| 6  | HouseVault is a Layer-1 participant | TODO (Sprint 2) |
| 7  | No protocol token; settlement in USDC | TODO (Sprint 2) |
| 8  | Frontend never trusts itself; shared conformance vectors | TODO (Sprint 3) |
| 9  | Commit-reveal for short-window games | TODO (Sprint 4) |
| 10 | Next.js 16 conventions | TODO (Sprint 0–1) |

Open engineering questions are tracked at the end of build.md and turn into
ADRs as they're resolved.
