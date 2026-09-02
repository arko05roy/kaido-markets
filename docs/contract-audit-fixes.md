# Kaido Contract Audit Fix Plan

This file converts the contract audit findings into an implementation checklist. Treat P0/P1 items as release blockers for any deployment with real funds.

## P0: Fix Collateral Sizing

### Issue

`kaido_math::worst_case_collateral` can under-collateralize trades. The current `cargo test` run found a failing property case where the system under test returned `0` while the brute-force oracle required `65302789092005781` WAD units.

Affected code:

- `contracts/crates/kaido-math/src/gaussian.rs`
- `contracts/crates/kaido-math/src/tests_oracle.rs`
- `contracts/contracts/distribution-market/src/lib.rs`

### Fix

- Replace the heuristic grid plus golden-section search with a conservative method that cannot miss a negative minimum.
- Add the failing generated case as a deterministic regression test.
- Keep the existing brute-force oracle property test and make it part of the release gate.
- Until the algorithm is proven over the full intended domain, enforce explicit market parameter bounds for `k`, `b`, `mu`, and `sigma`.

### Acceptance Criteria

- `cargo test -p kaido-math --lib` passes repeatedly.
- The failing seed from the audit is committed as a named regression test.
- `DistributionMarket::trade` and `trade_trajectory` cannot mint positions whose stored collateral is below the oracle/regression expectation.

## P1: Make BlendTap Claim Accounting Settlement-Safe

### Issue

`maybe_blend_unwind_claim` can transfer the market's entire USDC balance to the Blend adapter before computing or paying the current claim. This makes settlement order-dependent and can move funds needed for claimant payouts, fees, or later positions.

Affected code:

- `contracts/contracts/distribution-market/src/lib.rs`
- `contracts/contracts/blend-adapter/src/lib.rs`
- `contracts/tests/tests/lifecycle.rs`

### Fix

- Track Blend-backed funds separately from ordinary settlement reserves.
- Repay or unwind only the amount required for market debt, not the whole market token balance.
- Reconcile adapter state before deleting a position, but compute the claim payout from reserved settlement accounting.
- Add tests with multiple open positions where the first claim cannot consume funds needed by the second claim.

### Acceptance Criteria

- Multiple scalar claims after BlendTap resolve in any order and conserve USDC.
- The market never transfers unrelated settlement reserves to the adapter during a single claim.
- Blend outstanding debt reaches zero without starving winner payouts.

## P1: Restrict LP Withdrawals Around Unresolved Liabilities

### Issue

`remove_liquidity` is allowed in `Open`, `Locked`, `Resolved`, `ResolvedVec`, and `Disputable` states without reserving unclaimed trader payouts. LPs can withdraw funds that may be needed by unresolved or unclaimed winning positions.

Affected code:

- `contracts/contracts/distribution-market/src/lib.rs`
- `contracts/contracts/distribution-market/src/test.rs`

### Fix

- During `Open`, allow LPs to withdraw only free collateral that is not locked by positions.
- During `Locked` and `Disputable`, reject LP withdrawals.
- After resolution, either block LP withdrawals until all positions are claimed or maintain an explicit liability reserve for max outstanding payouts.
- Add tests proving LP withdrawal cannot make later valid claims fail.

### Acceptance Criteria

- `remove_liquidity` cannot reduce pool balance below required outstanding liabilities.
- LP withdrawal behavior is identical for scalar and trajectory markets.
- Disputable markets preserve settlement funds until a governance/dispute recovery path exists.

## P2: Fix Trajectory Market Accounting Parity

### Issue

`claim_trajectory` does not mirror scalar claim accounting. It does not decrement `LockedCollateral`, does not call Blend unwind, and `resolve` accepts any non-empty `ResolvedVec` without matching checkpoint length.

Affected code:

- `contracts/contracts/distribution-market/src/lib.rs`
- `contracts/contracts/distribution-market/src/test.rs`
- `contracts/tests/tests/factory_lifecycle.rs`

### Fix

- Decrement `LockedCollateral` on successful trajectory claim.
- Validate `ResolvedVec.len() == Checkpoints.len()` before setting `ResolvedVec`.
- Decide whether BlendTap is supported for trajectory markets. If yes, add trade and claim parity. If no, reject `blend_adapter` for trajectory init and factory creation.
- Add regression tests for short resolver vectors and post-claim `free_collateral`.

### Acceptance Criteria

- A resolver cannot resolve a trajectory market with too few or too many outcome values.
- `free_collateral` and LP withdrawal accounting are correct after trajectory claims.
- Trajectory Blend behavior is explicit and tested.

## P2: Authenticate or Redesign Attested Disputes

### Issue

`resolver-attested::dispute` accepts a disputer address but does not call `require_auth`. Any caller can dispute a pending attested report and force the resolver into `Stale`.

Affected code:

- `contracts/contracts/resolver-attested/src/lib.rs`

### Fix

- If disputes are meant to be identity-bearing, call `disputer.require_auth()`.
- If disputes are meant to be permissionless, remove the unused address argument and document the griefing risk.
- Consider adding a bond or challenge evidence requirement before mainnet.

### Acceptance Criteria

- Tests cover unauthorized dispute rejection, or the API is explicitly permissionless and documented.
- The resolver cannot be griefed accidentally by a caller spoofing a disputer address.

## P2: Harden Reflector Trajectory Reads

### Issue

`resolver-reflector` falls back to `lastprice` when a checkpoint price is missing. For trajectory markets this can substitute future/current data for historical checkpoint data.

Affected code:

- `contracts/contracts/resolver-reflector/src/lib.rs`

### Fix

- Require checkpoint-specific data or a prior price within a configured freshness window.
- Return `Stale` when any checkpoint cannot be sourced safely.
- Add tests for missing, stale, and non-ascending checkpoint data.

### Acceptance Criteria

- A missing checkpoint cannot be filled with an unrelated latest price.
- Trajectory outcomes are stable and tied to their intended timestamps.

## P3: Add Numeric Envelope Guards

### Issue

Constructors and resolver reads accept broad `i128` WAD inputs. Several math paths use checked multiplication, assertions, or direct products that can panic for extreme values.

Affected code:

- `contracts/contracts/distribution-market/src/lib.rs`
- `contracts/contracts/market-factory/src/lib.rs`
- `contracts/contracts/resolver-reflector/src/lib.rs`
- `contracts/crates/kaido-math/src/*.rs`

### Fix

- Define protocol maximums for `k`, `b`, `mu`, `sigma`, checkpoint count, oracle decimals, and oracle price.
- Enforce the same bounds in factory and direct market initialization.
- Reject out-of-envelope resolver outcomes before settlement.

### Acceptance Criteria

- Extreme constructor and resolver inputs return contract errors instead of panicking.
- Bounds are documented in the relevant ADR or contract README.

## P3: Clean Up Release Hygiene

### Issue

The test run emitted warnings, including a duplicate unused `creator_bps` binding in fee accrual. The fuzz crate is documented but not implemented.

Affected code:

- `contracts/contracts/distribution-market/src/lib.rs`
- `contracts/fuzz/README.md`
- `contracts/Cargo.toml`

### Fix

- Remove the duplicate `creator_bps` read.
- Make `cargo clippy -- -D warnings` pass.
- Either implement the fuzz target or update docs so it is not presented as active coverage.

### Acceptance Criteria

- `cargo test` passes.
- `cargo clippy -- -D warnings` passes.
- Release docs accurately describe available fuzz/property coverage.

## Suggested Fix Order

1. Fix `worst_case_collateral` and its regression test.
2. Fix BlendTap settlement accounting.
3. Restrict LP withdrawals around unresolved liabilities.
4. Bring trajectory accounting to scalar parity.
5. Harden resolver dispute and checkpoint behavior.
6. Add numeric bounds.
7. Clean warnings and CI gates.

## Verification Commands

Run from `contracts/`:

```sh
cargo test -p kaido-math --lib
cargo test
cargo clippy -- -D warnings
```
