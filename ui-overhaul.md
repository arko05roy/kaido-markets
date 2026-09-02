# UI Overhaul — Remaining Work

Companion to [`plan.md`](./plan.md). That doc defines **product direction and copy**. This doc is the **implementation backlog** for everything still missing in the web app — pages, components, modals, drawers, toasts, and polish.

**Baseline (already shipped):** `/markets` board, `/markets/[id]` trading layout, degen copy on trade ticket, belief sliders + crowd overlay, heuristic payout preview, post-trade inline card, `/create` wizard, settlement/claim panel, `ResultCard` text share, leaderboard (bare), recent activity feed, Blend depth badge.

**Goal:** Close the gap between “demo-video-ready with prep” and “degen lands cold and trades in 30 seconds.”

---

## 1. Design primitives to add first

No modal/dialog/toast layer exists today (`web/components/ui/` is button + sliders only). Add a thin shared layer before feature modals.

| Primitive | Purpose | Suggested approach |
|-----------|---------|-------------------|
| `Dialog` | Confirmations, receipts, wallet gate, errors | Radix `@radix-ui/react-dialog` or headless pattern matching `kaido-ui` tokens |
| `Sheet` / `Drawer` | Mobile trade ticket, position detail, filters | Bottom sheet on `<lg`, side panel on desktop |
| `Toast` | Trade success/fail, copy, claim | Sonner or minimal custom; stack top-right |
| `Popover` | Risk presets, conviction tooltips, “?” explainers | For inline help without leaving flow |
| `Tabs` | Market detail: Trade / Positions / Activity | Sticky ticket stays visible on Trade tab |

**Visual tokens (reuse everywhere):**

- Surface: `#0a0a0b` panel, `#080809` inset, border `white/10`
- Accent: `#d8c69a` eyebrow, `#f3efe6` body text
- Success: `emerald-500/25` border (belief live, claim)
- Danger: `red-300/90` (worst case, errors)

---

## 2. New routes & nav

| Route | Purpose | Nav |
|-------|---------|-----|
| `/positions` | All open + settled beliefs for connected wallet | **Positions** (between Markets and Create) |
| `/positions/[marketId]` | Optional deep link; else filter on `/positions` | — |

**Header updates (`site-header.tsx`):**

```
Markets · Positions · Create · Leaderboard
```

Connected wallet pill: show USDC balance + link to faucet when zero (not only on trade panel).

---

## 3. Modals, sheets & popups (full inventory)

### 3.1 Wallet & onboarding

| ID | Trigger | Type | Content | Actions |
|----|---------|------|---------|---------|
| `wallet-connect` | “Place belief” without wallet; Connect in header | Dialog | Freighter logo, one-line “Sign beliefs on Stellar testnet”, link to install | Connect Freighter · Cancel |
| `wallet-no-usdc` | Trade click with 0 USDC | Dialog | “You need testnet USDC”, balance 0, faucet link | Open faucet (ext) · Done |
| `wallet-wrong-network` | Freighter on wrong network | Dialog | Expected network + passphrase hint | Retry connect · Cancel |

### 3.2 Trade flow

| ID | Trigger | Type | Content | Actions |
|----|---------|------|---------|---------|
| `trade-receipt` | After “Place belief”, **before** Freighter sign | Dialog (blocking) | Your call, conviction label, risk, **simulated quote** (collateral, est. max payout, fee), disclaimer “Final on-chain quote may differ” | Confirm & sign · Back to edit |
| `trade-submitting` | On sign in flight | Dialog (non-dismiss) | Spinner + “Waiting for signature…” | — |
| `trade-success` | Tx confirmed | Toast + optional Dialog | “Belief is live” + position # | View position · Share curve · Dismiss |
| `trade-error` | Simulation/submit fail | Dialog | Human error from `formatContractTradeError` (no `σ` in UI) | Try again · Get USDC · Dismiss |

**Receipt modal is P0** — replaces direct `kaido.trade()` on button click. Wire quote via SDK simulate (not `estimatePayoutPreview` alone).

### 3.3 Post-trade & positions

| ID | Trigger | Type | Content | Actions |
|----|---------|------|---------|---------|
| `position-detail` | Click row on `/positions` or “View position” | Sheet (mobile) / Dialog (desktop) | Live card: call, conviction, risk, max win, edge vs crowd, mini chart, market link | Adjust call (→ market) · Share curve · Close |
| `position-live-expanded` | “Share curve” from live card | Dialog | Export-ready chart: market title, your vs crowd curves, call, conviction, max win | Download PNG · Copy link · Share (native) |
| `adjust-call` | From live card when market still open | Sheet | Embeds compact `ScalarBeliefInput` + risk; places **new** position (not edit on-chain) | Place new belief · Cancel |

Note: on-chain positions are immutable; “Adjust call” = new trade, copy should say so.

### 3.4 Settlement & claim

| ID | Trigger | Type | Content | Actions |
|----|---------|------|---------|---------|
| `claim-receipt` | Before claim sign | Dialog | Position #, collateral, estimated payout | Confirm claim · Cancel |
| `claim-success` | Claim tx ok | Toast + Dialog | P&L summary + `ResultCard` embed | Share result · Done |
| `resolve-pending` | Market locked, awaiting oracle | Non-modal banner | Countdown to resolve, phase label | — |
| `dispute-info` | T2 disputable state | Dialog | Explain dispute window, bond | Learn more · Dismiss |

### 3.5 Create market

| ID | Trigger | Type | Content | Actions |
|----|---------|------|---------|---------|
| `create-review` | Final wizard step before deploy | Dialog | Question, type, schedule, seed crowd, resolver tier (plain English) | Deploy market · Back |
| `create-success` | Factory tx confirmed | Dialog | Market address (truncated), “Saved question”, link to trade | Trade now · Copy address · Done |
| `create-error` | Deploy fail | Dialog | Error + common fixes (σ floor, window order) | Retry · Dismiss |

### 3.6 Market list & discovery

| ID | Trigger | Type | Content | Actions |
|----|---------|------|---------|---------|
| `market-filters` | Filter icon on mobile | Sheet | Hot, Closing soon, Wide open, New, High disagreement | Apply · Reset |
| `market-empty` | No markets | Full-page (exists) | Add CTA to create + link to docs | Create market |
| `market-metadata` | “…” on card | Popover | Contract id (copy), oracle tier, type | Copy address |

### 3.7 Liquidity (advanced)

| ID | Trigger | Type | Content | Actions |
|----|---------|------|---------|---------|
| `lp-confirm` | Add/remove LP | Dialog | Amount, pool share est., warnings | Confirm · Cancel |
| `lp-success` | LP tx ok | Toast | Amount added/removed | — |

Keep LP behind `AdvancedBlock`; modals only when user explicitly LP’s.

### 3.8 Global

| ID | Trigger | Type | Content |
|----|---------|------|---------|
| `first-visit` | `localStorage` flag | Dialog (dismiss forever) | 3-step: Call the number → Press conviction → Place belief. No math. | Got it |
| `rpc-error` | Markets page fetch fail | Inline + toast | Retry button, show RPC host |
| `stale-market` | Trade on locked market (deep link) | Banner on `/markets/[id]` | “Trading closed” + link to open markets or create |

---

## 4. Page-by-page work

### 4.1 `/` (Hero)

**Add:**

- Primary CTA → `/markets` (not only scroll)
- Secondary → 45s product loop (optional embedded clip for demo video landing)
- “How it works” anchor → short 3-step strip matching `first-visit` modal

**No modals required** on hero.

---

### 4.2 `/markets`

**Card additions (per `plan.md`):**

```text
BTC close Dec 31
Crowd target: $105,000
[mini curve]

24h volume: $X   ·   Traders: N   ·   Moved: +3.5%
Closes in: 2d 4h

[ Trade range ]
```

| Field | Source | Fallback |
|-------|--------|----------|
| 24h volume | Sum `Trade` event collateral last 24h (`lib/indexer`) | Hide row |
| Trader count | Unique traders from events | Hide row |
| Crowd moved | Δ crowd μ vs 24h ago (store snapshot server-side or compute from events) | Hide row |
| Human title | `market-questions.json` → `displayMarketQuestion` | Auto question |

**Filter fixes:**

| Filter | Current | Target |
|--------|---------|--------|
| Hot | Open-first sort | Sort by 24h volume desc, then open |
| Closing soon | Lock time asc | Keep |
| Wide open | σ desc | Keep (rename tooltip: “High disagreement”) |
| New | Reverse list | Keep |
| Biggest moves | Missing | Add: sort by \|Δ crowd μ\| 24h |

**New components:**

- `MarketCardStats` — volume / traders / moved row
- `MarketFilterSheet` — mobile filters

---

### 4.3 `/markets/[id]`

**Header / vitals (`MarketVitals`):**

Add row matching plan:

```text
Volume $X  |  Crowd $105k  |  Moved +3.5%  |  Closes in 2d 4h
```

**Chart area:**

| Item | Current | Target |
|------|---------|--------|
| Crowd-only on page load | `ConsensusChart` | Keep as default view |
| Your overlay on ticket | In `ScalarBeliefInput` only | Also show faint “your curve” on main chart when sliders move (sync state up) |
| Payoff zone labels | Minimal | Add band labels: Bad miss · Still alive · Max payoff · Miss zone |
| Commentary strip | Missing | Optional 1-line under chart: “Crowd thinks $105k. You’re calling $108k. Fade the crowd.” |

**Trade ticket:**

| Item | Current | Target |
|------|---------|--------|
| Payout | `estimatePayoutPreview` heuristic | **Simulated quote** from contract (`simulate` trade); show in ticket + receipt modal |
| Risk input | Free number | Presets: 10 · 25 · 50 · 100 USDC chips + custom |
| Place belief | Direct submit | Open `trade-receipt` modal → sign |
| Post-trade | Inline `PositionLiveCard` | Keep + add **Share curve** · **Adjust call** buttons |
| Trajectory | No payout preview | Add trajectory payout est. or honest “Estimate unavailable” + same receipt flow |

**Mobile:**

- Sticky bottom bar: “Your call: $108.4k · 6.2x · Place belief”
- Tap opens full ticket `Sheet`

**Tabs (below header):**

- **Trade** (default) — chart + ticket
- **Your positions** — wallet positions on this market
- **Activity** — move `RecentActivity` here from advanced section

**Advanced block:** contract, oracle, fees, LP — unchanged, collapsed.

---

### 4.4 `/positions` (new page)

**Purpose:** Portfolio hub. Chain has no “list my positions”; merge `localStorage` + `fetchWalletPositions` indexer.

**Layout:**

```text
YOUR CALLS                                    [Connect wallet]

Open (2)  ·  Settled (5)  ·  All

┌─────────────────────────────────────────────────────────┐
│ Where will BTC close Friday?              Open · 2d left │
│ Call $108,400 · Sniper · Risk 25 USDC                   │
│ +$2.1k above crowd · Est. max win +154 USDC             │
│ [mini curve]                    [Trade] [View]            │
└─────────────────────────────────────────────────────────┘
```

**Row actions:** View → `position-detail` sheet. Trade → `/markets/[id]`.

**Empty states:**

- No wallet → `wallet-connect` modal CTA
- Wallet, no positions → “No beliefs yet” + link `/markets`

**Live updates:** Poll crowd μ every 30s for open positions; update edge label (“Crowd moved toward you”).

---

### 4.5 `/create`

**Wizard polish:**

| Step | Add |
|------|-----|
| Question | Required; live preview on card mock; char limit 120 |
| Market type | Plain copy; hide “Scalar/Trajectory” in default path (advanced toggle) |
| Schedule | Presets: “1 hour demo”, “24 hours”, “7 days” + custom |
| Starting crowd | Conviction slider only in default path; hide raw σ input behind Advanced |
| Settlement | Tier cards (exist); default Oracle feed for video/demo |
| Review | `create-review` modal before tx |

**Post-create:** `create-success` modal → auto `saveMarketQuestion`.

---

### 4.6 `/leaderboard`

**Restyle** to match `AppShell` + `kaido-ui` (currently generic `main` / `muted-foreground`).

**Add:**

- Empty state illustration + “Trade on a market and wait for resolution”
- Forecaster = truncated G-address with copy
- Link row → wallet’s positions (if public indexer allows) or “Your rank” when connected
- Optional: “Beat crowd %” column (from calibration scores)

**No modals.**

---

## 5. Share & export

| Feature | Current | Target |
|---------|---------|--------|
| Share text | `ResultCard` copy/share | Keep |
| Share image | Missing | `position-live-expanded` + claim result: `html-to-image` or canvas export of `BeliefChart` + branding |
| OG meta | Missing | Dynamic `og:image` per market (later); static default for now |

**Share image must include:** market question, your call, conviction label, crowd target, both curves, max win, Kaido wordmark.

---

## 6. Copy & error cleanup

**Remove from default UI path:**

- `μ`, `σ`, Gaussian, scalar, trajectory, resolver tier, max collateral

**Fix existing leak:**

- `formatContractTradeError` σ message → “Conviction is too tight — widen your range.”

**Always pair:**

- Max multiple ↔ Worst case ↔ Risk amount (already on ticket; repeat in receipt modal)

**Quote disclaimer (everywhere estimates show):**

```text
Estimated at current crowd. Final quote shown before signing.
```

---

## 7. Data & backend hooks (UI depends on these)

| Need | Work |
|------|------|
| Simulated trade quote | SDK: `simulateTrade()` → collateral, fee, max payout |
| 24h volume / traders | `getMarketEvents` aggregation (extend `lib/indexer`) |
| Crowd movement | Event snapshot or periodic μ cache in `data/market-stats.json` |
| Position list | `fetchWalletPositions` + `loadPositions` merge (exists); wire to `/positions` |
| Market questions | Prompt on create; seed demo markets in `market-questions.json` for video |

---

## 8. Demo video checklist (UI-specific)

Before recording:

1. Seed `market-questions.json` with punchy titles for demo market ids
2. Create market with **24h+** lock window (not 1h deploy default)
3. Verify `trade-receipt` → sign → `trade-success` toast flow
4. Hide empty leaderboard from reel (or seed one resolved market)
5. Desktop width ≥ 1280 for sticky ticket layout
6. Mobile B-roll: bottom sheet ticket if implemented

---

## 9. Implementation priority

### P0 — Demo video & trust

1. `Dialog` + `Toast` primitives
2. `trade-receipt` modal with simulated quote
3. `wallet-connect` / `wallet-no-usdc` modals
4. `trade-success` toast + expanded live card actions (Share curve stub → PNG)
5. Copy fix: no `σ` in errors
6. Seed market questions + vitals countdown visible on stale markets banner
7. Risk amount presets on ticket

### P1 — Core loop completion

1. `/positions` page + `position-detail` sheet
2. Market card stats (volume, traders) when indexer data exists
3. Real hot / biggest-moves filters
4. Main chart sync with your curve overlay
5. `create-review` + `create-success` modals
6. Leaderboard visual restyle
7. Mobile trade `Sheet` + sticky CTA bar

### P2 — Retention & polish

1. `first-visit` modal
2. Live edge updates on open positions
3. Share image export (full branded)
4. Payoff zone band labels on chart
5. `adjust-call` sheet (new trade)
6. `claim-receipt` / `claim-success` modals
7. LP confirm modals
8. Dynamic OG images

---

## 10. Acceptance criteria (done = ship)

- [ ] User can connect wallet from trade click without hunting header
- [ ] User sees receipt with on-chain-simulated quote before every sign
- [ ] User never sees `μ`/`σ`/Gaussian on default trade path
- [ ] After trade: toast + card with Share + link to position detail
- [ ] `/positions` lists all beliefs for wallet across markets
- [ ] Market cards show human question + crowd target + close time; stats when data available
- [ ] Create flow ends in success modal with link to trade
- [ ] Leaderboard matches app visual system
- [ ] Mobile: trade ticket usable without horizontal scroll
- [ ] Demo script (create → trade → live card) completable in < 2 minutes with no dead ends

---

## 11. File map (suggested)

```
web/components/ui/dialog.tsx
web/components/ui/sheet.tsx
web/components/ui/toast.tsx
web/components/modals/trade-receipt-modal.tsx
web/components/modals/wallet-gate-modal.tsx
web/components/modals/position-detail-sheet.tsx
web/components/modals/share-curve-modal.tsx
web/components/modals/create-review-modal.tsx
web/components/market/market-card-stats.tsx
web/components/market/mobile-trade-bar.tsx
web/components/market/payoff-zone-labels.tsx
web/components/positions/positions-board.tsx
web/app/positions/page.tsx
web/lib/market-stats.ts          # 24h volume, traders, crowd delta
web/lib/trade-quote.ts           # simulate wrapper for receipt UI
```

---

## 12. Relationship to `plan.md`

| `plan.md` section | This doc section |
|-------------------|------------------|
| Quick wins | §6 copy, partial §4.3 ticket |
| Medium effort | §4.3, §4.4, §3 modals, §4.6 |
| Major investment | §5 share images, §7 live quote, §4.2 volume/heat |

When in doubt, **copy from `plan.md`**, **build specs from this doc**.
