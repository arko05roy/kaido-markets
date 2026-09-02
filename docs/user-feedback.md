# User feedback

Kaido includes a lightweight feedback entry point across the product.

## Experience

- The `Share feedback` control stays available in the lower-right corner.
- People can classify a note as an idea, issue, or question.
- The form accepts up to 500 characters and keeps the send action disabled until there is content.
- After sending, the interface confirms receipt and shows a short success toast.

## Storage

The latest submission is stored in the browser under `kaido-latest-feedback` with its category, message, and submission time. This keeps the interaction useful while a server-side feedback destination is being connected.

## Accessibility

The form uses a labeled textarea, button labels, keyboard-focusable controls, and a toast announcement for the submission result.

## Illustrative early-feedback examples

The entries below are product-research examples. They are not verified user
testimonials, not mainnet-user evidence, and must not be used in Level 6
onboarding or feedback-implementation tables.

### Idea — Kaido User 1

“The belief surface is the strongest part of Kaido. I would like to save a
forecast before trading so I can compare my original view with the final
market curve after resolution.”

### Idea — Kaido User 2

“The concept makes more sense when I see the curve move than when I read the
mechanism. A short guided example for a BTC close market would help new users
understand why this is more expressive than a YES/NO market.”

### Issue — Kaido User 3

“Before adding liquidity, I want one compact view showing locked collateral,
free collateral, pending fees, and the conditions for withdrawal. Those values
are important for deciding how much capital to provide.”

### Question — Kaido User 4

“When a market is waiting for resolution, can the page show exactly what data
source will settle it, when the window closes, and what I need to do next to
claim a payout?”

### Idea — Kaido User 5

“A history view for my forecasts would make Kaido more useful over time. I
want to review the center, confidence band, outcome, and payout for each
position so I can improve my calibration.”
