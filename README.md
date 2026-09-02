# Kaido

**The first distribution-market primitive on Stellar.**
Bet on where a number lands — not whether it crosses a line.

```
   Polymarket asks:                    Kaido asks:
   "Will BTC close above $70k?"        "Where does BTC close on Friday?"

   ┌────────┐  ┌────────┐                       ╱╲
   │  YES   │  │  NO    │                      ╱  ╲
   │  38¢   │  │  62¢   │                     ╱    ╲
   └────────┘  └────────┘                   ╱        ╲___
                                          ─────────────────
   $1 if right, $0 if wrong              $60k   $68k   $80k

   Outcome space: 1 bit                  Outcome space: any number
   Position: a share                     Position: a curve
   Payout: binary                        Payout: scales with accuracy
```

[Whitepaper](./kaido-whitepaper.md) · [Build plan](./build.md) · [ADRs](./docs/adr/)

---

## What is Kaido

A prediction market where the outcome is a **number**, not a side.

Instead of buying YES or NO shares, you pick:

1. **Where you think the number will land.** A center value — the price, margin,
   count, or score you expect.
2. **How sure you are.** A confidence band around that center — tight if
   you're confident, wide if you're not.

The market combines that into a curve. When the answer arrives, the contract
pays you in proportion to **how close your curve peaked to reality**. Nail it
tight ⇒ big win. Spread wide ⇒ smaller win, smaller loss.

```
   Your bet on "BTC close on Friday"
   center: $68,200    confidence: tight (±$1,400)

         payout if you win here
                ↓
              ╱╲
             ╱  ╲
            ╱    ╲
           ╱      ╲          truth lands: $68,600
         ╱          ╲           │
       ╱              ╲___     ▼
   ────────────────────|────────────────►
   $60k         $68k   ▲  $70k         $80k
                     payout = curve height at the truth
                     (here: 14.7 XLM on a 12 XLM stake)
```

Why this matters: a binary market asks you to compress your whole belief into
one of two buckets. A distribution market lets you express *the whole shape*
in a single position. That's the capital efficiency claim — one trade
replaces dozens of "above X / below X" markets.

---

## How a bet works

```
       Mon                    Wed                    Fri
        │                      │                      │
        ▼                      ▼                      ▼
   ┌─────────┐           ┌──────────┐           ┌──────────┐
   │  open   │  ───────► │  trade   │  ───────► │ resolve  │
   └─────────┘           └──────────┘           └──────────┘
   creator sets:         you set:                oracle reads
    • question            • center slider         the truth
    • outcome range       • confidence slider
    • oracle              UI quotes:              contract pays
    • resolve time         • cost                 you in
    • fee                  • max payout           proportion to
                           • worst case           how close you
                          you confirm.            got.
```

Anyone can create a market. Anyone can take a position. The protocol earns a
small fee on each trade; LPs (including a protocol-owned house vault) earn the
spread.

---

## Architecture

```
   ┌──────────────────────────────────────────────────────────┐
   │  web/  Next.js 16 · App Router                           │
   │  Belief Surface · /markets · /create · /whitepaper       │
   └────────────────────────┬─────────────────────────────────┘
                            │
   ┌────────────────────────▼─────────────────────────────────┐
   │  packages/sdk  @kaido/sdk                                │
   │  createMarket · trade · resolve · positions · quotes     │
   └────────────────────────┬─────────────────────────────────┘
                            │
   ┌────────────────────────▼─────────────────────────────────┐
   │  packages/contract-bindings  generated TypeScript        │
   │  (committed; refreshed by CI)                            │
   └────────────────────────┬─────────────────────────────────┘
                            │  Stellar RPC
                            ▼
   ┌──────────────────────────────────────────────────────────┐
   │  contracts/  Rust · Soroban                              │
   │                                                            │
   │    ┌─────────────────┐       ┌──────────────────────┐   │
   │    │ market-factory  │──────►│ distribution-market  │   │
   │    │   create_market │       │   per-market AMM     │   │
   │    └─────────────────┘       │   holds collateral   │   │
   │             │                │   prices trades      │   │
   │             ▼                │   pays at resolve    │   │
   │    ┌─────────────────┐       └──┬───────────┬───────┘   │
   │    │    registry     │          │           │           │
   │    │  indexes markets│          ▼           ▼           │
   │    └─────────────────┘   ┌──────────┐  ┌──────────────┐ │
   │                          │ house-   │  │ resolver-*   │ │
   │                          │ vault    │  │ T0 reflector │ │
   │                          │ protocol │  │ T1 attested  │ │
   │                          │ LP       │  │ T2 optimistic│ │
   │                          └──────────┘  │ T3 designated│ │
   │                                        └──────┬───────┘ │
   │    ┌────────────────────────────────────┐    │         │
   │    │ crates/kaido-math                  │    │         │
   │    │ fixed-point belief math (no f64)   │    │         │
   │    └────────────────────────────────────┘    │         │
   └───────────────────────────────────────────────┼─────────┘
                                                   │
                       ┌───────────────────────────┼─────────┐
                       │                           ▼         │
                       │           ┌──────────────────────┐  │
                       │           │  Reflector oracle    │  │
                       │           │  (BTC/USD, etc.)     │  │
                       │           └──────────────────────┘  │
                       │           ┌──────────────────────┐  │
                       │           │  USDC · Stellar SAC  │  │
                       │           └──────────────────────┘  │
                       │           External                  │
                       └─────────────────────────────────────┘
```

**Layer 1** (chain side): Rust contracts on Soroban — they hold collateral,
match trades against the current aggregate curve, and settle deterministically
when an oracle reports the realized number.

**Layer 2** (off-chain side): a Next.js app and a TypeScript SDK that compile
slider inputs into the correct calldata, show pre-trade quotes (cost, max
payout, worst case), and display results.

The four resolver tiers let any market choose how much trust it needs:

| Tier | How truth arrives | Use case |
| --- | --- | --- |
| **T0** trustless | On-chain oracle feed (Reflector) | Crypto prices, FX |
| **T1** attested | Signed report from a vetted provider + challenge window | Elections, sports, official stats |
| **T2** optimistic | Anyone proposes with a bond; anyone can dispute | Long-tail metrics, niche data |
| **T3** designated | A specific named party reports | Community/fun markets — labeled `pure trust` |

---

## Repo layout

```
kaido/
├─ contracts/                     Rust / Soroban — Cargo workspace
│  ├─ crates/kaido-math/          fixed-point belief math (no f64, ADR-1)
│  ├─ packages-common/            shared types: Resolver trait, errors, events
│  ├─ contracts/
│  │   ├─ market-factory/         create_market entry point
│  │   ├─ distribution-market/    per-market AMM
│  │   ├─ blend-adapter/          BlendTap JIT borrow spine
│  │   ├─ registry/               indexes markets + resolvers
│  │   └─ resolver-{reflector,attested,optimistic,designated}/
│  ├─ tests/                      multi-contract integration tests
│  ├─ fuzz/                       cargo-fuzz targets (nightly)
│  └─ Makefile.toml               cargo-make tasks
│
├─ web/                           Next.js 16 (App Router)
│  ├─ app/                        landing · /markets · /create · /leaderboard · /whitepaper
│  ├─ components/                 hero, forecast, market, wallet, ui
│  └─ lib/                        stellar (networks, wallet, contracts), curve, utils
│
├─ packages/
│  ├─ sdk/                        @kaido/sdk — TypeScript SDK
│  ├─ contract-bindings/          generated TS bindings (committed)
│  └─ config/                     shared eslint / tsconfig / tailwind preset
│
├─ config/networks.json           static, public network params
├─ docs/
│  ├─ adr/                        architecture decisions
│  └─ test-vectors/               cross-language reference (50-digit)
├─ kaido-whitepaper.md            full mechanism + system architecture
└─ build.md                       sprint plan + SCF tranche mapping
```

---

## Prerequisites

- **Node ≥ 22** + **pnpm** (`corepack enable` or `npm i -g pnpm`)
- **Rust (stable)** via rustup — the `wasm32v1-none` target installs
  automatically from `contracts/rust-toolchain.toml`
- **Stellar CLI** ≥ 23 — <https://developers.stellar.org/docs/tools/cli>
- **cargo-make** — `cargo install --locked cargo-make`
- **Docker** — *optional*, only for `make localnet`. Kaido develops and deploys
  against **Stellar Testnet**, which needs no Docker.

---

## Quick start

```bash
# 1. install JS deps + build contract WASM
pnpm install
cargo make --cwd contracts build-wasm        # or: make bootstrap

# 2. env — defaults target Stellar Testnet
cp .env.example .env

# 3. a funded testnet deployer
stellar keys generate kaido-testnet-deployer --network testnet --fund

# 4. run the web app
pnpm dev                                      # http://localhost:3000

# 5. CI-equivalent checks
pnpm build && pnpm lint && pnpm typecheck && pnpm test     # web
cargo make --cwd contracts ci                              # rust
pnpm --filter web e2e                                      # Playwright smoke

# optional offline local network
make localnet                                 # Docker; RPC at localhost:8000/rpc
make localnet-stop
```

Native Rust unit tests use `soroban-sdk` testutils and hit **no network**. Only
integration / E2E lifecycle suites talk to Testnet RPC.

---

## Networks

| Network | Passphrase | RPC |
| --- | --- | --- |
| **Testnet** *(default)* | `Test SDF Network ; September 2015` | `https://soroban-testnet.stellar.org` |
| Local *(optional, Docker)* | `Standalone Network ; February 2017` | `http://localhost:8000/rpc` |
| Mainnet | `Public Global Stellar Network ; September 2015` | third-party provider |

Per-network contract ids (USDC SAC, Reflector feed, Kaido contracts, admin
multisig, Launchtube) are never hardcoded. They're resolved at deploy time and
written by `contracts/scripts/deploy.sh` into `config/networks.<network>.json`.

> ⚠️ Testnet resets ~2–4×/year at 17:00 UTC (next: **2026-06-17**,
> **2026-12-16**) and wipes all state. Every deploy is scripted and idempotent;
> fixtures are re-seedable; nothing off-chain treats a testnet contract id as
> permanent.

---

## Deploying

```bash
make deploy:testnet      # scripted, idempotent — writes config/networks.testnet.json + fixtures.demoMarket
make seed:testnet        # BlendTap authorize + optional lifecycle fixture (KAIDO_RESEED_LIFECYCLE=1)
```

After seeding, optional env hints are printed (`NEXT_PUBLIC_KAIDO_DEMO_MARKET`, `NEXT_PUBLIC_KAIDO_LIFECYCLE_MARKET`).

Gated SDK lifecycle test (real testnet, no mocks):

```bash
KAIDO_INTEGRATION=1 KAIDO_INTEGRATION_LIFECYCLE=1 KAIDO_INTEGRATION_SECRET=S... pnpm --filter @kaido/sdk test
```

Mainnet deploys are gated on an external audit + a legal opinion (see
`build.md` Sprint 8). `deploy.sh` refuses to run against mainnet until then.

---

## CI

| Workflow | What it runs |
| --- | --- |
| `ci-contracts.yml` | fmt, clippy `-D warnings`, `cargo test`, `stellar contract build`, `cargo audit` |
| `ci-web.yml` | lint, typecheck, build, Vitest, Playwright smoke |
| `deploy-testnet.yml` | manual, scripted testnet deploy |

---

## License

Dual-licensed under [MIT](./LICENSE-MIT) or [Apache-2.0](./LICENSE-APACHE).
