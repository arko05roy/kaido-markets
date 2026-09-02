# ADR-5 — Resolver is an interface, not a contract

- **Status:** Accepted (Sprint 0; trait finalised in Sprint 2, tiers T1–T3 in Sprints 5–6)
- **Context:** build.md §2.5; whitepaper Part II §17

## Decision

A market does **not** hard-code how its outcome is determined. `kaido-common`
defines a `Resolver` trait (shape, to be finalised in Sprint 2):

```rust
// sketch — exact signatures land with distribution-market in Sprint 2
trait Resolver {
    fn resolve(env: Env) -> Vec<i128>;   // the realised outcome value(s)
    fn dispute(env: Env, /* ... */);     // open/escalate a challenge
    fn status(env: Env) -> ResolverStatus;
}
```

A `DistributionMarket` stores only the resolver's **address** and its declared
**trust tier**:

| Tier | Resolver crate | How it resolves | Trust assumption |
|------|----------------|-----------------|------------------|
| T0   | `resolver-reflector`  | reads a Reflector SEP-40 price feed (TWAP-style for short windows) | a robust on-chain oracle |
| T1   | `resolver-attested`   | signed report from a permissioned poster + challenge window | a named data provider's key + a watcher |
| T2   | `resolver-optimistic` | propose/dispute with bonds; undisputed-after-window ⇒ final; disputes escalate | economic (one honest disputer) |
| T3   | `resolver-designated` | a single named party reports | that party |

## Consequences

- New outcome sources are new contracts implementing `Resolver`, not changes to
  the AMM. Third parties can ship their own resolvers (the SDK exposes a helper;
  see the M2/M3 deliverables).
- **The tier badge is a non-negotiable UI element** — it is rendered everywhere
  a market appears, audited for prominence (build.md E15, Sprint 6). The tier is
  declared on-chain so the UI can't lie about it.
- On a stale/garbage feed or a malformed signed report the market enters a
  *disputable / paused* state — never a bad payout (Sprint 2 acceptance; the
  oracle-failure drill in §6 item 11).
- HouseVault and LP economics are independent of the resolver; the resolver only
  supplies `x₀` at settlement time.
