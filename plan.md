# UI Overhaul

## Goal

Make Kaido feel as easy and addictive as Polymarket while preserving the thing that makes it special: users are not buying YES or NO, they are placing a belief curve.

The core user should not feel like they are learning probability theory. They should feel like:

> I have a call. The crowd is wrong. I can size it. I know my max loss. If I nail it, I win.

Target user for this plan: crypto degens and active traders using a beta product.

Primary action to optimize: placing a prediction/trade.

## Product Rating Today

From a crypto-degen beta-user perspective, Kaido is currently around **4/10**.

The primitive is much stronger than the UX. Conceptually, “trade the shape of your belief” is a 9/10 idea because it gives traders something Polymarket cannot: a way to express target, conviction, and payoff zone in one position.

The current app does not yet deliver that feeling. The market list leads with contract addresses and protocol labels. The market detail page says “Market,” shows “Crowd belief,” then asks users to drag sliders with labels like “How spread your belief is” and `σ ≈ ...`. A degen does not immediately see the trade, the upside, the max loss, or why this is exciting.

## Core Product Loop

Kaido’s addictive loop should be:

1. User sees a market they have an opinion on.
2. User sees where the crowd is leaning.
3. User thinks the crowd is wrong.
4. User sets a target value.
5. User presses conviction tighter or wider.
6. User sees risk, max win, and worst case update instantly.
7. User places the belief.
8. User watches the position move against the crowd.
9. User shares/flexes the curve or comes back to adjust it.

The product should optimize this loop ruthlessly.

## Positioning

Do not position Kaido as:

- “Draw a probability distribution.”
- “Submit a Gaussian belief.”
- “Trade scalar or trajectory markets.”
- “Use a distribution AMM.”

Position Kaido as:

- “Call the number.”
- “Pick your payoff zone.”
- “Press your conviction.”
- “Fade the crowd.”
- “Trade the whole range, not just yes/no.”

The primitive stays intact. The language changes.

## UX Principle

Kaido should have **Polymarket-level surface simplicity** with a **Kaido-native trading action**.

Polymarket has:

- A clear market question.
- A visible chart.
- A simple trade box.
- Clear amount input.
- One big trade button.

Kaido should mirror that clarity, but not copy the YES/NO model. The equivalent Kaido ticket is:

- Your call.
- Conviction slider.
- Risk amount.
- Payoff preview.
- Place belief.

## New Mental Model

Use this translation layer across the UI:

- `mu` / center -> **Your call**
- `sigma` / width -> **Conviction**
- Distribution curve -> **Payoff zone**
- Consensus curve -> **Crowd target**
- Max collateral -> **Risk amount**
- Trade submission -> **Place belief**
- Difference from consensus -> **Your edge**

Never show `μ`, `σ`, “Gaussian,” or “scalar” in the default trading path.

## `/markets` Page Overhaul

### Current Problem

The current market cards identify markets by contract hash and protocol type:

- Contract address.
- Scalar / Trajectory.
- Resolver tier.
- Resolve time.
- Generic “Trade” CTA.

This has almost no degen pull. A user cannot scan the page and instantly feel “I have a take on this.”

### Target Experience

The market list should feel like a board of live opportunities.

Each card should answer:

- What is the question?
- What does the crowd think?
- Is this market hot?
- How much time is left?
- Where do I click to trade?

### Recommended Card Structure

Example:

```text
BTC close Dec 31
Crowd target: $105,000

24h volume: $30.4M
Moved: +3.5%
Closes in: 2d 4h

[ Trade range ]
```

### Card Requirements

Each market card should include:

- Human-readable market title.
- Crowd target or crowd center.
- Real mini curve showing crowd belief.
- 24h volume if available.
- Trader count if available.
- Consensus movement if available.
- Closing countdown.
- Status.
- One primary CTA: `Trade range`, `Place belief`, or `Make call`.

Contract address should move to a small metadata/details area.

### Market Sorting

Add degen-friendly filters:

- Hot.
- Closing soon.
- Biggest moves.
- New.
- High disagreement.

“High disagreement” is especially Kaido-native. If the crowd curve is wide, the market can be framed as “wide open.”

## `/markets/[id]` Page Overhaul

### Current Problem

The current page hierarchy is:

- Back link.
- Generic title: “Market.”
- Status.
- Countdown.
- “Crowd belief” chart.
- Trade panel.
- Advanced market details.

This feels like a protocol dashboard, not a trading screen.

### Target Layout

The page should feel like a trading venue:

- Header with the actual question.
- Market vitals.
- Crowd curve.
- Sticky trade ticket.
- Details and activity below.

Suggested desktop layout:

```text
 ---------------------------------------------------------
| Where will BTC close on Dec 31?       [Status] [Time]   |
| Volume $30.4M | Crowd $105k | Moved +3.5%              |
 ---------------------------------------------------------
|                                                       | |
|        Crowd curve + your curve overlay               | |
|                                                       | |
|        Commentary / activity / explanation            | |
|                                                       | |
|-------------------------------------------------------| |
|                                  CALL THE NUMBER      | |
|                                  Your call            | |
|                                  Conviction           | |
|                                  Risk                 | |
|                                  Payout preview       | |
|                                  [PLACE BELIEF]       | |
 ---------------------------------------------------------
```

On mobile, the trade ticket should become the main action panel immediately below the market summary.

### Header Copy

Replace “Market” with the actual user-facing question:

- “Where will BTC close on Dec 31?”
- “What will SOL be worth at market close?”
- “How much will ETH move by Friday?”

Subtitle examples:

- “Crowd target: $105,000.”
- “Trading closes in 2d 4h.”
- “Resolved by BTC/USD oracle.”

## Trade Ticket

### Core Ticket Model

The trade ticket should be:

```text
CALL THE NUMBER

Your call
BTC closes near $108,400
$3.4k above crowd

Conviction
Wide ───────●── Tight
Sniper · higher upside, less room to miss

Risk
25 USDC

If you nail it
Up to 6.2x

Worst case
-25 USDC

[ PLACE BELIEF ]
```

### Ticket Labels

Use:

- `Call the number`
- `Your call`
- `Conviction`
- `Risk`
- `If you nail it`
- `Worst case`
- `Place belief`

Avoid:

- `Take a position`
- `Submit position`
- `Max collateral`
- `Sigma`
- `Spread`
- `Scalar`
- `Trajectory`

## Your Call Slider

The first slider controls the center of the belief curve.

Label it:

- `Your call`
- `Outcome lands near`
- `Target`

The readout should be large and in market units:

```text
$108,400
```

Add relative crowd context:

```text
$3.4k above crowd
3.2% bullish vs crowd
```

This gives the user a reason to care. The trade becomes a stance against the market, not just a number input.

## Conviction Slider

Confidence should stay as a slider.

The slider should control how tight or wide the payoff zone is. It should not expose sigma.

Recommended label:

```text
Conviction
```

Slider endpoints:

```text
Wide ───────── Tight
```

Optional personality labels:

- Wide = “Chill”
- Middle = “Confident”
- Tight = “Sniper”

Copy below the slider:

```text
Tighter = more upside, less room to miss.
Wider = safer range, lower upside.
```

The curve must visually widen or tighten as the user drags. This is the key interaction. The user should learn the primitive by playing with it.

## Payoff Zone Visualization

The chart should not look like homework.

Frame it as a payoff zone:

```text
Bad miss     Still alive       Max payoff       Still alive     Bad miss
──────────────░░░░░░░░░░░█████████░░░░░░░░░░░──────────────
                         $108,400
```

Labels to use:

- Crowd target.
- Your call.
- Max payoff zone.
- Still alive.
- Miss zone.
- Tight range.
- Wide range.

The curve is the product’s signature. Do not hide it, but make it self-explanatory.

## Payout Preview

This is the highest-priority feature.

Every slider movement should update:

- Risk amount.
- Estimated max win.
- Estimated multiple.
- Worst case.
- Current crowd distance.

Example:

```text
You risk: 25 USDC
If you nail it: +154 USDC
Max multiple: 6.2x
Worst case: -25 USDC
Estimate at current crowd
```

If exact payout is not available client-side, show the best honest approximation and label it clearly:

```text
Estimated at current crowd.
Final quote shown before signing.
```

Before wallet signature, reconcile against the real simulated quote.

## Post-Trade State

Do not show only:

```text
Position opened. Refresh.
```

Replace it with a live position card:

```text
YOUR BELIEF IS LIVE

Call: $108,400
Conviction: Sniper
Risk: 25 USDC
Max win: 154 USDC

Currently: $2.1k above crowd
[ Share curve ] [ Adjust call ]
```

This creates the retention loop. After placing the trade, the user should want to watch it.

## Retention and Addiction Hooks

Use honest hooks, not fake urgency.

### Crowd vs You

Show the user’s position relative to consensus:

```text
You are 3.2% above crowd.
You are fading consensus.
You are inside the crowd range.
You are making a sniper call.
```

### Live Edge

After trading, show:

- Currently beating crowd.
- Needs BTC above $X to outperform.
- Your call moved closer/farther.
- Crowd moved toward you.

### Shareable Curve

Add:

- `Share my curve`
- Export image of user curve vs crowd curve.
- Include market title, target, conviction, and potential max win.

This is Kaido-native social sharing. It is more differentiated than sharing a YES/NO ticket.

### Calibration and Streaks

Add later:

- Calls settled.
- Beat crowd percentage.
- Calibration score.
- Streak.
- Best call.

Avoid ranking purely by volume. Whales will dominate and the leaderboard will feel rigged.

### Hot Market Discovery

Add market list signals:

- 24h volume.
- Biggest crowd moves.
- Closing soon.
- High disagreement.
- Trending markets.

These create reasons to check the app repeatedly.

## Degen-Friendly Copy System

### Use These

- Call the number.
- Place belief.
- Your call.
- Conviction.
- Payoff zone.
- Crowd target.
- Fade the crowd.
- Sniper.
- Wide range.
- Tight range.
- Max win.
- Max loss.
- Risk amount.
- You are above crowd.
- You are below crowd.

### Avoid These

- Gaussian.
- Sigma.
- Mu.
- Distribution, unless in advanced explanations.
- Scalar.
- Trajectory.
- Resolver tier.
- Max collateral.
- Submit position.
- How spread your belief is.

## Advanced Details

The following should be available but not in the default action path:

- Contract address.
- Oracle tier.
- Resolver.
- Scalar/trajectory type.
- Fee.
- Trading open/lock/resolve timestamps.
- LP actions.
- Recent activity.
- Market parameters.

Use progressive disclosure for these.

The user should never need to understand these details to place their first belief.

## Dark Pattern Guardrails

The product can be sticky without becoming scammy.

### Always Pair Upside With Downside

If the UI shows:

```text
Up to 6.2x
```

It must also show:

```text
Risk: 25 USDC
Worst case: -25 USDC
```

Do not make upside visually huge and downside hidden.

### Never Promise a Fill That Can Change

If the quote depends on current crowd state, label it:

```text
Estimate at current crowd.
Final quote shown before signing.
```

Unexpected worse fills will destroy trust.

### Do Not Fake Urgency

Real countdowns are good:

- Trading closes in 2h.
- Resolves tomorrow.
- Hot market.

Fake urgency is bad:

- “Only 2 spots left.”
- Fake flashing warnings.
- Artificial scarcity.

### Be Careful With “Can’t Lose More”

Only say:

```text
You can’t lose more than 25 USDC.
```

if it is true including fees and transaction edge cases. Otherwise say:

```text
Market risk capped at 25 USDC, excluding network fees.
```

## Implementation Priorities

### Quick Wins

- Replace “Market” with the actual market question.
- Replace contract hash titles on market cards with human-readable titles.
- Rename `Take a position` to `Call the number` or `Place belief`.
- Rename `Max to spend` to `Risk amount`.
- Rename `Submit position` to `Place belief`.
- Remove `σ ≈ ...` from the default UI.
- Add helper copy: `Tighter = higher upside, less room to miss.`
- Move contract/protocol details behind advanced disclosure.

### Medium Effort

- Redesign `/markets/[id]` into chart plus sticky trade ticket.
- Add crowd vs user readouts.
- Add confidence slider labels: Wide, Confident, Sniper.
- Add a plain-English pre-submit receipt.
- Add a post-trade position card.
- Replace decorative market card curve with a real mini belief curve.

### Major Investment

- Add live payout simulation on slider movement.
- Add final quote reconciliation before wallet signing.
- Add live PnL/position tracking.
- Add shareable curve images.
- Add calibration and streak system.
- Add hot market ranking based on volume, movement, and disagreement.

## Final Direction

Kaido should not be “prediction markets with more complicated graphs.”

Kaido should be:

> The place where you call the exact number, press your conviction, and trade your edge against the crowd.

The UX should make that feel instant.

