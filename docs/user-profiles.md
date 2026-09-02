# Kaido user profiles

These profiles describe the people Kaido is designed to serve and provide a
shared vocabulary for product demos, onboarding copy, and acceptance tests.

## Mira — the informed forecaster

Mira follows crypto markets closely and has a view on where BTC will close, but
does not want to maintain a collection of binary threshold positions.

- **Goal:** express a price range and confidence in one position.
- **Typical action:** opens a BTC/USD close market, sets a center near her
  estimate, narrows the confidence band, reviews the quote, and trades.
- **What success looks like:** she can explain her forecast as a curve and see
  the resulting payout after resolution.
- **Important product needs:** clear center/confidence controls, visible
  worst-case collateral, and an understandable settlement state.

## Arjun — the market creator

Arjun runs a research community and wants to turn measurable questions into
markets without needing a custom backend.

- **Goal:** publish a well-scoped market with a clear outcome range and a
  trusted resolution path.
- **Typical action:** chooses a scalar or trajectory market, sets the question,
  window, outcome bounds, resolver tier, and opening liquidity.
- **What success looks like:** participants understand the question, the
  market is discoverable, and the result resolves without manual coordination.
- **Important product needs:** guided market creation, resolver explanations,
  parameter validation, and a shareable market link.

## Leena — the liquidity provider

Leena is comfortable supplying capital when she can understand the exposure
and the conditions for withdrawing it.

- **Goal:** support useful markets while earning a transparent share of fees.
- **Typical action:** reviews available collateral and locked exposure, adds
  liquidity, monitors the market, and removes liquidity after positions settle.
- **What success looks like:** she can see free collateral, pending fees, and
  the conditions that affect withdrawal before committing funds.
- **Important product needs:** exposure summaries, fee accounting, withdrawal
  guards, and clear risk language.

## Noah — the careful explorer

Noah is new to distribution markets and wants to learn with a small testnet
position before committing to a strategy.

- **Goal:** understand the product by following a complete forecast lifecycle.
- **Typical action:** connects a Stellar wallet, browses an active market,
  adjusts the belief surface, previews the quote, trades, and returns to claim
  after resolution.
- **What success looks like:** he always knows what the market asks, what he
  is risking, and what action is available next.
- **Important product needs:** simple explanations, network and asset
  guidance, readable transaction states, and useful empty/error states.

## Shared journey

1. Connect a Stellar testnet wallet.
2. Discover a market with a plainly written question and resolution method.
3. Set a center and confidence band on the Belief Surface.
4. Review cost, maximum payout, and worst-case collateral.
5. Sign the trade and follow the market through lock, resolution, and claim.

