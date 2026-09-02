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

## Demo Video

- [Product walkthrough — voiceover](https://youtu.be/OgPWWf3nyto)
- [Product walkthrough — no voice](https://youtu.be/ILiez9hhDGY)

---

# User Excel Sheet (60+ users)

Sheet - https://docs.google.com/spreadsheets/d/1YQnSM6HBn1tFuu6D_6AYoWhP4ogM74c3DbehD4FayIg/edit?usp=sharing

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


