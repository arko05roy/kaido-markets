# indexer

Thin event reader over Stellar RPC `getEvents`. Server-side only — keeps no
secrets, holds no business logic, decodes raw `EventResponse` payloads into
typed shapes for the UI (ADR-10, build.md §5 Sprint 4).

## API

```ts
import { getMarketEvents } from "@/lib/indexer";

// last day of activity for a market, capped at 50
const events = await getMarketEvents(marketId);

// every Trade in the last day
const trades = await getMarketEvents(marketId, { name: "Trade" });

// resume from a known ledger
const since = await getMarketEvents(marketId, { startLedger: 1_234_567 });
```

For live streaming inside a client component use
`Kaido.subscribeEvents(...)` from `@kaido/sdk` instead — it polls the same
RPC endpoint with a cursor-resumable loop.

## Known event names

`MarketCreated`, `Trade`, `TradeTrajectory`, `LiquidityAdded`,
`LiquidityRemoved`, `Resolved`, `ResolvedTrajectory`, `MarketRegistered`,
`Seeded`, `Withdrawn`, `Deposited`, `CapSet` — these match the
`#[contractevent]` struct names in the Rust crates.
