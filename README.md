# Kaido

**The first distribution-market primitive on Stellar.**  
Bet on where a number lands — not whether it crosses a line.

```text
   Traditional prediction market:       Kaido:
   "Will BTC close above $70k?"          "Where does BTC close on Friday?"

   ┌────────┐  ┌────────┐                         ╱╲
   │  YES   │  │   NO   │                        ╱  ╲
   │  38¢   │  │  62¢   │                       ╱    ╲
   └────────┘  └────────┘                    ╱        ╲___
                                           ─────────────────
   $1 if right, $0 if wrong               $60k   $68k   $80k

   Outcome space: 1 bit                   Outcome space: any number
   Position: a share                      Position: a curve
   Payout: binary                         Payout: scales with accuracy
```

[Whitepaper](./kaido-whitepaper.md) · [Build plan](./build.md) · [Architecture decisions](./docs/adr/)

---

## Live Links

- Production app: https://kaido-cyan.vercel.app/
- X / launch profile: https://x.com/kaidomarkets
- X / launch post: https://x.com/kaidomarkets/status/2068592591051071557?s=20

---

## Demo Video

- [Product walkthrough — voiceover](https://youtu.be/OgPWWf3nyto)
- [Product walkthrough — no voice](https://youtu.be/ILiez9hhDGY)

---

# User Excel Sheet (60+ users)

Sheet - https://docs.google.com/spreadsheets/d/1YQnSM6HBn1tFuu6D_6AYoWhP4ogM74c3DbehD4FayIg/edit?usp=sharing
Summary - https://docs.google.com/document/d/1B0UL2CXzapLUw3I7YVD1kcKL8YDNTikY_bHcfkiMxyk/edit?usp=sharing

## User Feedback Summary

Kaido collected 64 user signups and feedback responses from early interested users.

### What users want most

1. Simple and easy-to-use prediction markets.
2. Crypto, sports, and live-event markets.
3. Early-access rewards such as whitelist spots, airdrops, and community incentives.
4. Real-time insights including market analytics, sentiment, and better decision support.
5. A fast, smooth, secure, and cheap product experience.

### Main user groups

- The degen user: wants rewards, profits, and high-volatility markets.
- The crypto trader: wants token-price, DeFi, and ecosystem-event markets.
- The casual explorer: wants a simple way to try prediction markets without deep prior knowledge.
- The power user: wants live markets, advanced strategies, and better analytics.
- The community promoter: wants early access and is willing to share Kaido on X.

### Feature demand seen in the feedback

- Crypto price prediction markets
- Sports and live-event prediction markets
- Real-time market analytics
- DeFi-focused markets
- Cross-chain market ideas
- Simple market discovery
- Reward and referral systems
- Secure wallet integration
- Fast settlement

### Problems visible in the feedback

Many responses are high intent but low detail, including short entries such as "bullish", "gib WL", or reward-focused replies. That suggests strong curiosity and speculative interest, but also a product-education gap. Some responses should be treated as low-quality feedback when prioritizing roadmap work.

### Overall conclusion

The strongest product direction is clear: Kaido should position itself as a simple, fast, degen-friendly prediction-market app for crypto, sports, and live events, while improving onboarding so reward-seeking early users convert into real active traders.

## Next Phase Improvements Based on Feedback

- Improve onboarding and first-trade clarity so new users understand the belief-curve model faster. Related commits: [47a06a2](https://github.com/aarambhlabs/kaido/commit/47a06a2), [c2d0058](https://github.com/aarambhlabs/kaido/commit/c2d0058), [46ee295](https://github.com/aarambhlabs/kaido/commit/46ee295)
- Expand high-interest market categories, especially crypto and live-event flows. Related commits: [6372500](https://github.com/aarambhlabs/kaido/commit/6372500), [7a75fed](https://github.com/aarambhlabs/kaido/commit/7a75fed)
- Strengthen wallet, position-tracking, and smoother trading UX for repeat users. Related commits: [a0094b6](https://github.com/aarambhlabs/kaido/commit/a0094b6), [7ae9d61](https://github.com/aarambhlabs/kaido/commit/7ae9d61)
- Keep hardening contract safety before broader mainnet exposure. Related commits: [32144e2](https://github.com/aarambhlabs/kaido/commit/32144e2), [0f1dff1](https://github.com/aarambhlabs/kaido/commit/0f1dff1)

## Description

Kaido is a prediction market where the outcome is a **number**, not a binary YES/NO result.

Instead of buying a share that pays only when a threshold is crossed, users express two things:

1. **Where they think the result will land** — a center value such as a price, score, margin, count, or percentage.
2. **How confident they are** — a narrow or wide confidence band around that value.

Kaido converts this belief into a payout curve. When the final result arrives, the protocol pays the user according to the height of their curve at the resolved value.

```text
   Prediction: BTC closes at $68,200
   Confidence: tight range of ±$1,400

              highest payout
                    ↓
                  ╱╲
                 ╱  ╲
                ╱    ╲
               ╱      ╲            final result: $68,600
             ╱          ╲                 │
           ╱              ╲___            ▼
   ─────────────────────────|────────────────────►
   $60k              $68k   ▲   $70k           $80k
                         payout = curve height
                         at the final result
```

A tight prediction can produce a larger payout when accurate. A wider prediction covers more possible outcomes but reduces the peak reward.

---

## Mainnet Contract Address — Mandatory

> ### Stellar Mainnet Deployment
>
> **Distribution Market Contract**  
> [`CBRZBLU224KTJSANZIKAOHLXMQUV6GHQBEK5QAK46456WKY2BE6QZXA6`](https://stellar.expert/explorer/public/contract/CBRZBLU224KTJSANZIKAOHLXMQUV6GHQBEK5QAK46456WKY2BE6QZXA6)
>
> **Deployment Transaction**  
> [`d3650b7c1d7d3a10a54c6e859ff4e318d1091b74ea5eb2fcee7438bed67493f4`](https://stellar.expert/explorer/public/tx/d3650b7c1d7d3a10a54c6e859ff4e318d1091b74ea5eb2fcee7438bed67493f4)
>
> **Network:** Stellar Public Mainnet

This is Kaido's mainnet pilot deployment of the core distribution-market contract.

## Security Review and Audit Documentation

Kaido's repository includes an internal contract audit findings and remediation
plan covering collateral sizing, settlement accounting, LP withdrawals,
trajectory markets, resolver disputes, oracle reads, numeric bounds, and release
hygiene:

- [Contract audit findings and fix plan](docs/contract-audit-fixes.md)
- [Audit regression tests](contracts/crates/kaido-math/src/tests_oracle.rs)

This documentation represents an internal security review and remediation
record. It is not presented as a completed independent third-party audit.

---

## Features

- **Numerical prediction markets** for prices, scores, margins, counts, percentages, and other measurable outcomes.
- **Belief-based positions** defined by a center value and confidence range.
- **Accuracy-weighted payouts** instead of all-or-nothing binary settlement.
- **Single-market liquidity** across an outcome range instead of fragmented threshold markets.
- **Pre-trade quotes** for cost, maximum payout, and worst-case outcome.
- **Permissionless market creation** with configurable ranges, resolution times, fees, and resolvers.
- **Soroban smart contracts** for collateral custody, trade pricing, and deterministic settlement.
- **Multiple resolver tiers** for trustless, attested, optimistic, and designated outcomes.
- **Stellar wallet integration** for transaction signing and position management.

---

## Problem We Are Solving

Most prediction markets force continuous outcomes into binary questions.

To express a view on BTC's closing price, a user may need several separate markets:

- Will BTC close above $65,000?
- Will BTC close above $70,000?
- Will BTC close above $75,000?

This creates three major problems:

1. **Beliefs are compressed.** A detailed forecast becomes only YES or NO.
2. **Liquidity is fragmented.** Capital is split across many threshold markets covering the same event.
3. **Accuracy is poorly represented.** A prediction that misses by $100 can receive the same result as one that misses by $20,000.

Binary markets are useful when the real-world outcome is binary. They are much less expressive when the outcome naturally exists on a numerical range.

---

## How We Are Solving It

Kaido represents every position as a **curve across the full outcome range**.

The user's center determines where the curve peaks. Their confidence determines how narrow or wide the curve becomes. Their stake determines how much capital backs the position.

When the market resolves:

1. A resolver submits the final numerical outcome.
2. The Soroban contract evaluates the user's curve at that value.
3. The payout is calculated from the curve height and market state.
4. Settlement is executed on Stellar.

This allows one market to represent many possible outcomes while rewarding precision proportionally.

### How a Bet Works

```text
       Create                 Trade                  Resolve
         │                      │                       │
         ▼                      ▼                       ▼
   ┌──────────┐          ┌──────────┐           ┌──────────┐
   │  Market  │ ───────► │ Position │ ────────► │ Payout   │
   └──────────┘          └──────────┘           └──────────┘

   Creator sets:         User selects:           Resolver reports:
   • question            • center value          • final number
   • outcome range       • confidence range
   • resolver            • stake                 Contract:
   • resolution time                              • evaluates curve
   • fee                 UI displays:             • settles payout
                         • cost
                         • maximum payout
                         • worst case
```

Anyone can create a market and anyone can take a position. The protocol earns a fee on trades, while liquidity providers earn from facilitating market activity.

---

## Architecture Diagram

```text
┌──────────────────────────────────────────────────────────────┐
│                         Web App                              │
│              Next.js 16 · App Router · TypeScript           │
│                                                              │
│ Browse markets · Create market · Build belief curve          │
│ View quotes · Connect wallet · Track positions                │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                       @kaido/sdk                             │
│                                                              │
│ createMarket · trade · resolve · positions · quotes           │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│               Generated Contract Bindings                    │
└──────────────────────────────┬───────────────────────────────┘
                               │ Stellar RPC
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  Soroban Smart Contracts                     │
│                                                              │
│  ┌─────────────────┐       ┌──────────────────────────────┐  │
│  │ Market Factory  │──────►│ Distribution Market          │  │
│  │ creates markets │       │ • holds collateral           │  │
│  └────────┬────────┘       │ • prices positions           │  │
│           │                │ • calculates payouts         │  │
│           ▼                │ • settles markets            │  │
│  ┌─────────────────┐       └──────────────┬───────────────┘  │
│  │ Registry        │                      │                  │
│  │ indexes markets │              ┌───────▼────────┐         │
│  └─────────────────┘              │ Resolver Layer │         │
│                                   └───────┬────────┘         │
│  ┌─────────────────────────────────────┐  │                  │
│  │ kaido-math                          │  │                  │
│  │ fixed-point distribution math      │  │                  │
│  └─────────────────────────────────────┘  │                  │
└───────────────────────────────────────────┼──────────────────┘
                                            │
                         ┌──────────────────▼─────────────────┐
                         │ External Data and Stellar Assets   │
                         │ Reflector oracle · USDC SAC        │
                         └────────────────────────────────────┘
```

### System Layers

**On-chain layer:** Rust contracts on Soroban hold collateral, price trades, evaluate payout curves, and settle markets after resolution.

**Off-chain layer:** The Next.js application and TypeScript SDK convert user-friendly slider inputs into contract calls and display quotes before a user signs a transaction.

### Resolver Tiers

| Tier | Resolution mechanism | Example use cases |
| --- | --- | --- |
| **T0 — Trustless** | On-chain oracle feed such as Reflector | Crypto prices and FX rates |
| **T1 — Attested** | Signed report from an approved provider with a challenge period | Elections, sports, and official statistics |
| **T2 — Optimistic** | Anyone proposes an outcome with a bond; others may dispute it | Niche and long-tail data |
| **T3 — Designated** | A named reporter submits the outcome | Community and experimental markets |

---

## How to Use Kaido

1. Open the Kaido application.
2. Connect a supported Stellar wallet.
3. Browse the available numerical prediction markets.
4. Select the market you want to trade.
5. Choose the value where you think the outcome will land.
6. Adjust the confidence range around your prediction.
7. Enter your stake.
8. Review the cost, maximum payout, and worst-case quote.
9. Confirm the transaction in your wallet.
10. Wait for the market to resolve.
11. After the resolver submits the final number, the contract calculates and settles your payout.

---
