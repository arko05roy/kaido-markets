# Kaido — A Distribution-Market Primitive for Stellar

### *Draw what you think happens next — to anything with a number attached. The market pays you if you're close.*

**Whitepaper v0.1 — Working Draft**

---

## Table of Contents

- [Abstract](#abstract)
- [Part I — The Idea, Explained From Zero](#part-i--the-idea-explained-from-zero)
- [Part II — Distribution Markets: The Mechanism](#part-ii--distribution-markets-the-mechanism)
- [Part III — Kaido: System Architecture](#part-iii--kaido-system-architecture)
- [Part IV — Why Stellar, Why Now](#part-iv--why-stellar-why-now)
- [Part V — Worked Examples](#part-v--worked-examples)
- [Part VI — Security, Risks, and Mitigations](#part-vi--security-risks-and-mitigations)
- [Part VII — Regulatory Posture](#part-vii--regulatory-posture)
- [Part VIII — Roadmap and Milestones](#part-viii--roadmap-and-milestones)
- [Part IX — Glossary](#part-ix--glossary)
- [References](#references)

---

## Abstract

Prediction markets, as they exist today, ask a single impoverished question: *will X happen — yes or no?* That format throws away almost everything a forecaster actually believes. Real beliefs are not coin flips; they are **shapes** — "Bitcoin probably drifts toward ~$68k over the next hour, with a fat tail toward $75k"; "the election margin is likely +3 to +6, but a blowout isn't impossible"; "tomorrow's rainfall is most likely 0–5mm, with a small chance of a storm."

**Kaido** is a protocol that lets anyone trade those shapes. It is built on top of the **distribution-market mechanism** introduced by Dave White at Paradigm in December 2024 — a way to run an automated market maker (AMM) not over tokens, but over entire probability distributions, such that, in an efficient market, the market's state *becomes* the crowd's best collective forecast of a continuous quantity.

Kaido packages this into two layers:

1. **The Distribution Engine** — a Soroban (Stellar smart-contract) implementation of a bounded-loss distribution-market AMM. It is **outcome-agnostic**: any market that supplies a numeric outcome space, a resolver (oracle), and an underwriter (liquidity) can be created permissionlessly. Crypto prices are merely the *first* application, not the only one.
2. **The Forecast Canvas** — a consumer-facing surface where you don't read order books or type limit prices: you **draw your forecast**. For quantities that evolve over time (a price, a live score, a polling average) you draw a *path*. For quantities that resolve to one final number (an election margin, opening-weekend box office, a CPI print) you draw a *curve over a number line* — where it lands and how confident you are. A smart contract scores everyone by how close they were and pays out automatically.

Kaido launches as a 90-second Bitcoin chart game ("ChartGuessr") — because the audience is already there and BTC has a free, trustless, manipulation-resistant price oracle — and then opens the canvas so anyone can create a market on **anything quantifiable**. Every builder who shows up gets a new financial primitive for free.

This document explains all of it: what a distribution market *is*, starting from a coin flip and building up; the precise mechanism from the Paradigm paper, including the math and its sharp edges; how Kaido turns that mechanism into a working product on Stellar; the oracle design that determines how wide "all possible markets" can actually go; the economics; the risks; and the roadmap.

---

# Part I — The Idea, Explained From Zero

This part assumes you know nothing about prediction markets, AMMs, or probability beyond "a coin lands heads half the time." Read it like a story. By the end you will understand *why* distribution markets exist and *what problem they solve*. Part II then makes it precise.

## 1. A bet you have made before

Imagine you and a friend bet on a coin flip. You say "heads," your friend says "tails," you each put $1 on the table, and whoever is right takes the $2. Simple.

Now imagine a slightly fancier version. Instead of a coin, the question is *"Will it rain tomorrow?"* You think it will, your friend thinks it won't. Same setup: $1 each, winner takes $2. This is, in essence, a **prediction market**: a place where people put money behind their belief about whether some future event will happen, and the payout depends on what actually happens.

Real prediction markets (Polymarket, Kalshi, and dozens of clones) are just this idea, scaled up. Instead of one friend, there are thousands of strangers. Instead of "$1 vs $1," there's a continuously updating price. If a "YES" share costs $0.70, the market is collectively saying "we think there's about a 70% chance this happens." You can buy YES or NO at that price, and at the end you get $1 per share if you were right, $0 if you were wrong.

That's the whole concept. And it's genuinely useful — these markets often forecast elections and events better than pundits.

## 2. The problem with yes/no

But notice what you were *forced* to do: you had to compress everything you believe into a single yes/no choice (or, at best, "I think it's 70% likely").

That works fine for *"will it rain — yes or no?"* It works terribly for almost everything else, because most interesting questions don't have a yes/no answer — they have a **number** as an answer:

- *How much* will it rain tomorrow? (0mm? 4mm? 30mm in a freak storm?)
- What will Bitcoin's price be in an hour?
- What will the winning margin be in the election?
- How much money will this movie make on opening weekend?
- What will next month's inflation number be?
- What will the final score be in tonight's match?

You *could* hack a yes/no market onto these — "Will BTC be above $68,000?" — but every such market captures a single thin slice of what you know. To express "I think it's most likely around $68k, fairly unlikely below $65k, and there's a small but real chance of a spike to $75k," you'd need *dozens* of separate yes/no markets, and even then you couldn't say how the pieces fit together. It's like being asked to describe a person's face but only allowed to answer "taller than 5'10"? yes/no" — over and over.

You have a rich, shaped belief in your head. The format only lets you whisper one bit of it.

## 3. What if you could bet on the whole shape?

Here is the leap. What if, instead of betting "yes" or "no," you could hand the market a **picture** — a curve drawn over all the possible numbers — that says *"here's how likely I think each outcome is"*? A tall hump over $68k. A thin tail stretching out to $75k. Almost nothing below $64k. And what if the market paid you based on **how close your picture was to what actually happened**?

That's a **distribution market**. You're not buying YES/NO shares. You're submitting a *distribution* — a shape — and your profit depends on whether reality landed where your shape was tall (good) or where your shape was short (bad), compared to whatever shape the market held before you came along.

Two things make this powerful:

- **It captures everything you believe at once** — not just "up or down" but "where, and how sure."
- **It rewards honesty about uncertainty.** If you're genuinely unsure, you draw a wide, flat hump and you won't lose much if you're off — but you won't win much either. If you're confident, you draw a tall narrow spike — big reward if you nail it, big loss if you don't. The shape *is* your confidence, and the payout respects that.

This is not a new dream. **Metaculus** is a popular site where forecasters submit full probability distributions over questions like "how many people will live on Mars in 2050." It produces famously good forecasts. But Metaculus has no money in it — it runs on reputation and pride. Distribution markets are, roughly, *"Metaculus, but with real financial stakes and real-time trading"* — the expressiveness of distributional forecasting fused with the truth-extracting pressure of money.

## 4. What exactly is a "distribution"? (the marble jar)

Quick detour, because the whole document leans on this word. A **probability distribution** is just a complete description of *how likely each possible answer is*.

- Picture a jar of marbles. Someone asks: "How many marbles are in the jar?" You don't know exactly. But you'd guess it's *probably around 200*, *almost certainly between 150 and 250*, and *definitely not 10 or 10,000*. If you drew that as a graph — the number of marbles on the bottom axis, "how plausible" going up — you'd get a hump centered near 200, tapering off on both sides. **That hump is your distribution.** A confident person draws a narrow tall hump. An unsure person draws a wide flat one.
- The classic hump shape — symmetric, bell-like — is called a **Gaussian** or **Normal distribution**. It's described by just two numbers: the **mean** (μ, "mu") = where the center of the hump sits, and the **standard deviation** (σ, "sigma") = how wide/spread-out the hump is. Small σ = narrow, confident. Large σ = wide, unsure. Distribution markets often use Gaussians because two numbers are easy to work with — but the math allows other shapes too.
- A key property: the area under the whole curve is fixed (it represents "100% of the probability has to go *somewhere*"). So if you make the hump narrower, it also has to get *taller* to keep the same area. Confidence makes the spike sharp **and** high. Remember this — it comes back as the mechanism's built-in safety feature.

## 5. Getting paid for being honest: scoring rules (the weather forecaster)

Now, *how* do you score a distribution? You need a payout formula with a magic property: **the way to maximize your expected payout is to report what you actually believe** — no bluffing, no shading, no gaming. A formula with that property is called a **proper scoring rule**.

The classic story: a TV weather forecaster. Each day they announce "70% chance of rain." Over a year, you grade them: did it rain on the days they said 70%? About 70% of the time? Then they're well-calibrated. A good scoring rule pays the forecaster more, on average, the closer their stated probabilities are to the truth — and crucially, pays them the *most* when they report their *honest* probabilities rather than exaggerating. If a forecaster who truly believes "60%" could earn more by announcing "90%," the scoring rule is broken. Proper scoring rules are designed so that can never happen.

There are several proper scoring rules. The most famous in this space is the **logarithmic scoring rule** (you get paid an amount proportional to the log of the probability you assigned to whatever actually happened). When you wrap a logarithmic scoring rule inside a continuously-trading market, you get **LMSR** — the *Logarithmic Market Scoring Rule* — which is the engine under a lot of classic prediction markets.

**Important clarification for the rest of this paper:** the Paradigm distribution-market mechanism Kaido is built on does **not** use the logarithmic rule. It uses a different, geometrically elegant construction based on the **L² norm** (think: ordinary "straight-line distance," but for curves instead of points) — explained in Part II. It still behaves like a *market scoring rule* (in an efficient market, prices converge to the true distribution; arbitrage profit is proportional to how much your belief beats the current market's), but the internals are spheres and Hilbert-space geometry, not logarithms. We flag this because earlier informal descriptions of Kaido loosely said "log scoring" — the accurate statement is "an L²-norm market scoring rule, per White (2024)."

## 6. The family tree, in one picture

| Mechanism | What you bet on | Expressiveness | Money? | Example |
|---|---|---|---|---|
| **Binary prediction market** | YES or NO on one event | 1 bit | Yes | Polymarket, Kalshi |
| **Categorical prediction market** | One of N preset buckets | A few bits | Yes | "Who wins the election: A / B / C" |
| **Scoring-rule forecasting** | A full probability distribution | The whole shape | Usually no (reputation) | Metaculus |
| **Distribution market** ← *Kaido* | A full probability distribution | The whole shape | **Yes — real trading** | (didn't exist in production) |

Distribution markets are the bottom-right cell that was empty. Kaido fills it, on Stellar, with a friendly drawing interface on top.

---

# Part II — Distribution Markets: The Mechanism

This part makes Part I precise. It follows the construction in **White, D., "Distribution Markets," Paradigm, December 2024**. We build it in three steps: (1) a finite "warm-up" version with N outcomes, to get the geometry; (2) the jump to continuous outcomes — the paper's main contribution; (3) the practical Gaussian case and its one dangerous edge.

You do **not** need heavy math to follow the shape of the argument. The one idea you must hold onto: **"length of a vector / curve" — the L² norm — is the AMM's invariant, the way `x·y = k` is Uniswap's invariant.**

## 7. Warm-up: a market over N discrete outcomes

Suppose the future has exactly **N** possible outcomes (say N = 100 price buckets). For each outcome *i*, mint an **outcome token** Xᵢ that pays **$1 if outcome *i* happens** and **$0 otherwise**. (This is exactly how binary markets already work, just with more than two tokens.)

Let **x = (x₁, …, x_N)** be the vector of *net amounts of each outcome token held by traders* (so the AMM holds the complement). The AMM's rule — its invariant, analogous to `xy = k` — is:

> **‖x‖₂ = √(x₁² + x₂² + … + x_N²) = k**   (a constant)

In words: the vector of trader positions is constrained to lie **on the surface of a sphere of radius k** in N-dimensional space. The AMM is fully collateralized by holding `b − xᵢ` of backing for each outcome (b = collateral per outcome), so whatever happens, it can pay.

Now ask: if the *true* probabilities of the outcomes are **p = (p₁, …, p_N)**, what positions will profit-seeking arbitrageurs push the market toward? A trader's expected profit from holding position **x** is **p · x** (probability-weighted payout). So arbitrageurs solve:

> **maximize  p · x   subject to  ‖x‖₂ = k**

By the **Cauchy–Schwarz inequality**, the maximizing **x** points in the *same direction* as **p**:

> **x\* = k · p / ‖p‖₂**

**That's the punchline.** In an efficient market, the trader-position vector ends up *proportional to the true probability distribution*. The market's reserves literally encode the crowd's probability estimate — read off the shares, normalize, and you have the forecast. This is what makes it a *market scoring rule*: the equilibrium state is the truth, and the incentive to get there is ordinary arbitrage profit.

Notice also a free safety property in finite dimensions: if `‖x‖₂ = k`, then no single component `xᵢ` can exceed `k`. So each outcome's payout obligation is automatically bounded. **Hold that thought** — it breaks in the continuous case, and fixing it is the mechanism's one subtle move.

## 8. The jump: a market over a continuous outcome

Now let the outcome be a *real number* — a price, a margin, a rainfall in mm — anywhere on the line ℝ. We can't have one token per outcome (there are infinitely many). Instead, the paper introduces **outcome-function tokens**: a position is a **function** `f: ℝ → ℝ⁺`, where `f(x)` is "how many dollars you collect if the realized outcome turns out to be exactly `x`." Your position is a *curve*, not a vector.

Everything from the discrete case carries over by replacing sums with integrals. The invariant becomes the **L² norm of the curve**:

> **‖f‖₂ = √( ∫ f(x)² dx ) = k**   (constant)

The AMM holds `h(x) = b − f(x)` (backing minus the aggregate trader curve), stays fully collateralized, and traders maximize expected profit:

> **maximize  ∫ f(x) p(x) dx   subject to  ‖f‖₂ = k**   (plus a backing limit, see §10)

Same Cauchy–Schwarz logic, now in function space (a Hilbert space): the optimal curve is **proportional to the true probability density**:

> **f\* = k · p / ‖p‖₂**

So again — in an efficient market, **the aggregate trader curve becomes (a scaled copy of) the true probability distribution over the continuous outcome.** That is the entire point of the construction: a tradable object whose equilibrium *is* the crowd's continuous forecast.

## 9. Settlement always works

When the market resolves and the realized outcome is `x₀`:

- Traders holding the aggregate curve `f` are paid **`f(x₀)` dollars**.
- The AMM, holding `h = b − f`, receives **`b − f(x₀)` dollars**.
- Total: `f(x₀) + (b − f(x₀)) = b`. Always. Regardless of the curve's shape or where `x₀` lands.

So the market is **always exactly solvent** — it pays out precisely the collateral `b` that was put in. No bad debt, no socialized losses, *provided* `f(x₀)` never exceeds `b` (the catch in §10).

## 10. The dangerous edge: unbounded loss, and the two fixes

Remember the free safety property in finite dimensions: `‖x‖₂ = k` ⇒ every component ≤ k. **This fails in infinite dimensions.** A curve can have a *finite* L² norm while having an *infinitely tall* spike. The extreme example: `f(x) = k·δ(x)` (a Dirac delta — an infinitely thin, infinitely tall needle at 0) has L² norm... 0, yet `f(0) = ∞`. A trader could, in principle, propose a near-delta belief, force the AMM to owe a near-infinite payout at one point, and blow it up.

The fix is to add a **hard cap**: require `max_x f(x) ≤ b` everywhere — no point on the curve can promise to pay more than the collateral on hand. The paper gives two ways to enforce it:

1. **Restrict σ (limit certainty):** for Gaussian beliefs, the peak height is controlled by σ; capping the peak means forbidding σ below a threshold. Concretely (Gaussian case): **σ ≥ k² / (b²·√π)**. Traders simply can't claim to be *more* certain than that floor allows.
2. **Capped Gaussians (clip the spike):** allow any σ, but redefine the payout curve as `f(x) = min( b, λ·φ(x) )` — a Gaussian with its top sliced flat at height `b` — where `λ` is rescaled so the L² norm constraint still holds. You keep the bell shape; you just don't promise to pay more than you have.

Either way: full collateralization preserved, insolvency impossible. **Kaido takes option (1) by default for v1** (a configurable σ-floor per market — simplest to reason about and audit) **and supports capped Gaussians (2) as an opt-in for markets that need sharp beliefs.**

## 11. The Gaussian case in practice (the two-number belief)

Working with arbitrary curves is awkward, so in practice a market parameterizes beliefs as **Gaussians**: each trader's belief is just **(μ, σ)** — center and width. Key facts the paper derives:

- A Gaussian PDF's L² norm is **‖p‖₂ = √( 1 / (2σ√π) )** — it **depends only on σ, not μ**.
- **Consequence #1 — you can slide the mean for free.** Moving μ left or right doesn't change ‖p‖₂; it only changes how much *collateral* you must post (because it changes where the curve is tall relative to where the market's current curve is tall). So shifting the consensus center is cheap; the cost is in *sharpening* it.
- **Consequence #2 — informed traders are auto-throttled.** A narrower belief (small σ) has a *larger* L² norm, so to satisfy `‖f‖₂ = k` the trader's position must be **scaled down** by `λ = k·√(2σ√π)`. In plain terms: *the more confident (peaked) your claimed belief, the smaller the position the AMM lets you take.* Someone with private information can still move the market — but their per-trade size is mechanically limited, which damps manipulation and gives the rest of the market time to react. This is an elegant built-in feature, not a bolted-on risk control.

### How a single trade works, step by step

Say the market currently encodes a Gaussian with `(μ₁, σ₁)` (curve `f`), and you believe `(μ₂, σ₂)` (curve `g`). To trade:

1. You **submit your belief `g`** (i.e., your `(μ₂, σ₂)`), appropriately scaled by `λ₂ = k√(2σ₂√π)`.
2. You **receive the position `g − f`** — you're long where your curve is taller than the market's, short where it's lower.
3. You **post collateral equal to your worst case**, `−min_x ( g(x) − f(x) )` — the largest amount you could end up owing. (For Gaussian-to-Gaussian trades this point is found numerically by checking where the derivative of `g − f` vanishes.)
4. The market's encoded belief is now `g`. The next trader trades against *your* curve.
5. At resolution `x₀`: you collect `g(x₀) − f(x₀)` (which may be negative — that's what the collateral covered). With caps: `min(λ₂φ(x₀), b) − min(λ₁φ(x₀), b)`.

Your profit is positive exactly when reality lands where you made the curve taller than the market had it — i.e., where you *disagreed with the consensus and were right*. That's the reward for moving the market toward truth.

## 12. Liquidity providers (LPs)

LPs work much like Uniswap V2 LPs. To add liquidity at "scale" `y`:

1. Contribute `y·(b − f)` to the AMM — i.e., a `y`-proportional copy of the AMM's current holdings `h = b − f`.
2. Receive `y·L` LP shares (L = current total shares).
3. Keep `y·f` as your *own* market position (you're now also a participant in the belief, proportionally).

Before and after, total system holdings still sum to `b` per outcome — full collateralization is invariant under LP entry/exit. LPs earn the trading fees the market charges (Kaido: a small protocol + LP fee on each trade — see §20), and bear the usual market-maker P&L: they're effectively the counterparty of last resort to the aggregate of traders' beliefs.

## 13. Why this is the right primitive (recap)

- **Equilibrium = truth.** In an efficient market the state converges to the true continuous distribution (Cauchy–Schwarz, §7–8).
- **Always solvent.** Settlement pays exactly `b`; with the σ-floor or capped-Gaussian fix, never more (§9–10).
- **Self-limiting on confident traders.** Peaked beliefs ⇒ smaller positions; manipulation is damped automatically (§11).
- **Composable.** It's an AMM with a clean interface — a market is just `(outcome space, current curve, collateral b, k, fee, resolver)`. Anything that can be measured as a number can be a market. That last property is what Kaido is built around.

---

# Part III — Kaido: System Architecture

Kaido is two layers plus an oracle framework. **Layer 1** is the chain-side primitive (the distribution-market AMM as a Soroban contract suite). **Layer 2** is the off-chain + frontend experience (the Forecast Canvas, the games, the social loop). The **oracle framework** is what connects on-chain markets to real-world truth and ultimately decides how broad "all possible markets" can be on day one.

## 14. Layer 1 — the Distribution Engine (Soroban)

A small suite of Soroban contracts:

- **`MarketFactory`** — anyone can call `create_market(...)` to deploy a new distribution market, supplying:
  - **Outcome space** — either a *scalar* market (outcome ∈ ℝ over some range, e.g. "BTC/USD price at T") or a *trajectory* market (outcome = a path; see §16).
  - **Parameterization** — Gaussian `(μ, σ)` by default, with the σ-floor and/or capped-Gaussian flag set per market.
  - **`k`, initial `b`, fee bps** — liquidity-curve constant, initial collateral, trade fee.
  - **Resolver** — an address implementing the `Resolver` interface (§17). The market is only as trustworthy as its resolver, and the resolver type is displayed prominently to users.
  - **Window** — open time, lock time (no more trades), resolve time.
- **`DistributionMarket`** — the per-market AMM. Holds collateral, tracks the current aggregate curve (stored as parameters, not a discretized array, for gas-efficiency), prices and executes `trade(belief, collateral)` calls, mints/burns position NFTs (a position is a curve = a few parameters + scale + ownership), handles LP `add`/`remove`, and at `resolve` pays out `f(x₀)` to position holders and `b − f(x₀)` to the AMM/LPs.
- **`HouseVault`** — the protocol-owned underwriter used at launch to bootstrap markets that have no third-party LPs yet (see §18). Its positions are ordinary Layer-1 positions — Kaido dogfoods its own primitive.
- **`Registry`** — indexes markets, resolvers, and their trust tiers for the frontend.

Everything that can be done by hand via these contracts can also be done via an **SDK** (TypeScript + a Rust crate) so third parties can create markets, plug in their own resolvers, and embed Kaido markets in their own apps.

## 15. The market tuple

Formally, a Kaido market is the tuple:

> **M = ( OutcomeSpace, Parameterization, k, b, fee, Resolver, Window )**

If you can fill in those seven fields, you have a market. Note what's *not* required: a ticker, a price feed, a "financial instrument" classification, anyone's permission. The OutcomeSpace just has to be a number (or a path of numbers), and the Resolver just has to be *something that will report that number*. This is the entire basis of the "all possible markets" claim — it's a property of the data structure, not a roadmap promise.

## 16. Scalar markets vs. trajectory markets

Two flavors, because real questions come in two flavors:

- **Scalar market** — the outcome is *one final number*. Examples: election margin, opening-weekend box office, next CPI print, a house's sale price, total goals in a tournament, BTC price *at* a fixed timestamp. The belief object is a distribution over that number — a hump on a number line. Settlement reads the single value `x₀` from the resolver and pays `f(x₀)`.
- **Trajectory market** — the outcome is a *path over time*: `x(t)` for `t` in some window. Examples: BTC price over the next 90 seconds, a match's live score over 90 minutes, a candidate's polling average over 30 days, a video's view count over its first week, a city's temperature over a day. We handle this by **sampling**: fix `n` checkpoints `t₁ < t₂ < … < t_n` in the window; the outcome is the vector `(x(t₁), …, x(t_n))`; the belief is a distribution over that vector (in v1, an independent or simply-correlated Gaussian per checkpoint, which keeps the math the discrete-N case of §7 stacked across time). The "draw a line" UI maps a freehand path to its values at the checkpoints. Settlement reads the realized path from the resolver at those timestamps and scores the drawn path by aggregate distance.

Both flavors compile down to the same core AMM — a trajectory market is, mathematically, a product of per-checkpoint markets sharing one collateral pool.

## 17. The oracle framework — how truth gets on-chain (the part that gates breadth)

A market is only as good as its resolver. Kaido defines a single `Resolver` interface (`resolve() → value` callable after `resolve_time`, with an optional `dispute()` path) and supports **four tiers**, each clearly labeled in the UI so users know exactly what they're trusting:

| Tier | How truth arrives | Trust assumption | Good for |
|---|---|---|---|
| **T0 — Trustless feed** | On-chain price oracle (Reflector on Stellar) reads the value directly | Oracle network honesty + liveness | Crypto assets, FX, anything with a robust on-chain feed. **The launch tier.** |
| **T1 — Attested data adapter** | A signed report from a vetted off-chain data provider (sports APIs, electoral commissions, box-office trackers, weather services) posted by a permissioned poster, with a challenge window | The named provider + the poster, bounded by the challenge window | Elections, sports, weather, official statistics, entertainment metrics |
| **T2 — Optimistic oracle** | Anyone proposes the value with a bond; anyone can dispute by bonding; disputes escalate to a vote/arbitration; undisputed after the window ⇒ final | Economic — wrong proposals get slashed; assumes at least one honest watcher | The long tail: niche metrics, anything without a clean API |
| **T3 — Designated resolver** | A specific named party (the market creator or an appointed judge) reports the value | That party's honesty — *pure trust*, clearly flagged | Community/fun markets, private leagues, hyper-local events |

The breadth of "all possible markets" on day one is exactly: **T0 is live at launch (crypto), T1/T2 follow during testnet, T3 is available immediately for clearly-labeled trust-me markets.** Over time, more T1 adapters and a hardened T2 expand the trustless/economically-secured frontier. Kaido never claims a market is trustless when it isn't — the tier badge is non-negotiable UI.

## 18. Bootstrapping liquidity — the house book

New markets face a cold-start problem: no LPs, no other side. Kaido's answer is the **`HouseVault`** — a protocol-owned pool that seeds every new market as the LP/underwriter of last resort, so a player can show up minute one and trade against *something*. Its exposure is itself a Layer-1 distribution position (so the protocol's own risk is transparent and on-chain), it's risk-capped per market, and as third-party LPs arrive the house can withdraw proportionally. The "play vs. house" mode of the launch game (§19) is literally this: you trade against the HouseVault's curve.

This also matters for the regulatory posture (Part VII): the protocol is providing *liquidity to a market*, not *operating a casino book against players* — a meaningfully different and cleaner framing.

## 19. Layer 2 — the Forecast Canvas

The consumer surface. No order books, no limit prices, no jargon. You **draw**.

- **Trajectory mode** (for trajectory markets, §16): a live chart of the quantity builds in front of you for a set window (e.g., 45 seconds of BTC), then you get a short window (e.g., 15 seconds) to **draw the continuation** with your finger/mouse. Your drawn path is converted to its checkpoint values and submitted as your belief. At reveal, the real path animates in next to yours; the contract scores by distance and pays the closest.
- **Distribution mode** (for scalar markets, §16): you see a number line (with the market's current consensus hump faintly shown), and you **draw your own hump** — drag to set the center, pinch/stretch to set the width. A spike says "I'm sure"; a wide mound says "no idea, roughly here." Submitted as your `(μ, σ)`. At reveal, the true value drops onto the line; payout by how much probability mass you put near it vs. the prior market curve.
- **Shared everywhere:** a one-tap **result card** (your curve, the truth, your P&L, the market name) built for screenshots; **leaderboards** (best forecasters by Brier-like calibration score, not just $ won); **streaks** and lightweight identity (passkey login via Stellar's Passport/passkey work — play in ~10 seconds, no seed phrase).

The point: the *feel* is GeoGuessr, not Bloomberg — but every drawn curve is a real position in a real distribution market underneath.

## 20. The launch wedge — ChartGuessr

Day one, Kaido ships as exactly one skin: **ChartGuessr-on-BTC**. Pay 1 USDC. A BTC/USD chart builds live for 45 seconds. You get 15 seconds to draw the path you think comes next. The real price reveals beside your line. The smart contract auto-pays the closest forecasts. Default mode is **play-vs-house** (you trade against `HouseVault`), which kills 1v1 matchmaking cold-start; PvP pools open once there's density.

Why crypto first, when the whole thesis is "all markets":
- **Warm audience** — crypto-natives will play a price game on day one; they're the cheapest users to acquire.
- **Trustless oracle** — BTC/USD has a robust on-chain feed (T0) so the very first market needs zero trusted parties.
- **Cheap to operate** — frequent, tiny markets only make economic sense on a sub-cent-fee, instant-finality chain (see Part IV).

Then the canvas opens: permissionless market creation, distribution mode, T1/T2 resolvers, and ChartGuessr becomes one game in a category — a forecasting *platform* over anything quantifiable.

## 21. Economics — fees, the (absence of a) token, value capture

- **No protocol token at launch.** Markets settle in **USDC on Stellar**. Adding a token would invite securities questions and add nothing the mechanism needs. (A future governance token is not precluded but is explicitly out of scope for v1.)
- **Fees:** each trade pays a small fee in bps, split between (a) the market's LPs (incl. `HouseVault`) and (b) a protocol treasury. Market creators may optionally take a slice (incentive to create good markets / supply good resolvers).
- **Where the value is:** the protocol treasury (fee share), the `HouseVault`'s LP returns, and — strategically — being *the* distribution-market primitive on Stellar that other apps build on (SDK adoption, ecosystem gravity). The grant case (Part VIII) is funded on building the primitive + reference app, not on token speculation.
- **What players pay for:** entry into a market (the "1 USDC" in ChartGuessr is just a position size). Skilled forecasters are net-positive; the house and LPs earn the spread/fees; the protocol earns its cut. No house *edge* baked into odds — payouts come from the scoring rule, and the "rake" is the explicit, visible fee.

---

# Part IV — Why Stellar, Why Now

**Why Stellar:**
- **SCF is funding new-to-Stellar financial primitives** — RWA credit, perpetuals, privacy pools, confidential transfers. A distribution-market AMM is exactly that shape, in a category nobody on Soroban has built. It scores maximally on "ecosystem value" because it's a primitive other builders deploy markets on, not a closed app.
- **Micro-stakes need micro-fees.** A 90-second, 1-USDC market is *unplayable* on L1 Ethereum and awkward on most L2s. Stellar's sub-cent fees, ~5-second finality, and native USDC make tiny, frequent markets economically sane.
- **The pieces are already here.** Reflector for T0 oracle feeds; Soroban for the AMM; the Passport/passkey work for ten-second onboarding; an ecosystem of LP-style capital that can underwrite markets.

**Why now:**
- **Prediction markets just had their mainstream moment** (election cycles, Polymarket in the headlines). The ceiling on "binary bet" UX is now visible to everyone.
- **The mechanism is freshly published and unbuilt.** White's distribution-markets work (Paradigm, Dec 2024) is a real mechanism-design contribution with no production implementation anywhere.
- **Soroban is mature enough** to express it (confidential transfers, custom contracts, decent gas economics).
- There is plausibly a **~6–12 month window** before someone does the obvious thing on EVM. Doing it on Stellar — with the consumer wedge and the cheap-micro-markets advantage — is a defensible head start.

---

# Part V — Worked Examples

### Example A — ChartGuessr, BTC, 90 seconds (trajectory market, T0 oracle)

- **Market:** OutcomeSpace = BTC/USD path over `[T, T+90s]`, sampled at 6 checkpoints; Parameterization = independent Gaussian per checkpoint with a σ-floor; Resolver = Reflector BTC/USD feed read at the 6 timestamps; Window: open now, lock at T, resolve at T+90s; fee = e.g. 1%.
- **You play:** pay 1 USDC. Watch 45s of chart. Draw a path that ticks up then dips. Your path → 6 checkpoint values → submitted as your belief; collateral = your max downside vs. the house curve.
- **Reveal:** real BTC path animates next to yours. Contract scores aggregate distance, pays the closest forecasters from the pool; LPs/house earn the fee. Result card pops: your curve, the truth, "+2.40 USDC", share button.

### Example B — "US presidential popular-vote margin, 2028" (scalar market, T1 oracle)

- **Market:** OutcomeSpace = margin in percentage points ∈ [−20, +20]; Parameterization = Gaussian (μ, σ), capped-Gaussian enabled; Resolver = T1 attested adapter that posts the certified result with a 7-day challenge window; resolves a week after certification; fee = 1%.
- **A trader:** believes the margin is +4 with real uncertainty — draws a hump centered at +4, moderately wide (σ ≈ 3). The mechanism scales their position by `λ = k√(2σ√π)`; they post collateral = worst-case vs. the current market hump. If consensus had it at +2, they've pushed the center toward their view.
- **Resolution:** certified margin = +3.1. Traders who put mass near +3 profit; the overconfident +6 spike loses; LPs net the fees. The market's pre-resolution hump *was* a live, money-backed probabilistic forecast of the margin — strictly more information than "Will the margin exceed +3%? Yes/No."

### Example C — "Rainfall in Mumbai tomorrow (mm)" (scalar market, T1/T2 oracle)

- **Market:** OutcomeSpace = mm of rain ∈ [0, 300]; Gaussian (or, better, a right-skewed parameterization in a later version); Resolver = T1 adapter to the national meteorological service, fallback T2 optimistic oracle; resolves the next day; fee = 1%.
- **Players:** locals who think it'll be a dry 0–5mm draw narrow humps near 0; a few who expect a storm draw a low wide mound stretching toward 80mm. The market hump *is* the crowd's rainfall forecast, with money behind it.
- **Resolution:** 12mm falls. Modest payouts to the "light rain" forecasters; the dry-0mm spikes take a small loss (bounded by the σ-floor); storm-bettors lose their (small, wide) stakes. Note: no ticker, no exchange, no "financial instrument" anywhere — just a number, a resolver, and the AMM.

---

# Part VI — Security, Risks, and Mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Unbounded LP loss** (the §10 landmine) | A near-delta belief could force a near-infinite payout at one point | σ-floor per market by default; capped-Gaussian payouts as opt-in; both proven to keep `f(x) ≤ b` ⇒ always solvent. Per-market risk caps on `HouseVault`. |
| **Smart-contract bugs** in the AMM math | Curve accounting, collateral, settlement are subtle | Spec the contract from the paper's math; property tests + fuzzing on the invariants (`‖f‖₂ = k`, `Σ holdings = b`); external audit before mainnet; conservative caps in early rounds; bug bounty. |
| **Oracle manipulation / failure** | Wrong `x₀` ⇒ wrong payouts | Tiered, clearly-labeled resolvers (§17); T0 only for robust feeds; challenge/dispute windows on T1/T2; for short-window trajectory markets, sample multiple timestamps and consider TWAP-style reads to resist last-second wicks. |
| **Sophisticates farm casuals** | Better-model/lower-latency players consistently beat retail in price games | The σ-floor caps how much an informed trader can extract per trade; play-vs-house mode means the *house* (a pool, risk-capped) absorbs skill asymmetry, not individual newbies; skill-bracketed pools for PvP; lean into "forecasting skill leaderboard" framing rather than pretending it's pure luck. |
| **Liquidity cold-start** | Empty markets are unplayable | `HouseVault` seeds every market; play-vs-house default; LP incentives (fee share) to attract third-party underwriters. |
| **Frontend ↔ chain mismatch** (drawn curve vs. submitted belief) | User draws X, contract records Y ⇒ disputes | Deterministic, audited curve-fitting from drawn path → parameters; show the *exact* fitted curve back to the user before they confirm; the contract is the source of truth and the UI says so. |
| **Regulatory action** | Real-money forecasting on prices/events is a sensitive area | See Part VII — managed, not wished away. |
| **MEV / front-running on trades** | Someone sees your belief tx and trades ahead | Per-market trade size limits (already implied by the σ-scaling); consider commit-reveal for the short-window games; Stellar's fee/ordering model is less MEV-friendly than EVM to begin with. |

---

# Part VII — Regulatory Posture

Real-money forecasting on prices and events is a genuinely sensitive area, and short-dated price guessing in particular can resemble binary options — a product restricted or banned for retail in several major jurisdictions. Kaido's stance is to **manage this deliberately**, not pretend it away:

1. **Build it as a market, not a casino.** Participants provide liquidity to / take positions in a *distribution market*; the protocol runs an AMM and earns a transparent fee — it is not a bookmaker setting odds against players. The `HouseVault` is an LP, clearly framed as such.
2. **Be a forecasting platform, not a price-betting app.** Crypto is the launch *wedge*, not the identity. Ship non-price markets (elections, box office, weather, sports) early so the platform reads as Kalshi/Metaculus-shaped — a venue for forecasting many quantities — with crypto as one vertical among many.
3. **Geofence the obvious jurisdictions** at the frontend, with honest disclosures.
4. **Tiered, labeled resolvers** so users always know what they're trusting; no "trustless" claim that isn't true.
5. **No protocol token at launch** — removes a whole class of securities questions.
6. **Get a real legal opinion before mainnet**, in the target launch jurisdictions, and structure accordingly (entity, T&Cs, KYC thresholds if needed). Treat this as a gating milestone, not a footnote.

The point isn't that Kaido is risk-free; it's that the design choices (market-not-casino, platform-not-price-app, no token, labeled trust, geofencing, counsel-before-mainnet) put it in a defensible posture rather than an obviously-doomed one.

---

# Part VIII — Roadmap and Milestones

Structured to map onto an SCF Build Award's milestone tranches.

**Milestone 1 — MVP (≈10%)**
- `DistributionMarket` core AMM (single scalar market, Gaussian + σ-floor, full collateralization, settlement) on Soroban testnet.
- `HouseVault` v0; basic `MarketFactory`.
- ChartGuessr-on-BTC trajectory loop (45s build / 15s draw / reveal / auto-payout), play-vs-house, Reflector T0 oracle, on testnet.
- Property tests on the AMM invariants.

**Milestone 2 — Testnet (≈30%)**
- Multi-market; permissionless `create_market`; trajectory + scalar markets; capped-Gaussian opt-in.
- Oracle framework: T0 live, T1 adapter pattern + first adapter, T2 optimistic oracle (basic), T3 designated resolver; trust-tier badges in UI.
- Forecast Canvas: both modes polished; result cards; leaderboards (calibration-scored); passkey onboarding.
- LP flows (third-party `add`/`remove`); fee splitting.
- SDK alpha (TS + Rust crate); docs.
- External security review begun.

**Milestone 3 — Mainnet / "UX readiness" (≈40%)**
- Audit complete; conservative per-market caps; bug bounty live.
- Mainnet launch on Stellar: 1-USDC live ChartGuessr; at least one **non-crypto market** (e.g. an election-margin or box-office market) live and resolved end-to-end via a T1/T2 resolver.
- SDK 1.0 + docs; at least one **external party** has created a market with their own resolver.
- Legal opinion obtained for the launch jurisdiction; geofencing + T&Cs in place.

**Milestone 4 — Post-launch (follow-on)**
- More T1 adapters (sports, weather, official stats); hardened T2.
- Richer belief parameterizations (skewed, multi-modal) beyond Gaussian.
- PvP pools with skill brackets; tournaments; embeddable widgets.
- Partner integrations: parametric-insurance, sports, forecasting communities building on Layer 1 — the evidence that Kaido is infrastructure, not a game.

---

# Part IX — Glossary

- **AMM (Automated Market Maker):** a smart contract that's always willing to trade at a price determined by a fixed formula (its *invariant*), instead of matching buyers and sellers in an order book. Uniswap (`xy=k`) is the canonical example.
- **Prediction market:** a market where you buy shares that pay $1 if some event happens, $0 if not; the price ≈ the crowd's probability of the event.
- **Distribution market:** a market where, instead of betting on a single event, you trade an entire probability *distribution* over a continuous quantity; in equilibrium the market's state equals the crowd's forecast of that quantity. (White, Paradigm, 2024.)
- **Probability distribution:** a complete description of how likely each possible answer is — a curve over the number line whose total area is 1.
- **Gaussian / Normal distribution:** the classic symmetric "bell curve," fully described by its mean **μ** (center) and standard deviation **σ** (width). Small σ = confident/narrow; large σ = unsure/wide.
- **Mean (μ):** the center of a distribution. **Standard deviation (σ):** how spread out it is.
- **Scoring rule:** a payout formula for graded probabilistic forecasts. **Proper scoring rule:** one where your best strategy is to report your *true* beliefs (no benefit to exaggerating).
- **Logarithmic scoring rule / LMSR:** a specific proper scoring rule (pay ∝ log of the probability you assigned to the realized outcome) and the prediction-market mechanism built from it. *Kaido does **not** use LMSR* — it uses White's L²-norm market scoring rule.
- **L² norm (‖·‖₂):** the "straight-line length" of a vector — √(sum of squares) — generalized to curves as √(∫ f² dx). It's the **invariant** of the distribution-market AMM.
- **Cauchy–Schwarz inequality:** the math fact that guarantees the profit-maximizing position points in the same "direction" as the true probability distribution — hence "equilibrium = truth."
- **Hilbert space:** the mathematical setting (an infinite-dimensional space of functions with a notion of length and angle) where the continuous version of the mechanism lives.
- **Outcome token / outcome-function token:** a claim that pays $1 if a specific discrete outcome occurs (discrete case) / a *function* `f(x)` paying `f(x)` dollars if the realized outcome is `x` (continuous case).
- **Bounded loss / unbounded loss:** whether the AMM's maximum payout obligation is finite. In infinite dimensions it can be infinite (a delta-spike belief), so the mechanism adds a hard cap (σ-floor or capped Gaussians).
- **Resolver / oracle:** the mechanism by which the real-world outcome value gets reported on-chain so the market can settle. Kaido has four trust tiers (T0 trustless feed → T3 designated party).
- **Soroban:** Stellar's smart-contract platform (Rust-based).
- **Reflector:** an on-chain oracle network on Stellar (used for Kaido's T0 price feeds).
- **Scalar market vs. trajectory market:** a market whose outcome is one final number vs. one whose outcome is a path of numbers over time (sampled at checkpoints).
- **HouseVault:** Kaido's protocol-owned liquidity pool that underwrites new markets so players can trade from minute one; its positions are ordinary Layer-1 distribution positions.
- **Forecast Canvas:** Kaido's drawing-based UI — *trajectory mode* (draw a path) and *distribution mode* (draw a hump over a number line).
- **ChartGuessr:** Kaido's launch application — a 90-second BTC-chart trajectory game; the wedge, not the whole product.

---

# References

1. White, D. **"Distribution Markets."** Paradigm, December 2024. https://www.paradigm.xyz/2024/12/distribution-markets — the mechanism Kaido's Layer 1 implements (L²-norm market-scoring-rule AMM over continuous outcomes; discrete sphere case; Gaussian parameterization and λ-scaling; bounded-loss via σ-floor / capped Gaussians; LP construction; always-solvent settlement).
2. Hanson, R. **"Logarithmic Market Scoring Rules for Modular Combinatorial Information Aggregation."** (LMSR — the classic prediction-market scoring-rule mechanism; contrast to White's construction.)
3. Hanson, R. **"Combinatorial Information Market Design."** (Market scoring rules, background.)
4. Gneiting, T., & Raftery, A. E. **"Strictly Proper Scoring Rules, Prediction, and Estimation."** JASA, 2007. (Proper scoring rules, the formal grounding for "you're paid most for honest reports.")
5. Stellar Development Foundation. **Soroban documentation.** https://soroban.stellar.org — smart-contract platform Kaido is built on.
6. Reflector. **Stellar oracle network documentation.** — Kaido's T0 resolver source.
7. Stellar Community Fund. **SCF Handbook.** https://stellar.gitbook.io/scf-handbook — award structure the roadmap milestones map onto.
8. (Comparators, for positioning) Polymarket, Kalshi — binary/categorical prediction markets; Metaculus — distributional forecasting without financial stakes.

---

*Kaido whitepaper v0.1 — working draft. The mechanism described in Part II is due to White (2024); Parts III–VIII (the Stellar implementation, the Forecast Canvas, the oracle tiering, the economics, the roadmap) are Kaido's contribution. Open questions flagged in-text: belief parameterizations beyond Gaussian; correlation structure across trajectory checkpoints; hardening the T2 optimistic oracle; the pre-mainnet legal opinion. Feedback welcome.*
