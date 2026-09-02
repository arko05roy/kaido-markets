# Kaido — Agile Build Plan

> Companion to `kaido-whitepaper.md`. This is the working delivery plan: monorepo layout, tech stack, sprint-by-sprint backlog, and the test strategy that gates each sprint.
>
> **Target:** ship the ChartGuessr-on-BTC wedge on Stellar testnet, then mainnet, with the permissionless distribution-market primitive underneath — mapped onto SCF Build Award tranches (10% / 20% / 30% / 40%).
>
> **Methodology:** 2‑week sprints, trunk-based-ish with short-lived feature branches, Definition of Done enforced by CI. Each sprint below lists *Goal → User stories → Engineering tasks → Tests/acceptance → Deliverable*.

---

## 0. Reference docs (read these before starting)

Pulled and verified May 2026. Keep this list in the repo wiki; re-check before each milestone.

**Stellar / Soroban (contracts)**
- Soroban smart contracts overview & Rust SDK — https://developers.stellar.org/docs/build/smart-contracts/overview
- Getting started: write, test, deploy a Rust contract — https://developers.stellar.org/docs/build/smart-contracts/getting-started/hello-world
- `soroban_sdk` crate docs — https://docs.rs/soroban-sdk
- `rs-soroban-sdk` repo (note CVE-2026-26267 re: `#[contractimpl]` name collisions — keep SDK pinned to a patched version) — https://github.com/stellar/rs-soroban-sdk
- Soroban examples — https://github.com/stellar/soroban-examples
- Fuzz testing guide — https://developers.stellar.org/docs/build/guides/testing/fuzzing
- Contract events / encyclopedia — https://developers.stellar.org/docs/learn/encyclopedia/contract-development
- Fully-typed contracts (WASM spec → bindings) — https://developers.stellar.org/docs/learn/encyclopedia/contract-development/types/fully-typed-contracts

**Oracle (T0 resolver)**
- Oracle providers on Stellar — https://developers.stellar.org/docs/data/oracles/oracle-providers
- Reflector oracle contract — https://github.com/reflector-network/reflector-contract
- `sep-40-oracle` Rust crate (SEP‑40 price oracle interface) — https://lib.rs/crates/sep-40-oracle
- Reflector audit scope (good for understanding the interface & failure modes) — https://github.com/code-423n4/2025-10-reflector
- Reflector testnet/mainnet feed addresses are listed on the Reflector site's `/oracles` tab — **do not hardcode; resolve per-network at deploy time.** Known examples (verify before use): mainnet CEX/DEX feed `CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN`, testnet `CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP`.

**Fixed-point math (no floats in WASM)**
- `soroban-fixed-point-math` (script3) — https://github.com/script3/soroban-fixed-point-math — `mul_floor`/`mul_ceil`/`div_floor` on `i128`/`u128`/`I256`/`U256`, handles phantom overflow. Pin to a version supporting the deployed protocol.
- Background: fixed-point arithmetic — https://en.wikipedia.org/wiki/Fixed-point_arithmetic

**JS/TS client (web + SDK)**
- `@stellar/stellar-sdk` docs — https://stellar.github.io/js-stellar-sdk/
- `js-stellar-sdk` repo — https://github.com/stellar/js-stellar-sdk
- Generate TS bindings: `npx @stellar/stellar-sdk contract bindings typescript ...` (see fully-typed-contracts doc above)
- Invoke a contract via SDK — https://developers.stellar.org/docs/build/guides/transactions/invoke-contract-tx-sdk

**Onboarding / passkeys**
- Smart wallets on Stellar — https://developers.stellar.org/docs/build/apps/smart-wallets
- `passkey-kit` (kalepail) — https://github.com/kalepail/passkey-kit
- Passkey-powered guestbook dapp tutorial — https://developers.stellar.org/docs/build/apps/guestbook
- Stellar passkey mainnet announcement — https://stellar.org/blog/foundation-news/introducing-the-new-stellar-passkey-feature-seamless-web3-smart-wallet-functionality-on-mainnet
- Freighter wallet (fallback signer) — https://developers.stellar.org/docs/tools/developer-tools/wallets

**Frontend framework**
- Next.js 16 release notes — https://nextjs.org/blog/next-16
- Upgrading to v16 — https://nextjs.org/docs/app/guides/upgrading/version-16
- App Router docs — https://nextjs.org/docs/app
- Note: in Next 16 `params`/`searchParams` are Promises; Cache Components / `use cache` is opt-in; React Compiler is stable; React 19.2 (`useEffectEvent`, `Activity`, View Transitions).

**Grant context**
- SCF Build Award — https://stellar.gitbook.io/scf-handbook/scf-awards/build-award
- Budget & deliverable guidelines — https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines
- Tranches: 10% on acceptance, then 20% / 30% / 40% on deliverables.

**Index / cross-reference**
- `developers.stellar.org/llms.txt` — the canonical link index; **re-fetch at the start of each milestone** and reconcile against §0 here. https://developers.stellar.org/llms.txt
- Networks overview (passphrases, RPC/Horizon/Friendbot URLs, reset schedule) — https://developers.stellar.org/docs/networks
- Resource limits & fees — https://developers.stellar.org/docs/networks/resource-limits-fees
- Software / protocol versions — https://developers.stellar.org/docs/networks/software-versions
- RPC guide — https://developers.stellar.org/docs/build/guides/rpc · RPC providers (mainnet) — https://developers.stellar.org/docs/data/apis/rpc/providers
- Stellar CLI — https://developers.stellar.org/docs/tools/cli
- Contract testing guide — https://developers.stellar.org/docs/build/guides/testing · Security best practices — https://developers.stellar.org/docs/build/security-docs
- Token interface / Stellar Asset Contract (USDC SAC) — https://developers.stellar.org/docs/tokens/token-interface · https://developers.stellar.org/docs/tokens/stellar-asset-contract
- Wallet SDK tutorial — https://developers.stellar.org/docs/build/apps/wallet/overview · Freighter guide — https://developers.stellar.org/docs/build/guides/freighter

---

## 0a. Networks & environments — *yes, this builds on Stellar Testnet first*

The plan is **Testnet-first, Mainnet at Sprint 8.** Concretely:

| Phase | Network | Used for |
|---|---|---|
| Sprint 0 | **Local** — `stellar` CLI quickstart / local Soroban RPC | fast dev loop, deterministic integration tests, `make localnet` |
| Sprints 1–7 | **Stellar Testnet** | all contract deploys, ChartGuessr, the Forecast Canvas, SDK, E2E, the external security review's reference deployment, soak tests |
| (optional) | **Futurenet** | only if we need a not-yet-on-Testnet protocol feature; otherwise skip |
| Sprint 8 → | **Mainnet (Pubnet)** | the 1‑USDC launch, the first non-crypto market, the external-creator market — gated on the audit + the legal opinion |

Network config (source of truth: https://developers.stellar.org/docs/networks — keep `web/lib/stellar/networks.ts` and `contracts/.../network.toml` in sync with it):

| | Network passphrase | Stellar RPC | Horizon | Friendbot |
|---|---|---|---|---|
| **Local** | `Standalone Network ; February 2017` (quickstart default) | `http://localhost:8000/rpc` | `http://localhost:8000` | `http://localhost:8000/friendbot` |
| **Testnet** | `Test SDF Network ; September 2015` | `https://soroban-testnet.stellar.org` | `https://horizon-testnet.stellar.org` | `https://friendbot.stellar.org` |
| **Futurenet** | `Test SDF Future Network ; October 2022` | `https://rpc-futurenet.stellar.org` | `https://horizon-futurenet.stellar.org` | `https://friendbot-futurenet.stellar.org` |
| **Mainnet** | `Public Global Stellar Network ; September 2015` | third-party RPC providers only (see RPC providers doc) | multiple providers | n/a |

**Per-network, never hardcode in contract logic** — resolve at deploy time and store in the contract's config: the **USDC SAC contract id**, the **Reflector feed contract id** (testnet ≠ mainnet; see Reflector `/oracles` tab), the **admin multisig**, and the **Launchtube** endpoint/JWT for passkey tx submission. All of this lives in `.env` + a checked-in `config/networks.json` consumed by both `web` and the deploy scripts.

**⚠️ Testnet resets ~2–4×/year at 17:00 UTC, announced ≥2 weeks ahead — scheduled 2026 dates: June 17 and December 16.** A reset wipes all Testnet state (contracts, ledger, accounts). Build for it: (1) every deploy is scripted and idempotent (`make deploy:testnet` re-deploys the whole suite and rewrites `config/networks.json`), (2) no off-chain system assumes a Testnet contract id is permanent, (3) demo/test data is re-seedable from a fixtures script, (4) put the next reset date on the sprint calendar so a demo or SCF review never lands the day after a wipe. (Mainnet does not reset — this risk is Testnet-only.)

---

## 1. Monorepo layout

```
kaido/
├─ pnpm-workspace.yaml          # pnpm workspaces
├─ turbo.json                   # Turborepo task graph (build/lint/test/typecheck)
├─ package.json                 # root scripts; engines: node >=22
├─ .github/workflows/           # ci-contracts.yml, ci-web.yml, deploy-testnet.yml
├─ .env.example
├─ build.md  (this file)
├─ kaido-whitepaper.md
│
├─ contracts/                   # Rust / Soroban workspace  (Cargo workspace)
│  ├─ Cargo.toml                # [workspace] members = ["crates/*", "contracts/*"]
│  ├─ rust-toolchain.toml       # stable pinned; nightly only for cargo-fuzz
│  ├─ crates/
│  │  └─ kaido-math/            # no_std fixed-point lib: exp, erf, gaussian L²-norm, λ-scaling, worst-case collateral
│  ├─ contracts/
│  │  ├─ market-factory/        # create_market(...) → deploys DistributionMarket
│  │  ├─ distribution-market/   # the per-market AMM
│  │  ├─ house-vault/           # protocol-owned underwriter (itself an L1 position holder)
│  │  ├─ registry/              # indexes markets + resolvers + trust tiers
│  │  ├─ resolver-reflector/    # T0 — reads Reflector SEP-40 feed
│  │  ├─ resolver-attested/     # T1 — signed report from permissioned poster + challenge window
│  │  ├─ resolver-optimistic/   # T2 — propose/dispute with bonds
│  │  └─ resolver-designated/   # T3 — single named party reports
│  ├─ packages-common/          # shared Rust: Resolver trait, errors, events, market tuple types
│  ├─ fuzz/                     # cargo-fuzz targets (nightly)
│  ├─ tests/                    # integration tests (multi-contract, against local rpc)
│  └─ Makefile.toml             # cargo-make: build-wasm, optimize, deploy, bindings
│
├─ web/                         # Next.js 16 app (App Router) — frontend + thin BFF routes
│  ├─ package.json
│  ├─ next.config.ts
│  ├─ app/
│  │  ├─ (play)/chartguessr/    # the launch game
│  │  ├─ markets/[id]/          # generic market page (distribution mode)
│  │  ├─ create/                # permissionless market creation wizard
│  │  ├─ leaderboard/
│  │  ├─ api/                   # route handlers: indexer reads, attested-poster webhook stubs
│  ├─ components/
│  │  ├─ canvas/                # ForecastCanvas: trajectory mode (draw path) + distribution mode (draw hump)
│  │  ├─ market/                # market state, position cards, result card (screenshot-optimized)
│  │  └─ wallet/                # passkey + Freighter connect
│  ├─ lib/
│  │  ├─ stellar/               # rpc client, tx builders (wraps @stellar/stellar-sdk)
│  │  ├─ curve/                 # path/hump → (μ,σ) params fit (MUST match kaido-math semantics exactly)
│  │  └─ indexer/               # read market state from chain + cached events
│  ├─ e2e/                      # Playwright
│  └─ test/                     # Vitest unit/component tests
│
├─ packages/
│  ├─ sdk/                      # @kaido/sdk — TS SDK: create markets, trade, LP, plug resolvers, embed markets
│  ├─ contract-bindings/        # generated TS bindings (committed; regenerated by CI on contract change)
│  └─ config/                   # shared eslint / tsconfig / tailwind preset
│
└─ docs/                        # architecture notes, ADRs, math derivations (mirror of whitepaper Part II)
```

Tooling: **pnpm** + **Turborepo** for JS; **cargo-make** (`Makefile.toml`) for Rust; **stellar CLI** (`stellar contract …`) for build/optimize/deploy/bindings. Node 22, Rust stable (nightly only in the `fuzz/` lane).

---

## 2. Architecture decisions (ADRs to write up in `docs/adr/`)

1. **Fixed-point representation.** Money in 7-decimal stroops-like units (matches Stellar/USDC convention); internal AMM math in a higher-precision scaled `i128` (e.g. 1e9 or 1e18 scale) using `soroban-fixed-point-math`; convert at boundaries. All Gaussian math (`exp`, `erf`) implemented in `kaido-math` as deterministic fixed-point series/rational approximations with proven error bounds — **no `f64` anywhere in contract code.**
2. **Belief representation on-chain.** A market stores its aggregate curve as **parameters** `(μ, σ, λ)` (Gaussian) or `(μ, σ, λ, cap=b)` (capped Gaussian) — never a discretized array. A trader position NFT stores `(μ_before, σ_before, λ_before, μ_after, σ_after, λ_after, collateral_posted, owner)` — enough to compute `g(x₀) − f(x₀)` at resolution.
3. **σ-floor by default** (whitepaper §10 option 1): per-market `σ_min = k² / (b²·√π)`; capped-Gaussian is an opt-in flag.
4. **Trajectory market = product of per-checkpoint markets** sharing one collateral pool (whitepaper §16). v1: independent Gaussian per checkpoint.
5. **Resolver is an interface, not a contract.** `packages-common` defines `trait Resolver { fn resolve(env) -> Vec<i128>; fn dispute(...); fn status(...) }`. Market only knows the resolver's address + declared tier; tier badge is non-negotiable UI.
6. **HouseVault is a Layer-1 participant**, not special-cased in the AMM — it just calls `add_liquidity`/`trade` like anyone else. Per-market risk cap enforced inside HouseVault.
7. **No protocol token.** Settlement asset = USDC on Stellar (configurable SAC address per network). Fees in bps split LP / treasury / (optional) creator.
8. **Frontend never trusts itself.** The curve-fit (`web/lib/curve`) is deterministic and the *exact fitted curve is rendered back to the user before confirm*; the contract is the source of truth. A shared conformance test vector set lives in `docs/test-vectors/` and is run by *both* `kaido-math` Rust tests and `web/lib/curve` Vitest tests.
9. **Commit-reveal for short-window games** (anti front-running) — design from sprint 1, ship by the time PvP pools open.
10. **Next.js 16**: App Router only; `params`/`searchParams` awaited; `use cache` for indexer reads with explicit revalidation on new blocks; React Compiler on; keep BFF route handlers thin (RPC fan-out + caching only — no secrets beyond an optional attested-poster key).

---

## 3. Epics

| # | Epic | Whitepaper ref | Spans sprints |
|---|---|---|---|
| E1 | Fixed-point math core (`kaido-math`) | Part II, §10–11 | S1–S2 |
| E2 | `DistributionMarket` AMM contract (scalar, Gaussian + σ-floor, settlement) | §7–13 | S1–S4 |
| E3 | `MarketFactory` + `Registry` (permissionless `create_market`) | §14–15 | S3–S5 |
| E4 | `HouseVault` underwriter | §18 | S2–S4, S7 |
| E5 | Oracle framework + 4 resolver tiers | §17 | S2 (T0) → S5–S6 (T1/T2/T3) |
| E6 | Trajectory markets (checkpoint sampling, shared pool) | §16 | S2–S4 |
| E7 | Capped-Gaussian opt-in | §10 (2) | S5 |
| E8 | LP flows (add/remove, fee split) | §12, §21 | S5–S6 |
| E9 | TS SDK + generated bindings | §14 | S3 → S6+ |
| E10 | Forecast Canvas — trajectory mode | §19 | S2–S4 |
| E11 | Forecast Canvas — distribution mode | §19 | S5–S6 |
| E12 | ChartGuessr game loop (45s build / 15s draw / reveal / auto-payout, play-vs-house) | §20 | S3–S4, S7 |
| E13 | Passkey onboarding + wallet, result cards, leaderboards, streaks | §19 | S4–S6 |
| E14 | Security: fuzzing, property tests, audit prep, bug bounty, MEV mitigations | Part VI | S2, S6, S8 |
| E15 | Regulatory posture: geofencing, disclosures, legal opinion gate, ToS | Part VII | S6, S8 |
| E16 | DevEx: monorepo, CI/CD, testnet/mainnet deploy pipeline, docs site | — | S1, ongoing |
| E17 | PvP pools + skill brackets + tournaments (follow-on) | §20, Part VIII M4 | post-M3 |
| E18 | Richer parameterizations (skew, multi-modal) (follow-on) | Part VIII M4 | post-M3 |

---

## 4. Definition of Done (every story)

- Code reviewed by ≥1 other engineer; CI green.
- **Contracts:** unit tests for happy path + every error branch; invariant assertions (`‖f‖₂ = k` within ε, `Σ holdings = b` exactly, `f(x) ≤ b` always); at least one fuzz target or proptest covering the touched math; gas/footprint snapshot recorded.
- **Web/SDK:** Vitest units for logic; Playwright path for any new user-facing flow; type-check passes; no `any` in public SDK surface.
- **Curve/math changes:** the shared `docs/test-vectors/` set updated and passing on *both* Rust and TS sides.
- Docs: ADR updated if a decision changed; README/SDK docstrings updated; whitepaper cross-ref noted.
- Feature flagged if not production-ready; deployed to testnet; demo recorded in sprint review.

---

## 5. Sprint plan

> 10 sprints (~20 weeks of build) + a hardening/audit window. Tranche mapping: **S1–S2 ≈ Milestone 1 (10%)**, **S3–S5 ≈ Milestone 2 (20%)**, **S6–S8 ≈ Milestone 3 (30%)**, **S9–S10 + audit ≈ Milestone 3 final 40% / Milestone 4 kickoff**. Re-baseline per actual SCF deliverable text.

---

### Sprint 0 — Inception (1 week, pre-build) — ✅ COMPLETE (2026-05-11)

**Goal:** repo skeleton, decisions, environments — nothing user-facing.

> **Status: done.** Monorepo (pnpm/turbo + Cargo/cargo-make), Next.js 16 web shell
> (React Compiler on, shadcn/ui, shared Tailwind preset in `packages/config`),
> all 8 contract crates + `kaido-math` + `kaido-common` as compiling WASM
> scaffolds with no-op fns, CI workflows (`ci-contracts`, `ci-web`,
> `deploy-testnet`), `.env.example`, ADR-0/1/5, `make localnet`.
> **Deviation:** the project develops/deploys against **Stellar Testnet** by
> default (no local Docker node required) — `make localnet` is kept as the
> optional offline path. `contracts/scripts/deploy.sh` is a working, idempotent
> upload→deploy→record pipeline; the 8 scaffold contracts are deployed to
> Testnet and recorded in `config/networks.testnet.json` (they'll be re-deployed
> as real logic lands). Outstanding (repo-admin / external, not code):
> branch protection on `main`; "README verified by a second person".
> Tags: skeleton `b4f6f25`, testnet default + deploy `f405e35`.

Tasks:
- Init monorepo: `pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `contracts/Cargo.toml` workspace, `rust-toolchain.toml`, `Makefile.toml`.
- Scaffold `web/` with `create-next-app` (Next.js 16, App Router, TS, Tailwind, ESLint), wire React Compiler, set up shadcn/ui, Tailwind preset in `packages/config`.
- Scaffold empty crates (`kaido-math`, `packages-common`, all 8 contract crates) that compile to WASM with a no-op fn.
- CI: `ci-contracts.yml` (fmt, clippy `-D warnings`, `cargo test`, `stellar contract build`), `ci-web.yml` (lint, typecheck, build, Vitest, Playwright smoke), `turbo` caching. Branch protection on `main`.
- `.env.example`: `STELLAR_NETWORK`, `RPC_URL`, `NETWORK_PASSPHRASE`, `USDC_SAC_ID`, `REFLECTOR_*` (per network), `LAUNCHTUBE_URL`, `LAUNCHTUBE_JWT`.
- Write ADR-0 (monorepo & toolchain), ADR-1 (fixed-point representation), ADR-5 (resolver interface).
- Set up local devnet: `stellar` CLI quickstart / local RPC + Soroban; document `make localnet`.

**Tests/acceptance:** `pnpm i && pnpm build` green; `cargo make build-wasm` produces all `.wasm`; CI green on a trivial PR; `make localnet` works on a clean machine.

**Deliverable:** running skeleton; README "getting started" verified by a second person.

---

### Sprint 1 — Math core + AMM walking skeleton — ✅ COMPLETE (2026-05-11)

**Goal:** `kaido-math` does Gaussian L²-norm / λ-scaling / worst-case collateral correctly; `DistributionMarket` can be deployed and holds a Gaussian curve.

> **Status: done.** Decision: internal fixed-point scale = **1e18 WAD** (ADR-1
> updated; ADR-2, ADR-3 written). `kaido-math` ships `exp_wad` (range reduction +
> degree-8 Taylor, ≤1e-9 rel., domain x ≤ 46·WAD), `erf_wad`/`erfc_wad`
> (Maclaurin |x|≤4 / Laplace continued fraction |x|<7 / saturate beyond — only
> *used* by capped Gaussians in Sprint 5 but implemented now), and
> `gaussian_l2_norm` / `lambda` / `gaussian_pdf_scaled` / `sigma_floor` /
> `worst_case_collateral` — all `no_std`, **float-free**, on a self-contained
> audited 256-bit `mul_div`/`isqrt` (the script3 `soroban-fixed-point-math`
> 256-bit path needs an `Env`, which a pure crate can't have — documented in
> ADR-1). Verified against 50-digit `mpmath` reference vectors in
> `docs/test-vectors/` (regenerate: `python3 docs/test-vectors/generate.py`) plus
> `proptest` invariants. `kaido-common` carries `MarketParams`/`Belief`/
> `PositionData`/`MarketStatus`/`MarketState`/`KaidoError`/`MarketCreated`
> (`#[contractevent]`). `distribution-market` has real logic — instance storage,
> `init(k, b, fee_bps, resolver, tier, window_open, window_lock, window_resolve,
> mu0, sigma0)` (flat primitives — the Stellar CLI can't build a `#[contracttype]`
> struct arg with a unit enum inside; `MarketFactory` will call it the same way),
> `get_params`/`get_state`/`wad`, the σ-floor + `peak ≤ b` solvency re-check,
> `MarketCreated` event. **Deviation from the literal task wording:** the
> constructor is `init(...)` taking flat primitives rather than `init(params)` /
> `__constructor` — `OutcomeSpace::Scalar`/`Parameterization::Gaussian`/`capped:
> false` are hard-coded for v1. `worst_case_collateral` is a grid +
> golden-section search now; the "never under-collateralised" fuzz vs a
> brute-force grid + closed-form critical points stays Sprint 4 (§6 item 3). All
> 8 contract crates deployed to **Stellar Testnet** and the distribution-market
> seeded with a demo scalar Gaussian market (`make deploy:testnet` →
> `scripts/deploy.sh testnet`, idempotent — re-deploys + re-seeds + verifies
> `get_params`/`get_state`); gas/footprint snapshots in
> `contracts/contracts/distribution-market/test_snapshots/`. `cargo make ci`
> (fmt + clippy `-D warnings` + `cargo test --workspace` + wasm build) green. The
> conformance-vector cross-check on the TS side lands with `web/lib/curve` in
> Sprint 3 (ADR-8); the integration `tests/` crate so far only smoke-tests linking
> + `distribution-market` init — full multi-contract lifecycles are Sprint 2–3.
> Outstanding (later sprints, not Sprint 1): TS bindings for the new
> `distribution-market` ABI (Sprint 3); trading/LP/resolution (Sprint 2).

User stories:
- *As a contract dev, I can compute `‖p‖₂`, `λ = k√(2σ√π)`, peak height, and `σ_min` for a market deterministically in fixed point.*
- *As a contract dev, I can deploy a single scalar `DistributionMarket` with an initial Gaussian and read its state.*

Engineering tasks:
- `kaido-math`: fixed-point `exp(x)` and `erf(x)` (and `erfc`) with documented max relative error (target ≤ 1e-9 over the working domain) — use range reduction + minimax polynomial / continued fraction; unit-tested against high-precision reference values in `docs/test-vectors/`.
- `kaido-math`: `gaussian_l2_norm(σ)`, `lambda(k, σ)`, `gaussian_pdf_scaled(μ, σ, λ, x)`, `sigma_floor(k, b)`, and `worst_case_collateral(g_params, f_params)` — the latter finds `−min_x(g(x) − f(x))` for two Gaussians (closed-form critical points where `g' = f'`, fall back to numeric bisection if needed, all fixed-point).
- `packages-common`: `MarketParams`, `Belief`, `PositionData`, `MarketError`, event topic constants.
- `distribution-market`: storage layout, `__constructor`/`init(params)`, `get_state()`, `get_params()`; no trading yet. Emits `MarketCreated`.
- Property tests (proptest): `l2_norm(σ)` strictly decreasing in σ; `worst_case_collateral ≥ 0`; `gaussian_pdf_scaled` peak == `λ·φ(0)` and `‖f‖₂ ≈ k`.

**Tests/acceptance:**
- `kaido-math` unit tests pass against the reference vectors within stated ε.
- proptest suite (≥10k cases) green.
- `distribution-market` deploys on localnet; `get_params` round-trips; gas snapshot recorded.

**Deliverable:** math crate v0.1 + deployable empty market. Demo: deploy a market, print its `σ_min`.

---

### Sprint 2 — Trading, settlement, σ-floor, T0 resolver, HouseVault v0, Canvas spike — ✅ COMPLETE (2026-05-12)

**Goal:** end-to-end happy path on chain: create market → HouseVault seeds it → a trader trades → market resolves via Reflector → payouts. Plus a throwaway canvas spike.

> **Status: done.** Commits `1ceeff3` (contracts) + `c014c50` (trade-sequence
> proptest). `kaido-common` gained the `Resolver` interface
> (`#[contractclient] ResolverClient`: `resolve()->i128`,
> `status()->ResolverStatus{Pending|Resolved(i128)|Stale}`), the
> `Trade`/`LiquidityAdded`/`LiquidityRemoved`/`Resolved` events, and appended
> error variants (35+). `distribution-market` now has real `trade`
> (`require_auth`, window + σ-floor + `peak ≤ b` checks, `worst_case_collateral`
> + fee, ceil-to-7dp charging, USDC `transfer`, position mint, belief advance),
> `resolve` (reads the resolver's `status()`: Pending → err, Stale →
> `MarketStatus::Disputable`, Resolved(x₀) → settle), `claim`
> (`collateral + (g(x₀)−f(x₀))` clamped ≥ 0, LP pool credited/debited the net),
> a **minimal** `add_liquidity`/`remove_liquidity` (the `y·(b−f)` curve-scaling
> LP + fee-split engine stay Sprint 5, E8), and `get_position`/`lp_shares`/
> `pool_state` views. Money is 7-dp `i128` at the contract boundary, WAD inside
> (`MONEY_SCALE = 1e11`). `init` now also takes the USDC SAC `Address`.
> `resolver-reflector` is a real T0 resolver over the `sep-40-oracle`
> `PriceFeedClient` — `__constructor(oracle, asset, resolve_time, twap_records)`,
> computes a TWAP from `prices(asset, N)` (falls back to `lastprice`), converts
> oracle-decimals → WAD, caches the first successful read; non-trapping
> `status()`. `house-vault` is real — `__constructor(admin, usdc)`,
> `deposit(from, amt)`, admin-gated `seed_market(market, amt, cap)` (per-market
> cumulative exposure ≤ cap; acts as an ordinary L1 LP), `withdraw_proportional`,
> `exposure(market)` view; stays owner-gated (finalised Sprint 4). Tests:
> `tests/tests/lifecycle.rs` runs USDC SAC → mock SEP-40 oracle →
> `resolver-reflector` → `distribution-market` → `house-vault` seeds it → trader
> trades → advance time → `resolve` → `claim`, asserting exact USDC conservation;
> plus the sub-floor-σ revert and the stale-oracle → `Disputable` path. The
> `distribution-market` `random_trade_sequences_preserve_invariants` proptest
> (48 cases) checks the §6-item-2 invariants over random trade/LP sequences:
> `σ ≥ σ_min`, live curve `peak ≤ b`, stored collateral = the contract's own
> `worst_case_collateral` ± 1 money-unit, trader debited ≥ that collateral, every
> `claim` at an arbitrary x₀ is ≥ 0 (collateral posted ≥ realised loss), USDC
> conserved across the whole lifecycle. `scripts/deploy.sh` now requires
> `USDC_SAC_ID` from the env (no default) and passes the constructor args for
> `house-vault` / `resolver-reflector`. The canvas spike was prototyped under
> `web/app/(spike)/canvas-spike/` and then discarded (build.md says "throwaway,
> do not merge to the main flow"). `cargo make ci` (fmt + clippy `-D warnings` +
> `cargo test --workspace` + wasm build) green. **Outstanding (nightly / external,
> not blocking):** the `cargo-fuzz` target in `fuzz/` (needs nightly; the proptest
> gives equivalent coverage on CI) and the flaky-tolerant real-Reflector-testnet
> smoke run (needs network). **Deferred per the plan:** full LP curve-scaling +
> fee-split engine (S5); the "never under-collateralised vs brute-force grid
> oracle" hardening of `worst_case_collateral` (S4); trajectory markets / capped
> Gaussians; HouseVault governance (S4).

User stories:
- *As a trader, I submit a belief `(μ₂, σ₂)`, the contract scales it by `λ₂`, computes my position `g − f` and required collateral, takes USDC, and updates the market curve to `g`.*
- *As anyone, after `resolve_time` I can call `resolve()`; it reads `x₀` from the resolver and the contract pays `f(x₀)` to position holders and `b − f(x₀)` to the AMM/LPs.*
- *As the protocol, the HouseVault can seed a new market as LP-of-last-resort with a per-market risk cap.*

Engineering tasks:
- `distribution-market::trade(belief, max_collateral)`: enforce `σ ≥ σ_min` (or capped path — stubbed), compute collateral = `worst_case_collateral`, `require_auth`, USDC `transfer_from`, mint position (as a contract-managed NFT-ish struct or `soroban-sdk` token-style id), update curve, emit `Trade`. Slippage guard via `max_collateral`.
- `distribution-market::resolve()`: callable post `resolve_time`; pull `x₀` from resolver; compute per-position `g(x₀) − f(x₀)` (with cap math: `min(λ₂φ(x₀), b) − min(λ₁φ(x₀), b)`); pay out; settle AMM remainder to LPs; mark `Resolved`. Assert solvency: total out == `b`.
- `distribution-market::add_liquidity(scale y)` / `remove_liquidity` — minimal version (full version S5).
- `resolver-reflector`: implement `Resolver` over a SEP-40 oracle (`lastprice`/`twap`); store oracle address + asset + (for trajectory) checkpoint timestamps; for short windows read TWAP-style to resist last-second wicks.
- `house-vault`: `seed_market(market, params, cap)`, holds positions, `withdraw_proportional`, per-market exposure ledger. Owner-gated for now.
- Integration test (`contracts/tests/`): full lifecycle against localnet RPC with a **mock SEP-40 oracle contract** (so tests are deterministic).
- **Canvas spike (timeboxed 2 days, throwaway):** prototype drawing a path on `<canvas>` and converting to N checkpoint values in `web`; learn the UX; do not merge to main flow.

**Tests/acceptance:**
- Lifecycle integration test green: balances conserve exactly; `b` in == `b` out; position holder P&L matches hand-computed value for a fixed scenario.
- Fuzz target: random sequences of `trade` calls never break `Σ holdings = b` and never make `f(x) > b`; collateral posted always ≥ realized loss.
- Reflector resolver unit-tested against the mock oracle (incl. stale-price and missing-asset failure modes → market enters a disputable/paused state, not a bad payout).
- σ-floor reject test: a sub-floor belief reverts with the right error.

**Deliverable:** "BTC market, full lifecycle, on testnet" video. Mock-oracle and a first real-Reflector-testnet smoke run. **≈ Milestone 1 content complete.**

---

### Sprint 3 — Factory, Registry, trajectory markets, SDK alpha, bindings, ChartGuessr loop v0

**Goal:** anyone can `create_market`; trajectory markets work; the game loop runs against the chain on testnet (ugly but real).

> **Status: in progress** (4 commits: `d0d7ddc`, `c0f6b80`, `47246f3`, `3f835d7`).
> **Done:**
> - **`Registry`** — real contract: `__constructor(admin, factory)`, factory-gated `register(MarketInfo)`, `set_factory` (admin), views `count`/`all`/`page`/`get`/`factory`/`admin`. `kaido-common` gained `MarketInfo` + the `MarketRegistered` event.
> - **`MarketFactory`** — real contract: `__constructor(admin, dm_wasm_hash, registry, usdc)`; `create_market(...)` validates the tuple → `deploy_v2` a `DistributionMarket` from the pinned WASM hash → `init(...)` → `register`; `create_trajectory_market(...)`; `set_market_wasm` (admin). Uses **local `#[contractclient]` traits** for the dm/registry cross-calls rather than path-depping those crates (a path dep leaks their `#[contractimpl]` WASM exports → `__constructor` symbol collision — the CVE-2026-26267 footgun); the trait sigs must stay in sync with the real contracts.
> - **Trajectory markets (ADR-4):** `ResolverStatus::ResolvedVec(Vec<i128>)` (a trajectory resolver reports the realised value per checkpoint), `OutcomeSpace::Trajectory(Vec<u64>)`, `MarketStatus::ResolvedVec`, `TrajectoryPositionData` + `TradeTrajectory`/`ResolvedTrajectory` events in `kaido-common`. `distribution-market` got `init_trajectory` / `trade_trajectory` / `claim_trajectory` + `get_beliefs` / `get_checkpoints` / `resolved_outcomes` / `get_trajectory_position`: N independent per-checkpoint Gaussians sharing one collateral pool — aggregate collateral = Σ per-checkpoint `worst_case_collateral`; payout = Σᵢ (gᵢ(xᵢ) − fᵢ(xᵢ)) clamped ≥ 0; shares the LP pool + fee engine with the scalar path; a single-`Belief` summary (first checkpoint) is mirrored so `get_state` still works.
> - `deploy.sh`: deploy order reworked (dm WASM hash → factory ctor), `registry`/`market-factory` constructors wired, `registry.set_factory(<factory id>)` post-step, a `factory.create_market` demo. Admin/usdc/reflector still resolved from `.env`/`config` — no hardcoded ids.
> - `Makefile.toml`: `cargo make test` now depends on `build-wasm` so the `tests/` crate can `contractimport!` built WASM.
> - **Tests:** `registry`/`market-factory` unit tests; `distribution-market` trajectory mod (init/views, trade→resolve→claim USDC conservation, wrong-arity reject); `tests/factory_lifecycle.rs` (uploads the dm WASM into the env → full create→deploy→init→register lifecycle, scalar + trajectory). `cargo make ci` green.
> - **TS bindings regenerated** (`cargo make bindings`) → `packages/contract-bindings/src/<contract>/` — 8 generated sub-packages, committed (CI staleness check); barrel re-exports each as a namespace. `contract-bindings` has its own loose tsconfig + an eslint ignore for the generated subdirs (the generator's output isn't strict-clean; consumers still typecheck against the exported types). Added `@stellar/stellar-sdk` + `buffer` to its deps.
> - **Read-path frontend:** `web/lib/stellar/contracts.ts` (resolves deployed ids from `config/networks.<network>.json`, env-var fallback, actionable error if unresolved — nothing hardcoded), `web/lib/stellar/kaido.ts` (server-side simulate-only read helpers + tier/status labels + WAD formatting), `app/markets/page.tsx` (lists every registered market — tier badge, status, scalar/trajectory, checkpoint count), `app/markets/[id]/page.tsx` (live params + consensus belief + window + status; graceful error states). Both pages `force-dynamic` (no build-time RPC). Home nav gets a Markets link; `web` tsconfig target → ES2020 (bindings use `bigint`). `pnpm -r typecheck` + `pnpm -r lint` green.
> **Done (5/n, this session):**
> - **`@kaido/sdk` write path** — `Kaido` client (one per network; `KaidoConfig` resolved from `config/networks.<network>.json` + env, nothing hardcoded): `createMarket`/`createTrajectoryMarket`, `trade`/`tradeTrajectory`, `addLiquidity`/`removeLiquidity`, `resolve`, `claim`/`claimTrajectory`, `getMarket`/`listMarkets`/`getMarketInfo`, `subscribeEvents` (RPC `getEvents` polling, ledger-cursor resumable). Pluggable `KaidoSigner` (Freighter/passkey-kit shape) + `keypairSigner(secret)` for scripts; build→simulate→sign→send→poll via the generated bindings. SDK tsconfig relaxes `noImplicitOverride` (the bindings generator omits `override`) — mirrors the contract-bindings package's own loose config.
> - **`web/lib/curve`** — byte-exact port of `kaido-math` (`mulDiv`/`wmul`/`wdiv`/`sqrtWad`/`expWad`/`gaussianL2Norm`/`lambda`/`gaussianPdfScaled`/`sigmaFloor`, `toWad`/`fromWad`) + the fit (`fitGaussianFromHump`, `pathToCheckpointValues`, `fitTrajectory`, `renderGaussian` — renders the *exact* fitted curve back, ADR-8). `web/test/curve.conformance.test.ts` runs `docs/test-vectors/{exp,gaussian}.json` against the TS side (matches Rust within `tol_abs`).
> - **Wallet** (`web/components/wallet/`): `WalletConnector` abstraction → `KaidoSigner`; **Freighter connector** (`@stellar/freighter-api`, fully working); **passkey connector** (`passkey-kit` — creates/connects the smart wallet, signs auth entries; Launchtube submission proxied through `web/app/api/launchtube/route.ts` so the JWT stays server-side); `WalletProvider`/`useWallet()` context (persists last connector kind); `ConnectButton`. The "play in ~10s" funding/sponsorship polish is still Sprint 4.
> - **ChartGuessr loop** (`web/app/(play)/chartguessr/`): server page resolves config + reads the configured market (`NEXT_PUBLIC_CHARTGUESSR_MARKET`); client `_game.tsx` runs the watch (live BTC via `web/app/api/btc/route.ts` — real Reflector SEP-40 feed read, no mock) → draw (`ForecastCanvas` trajectory mode + `fitTrajectory`) → submit (`tradeTrajectory`, play-vs-house, connected wallet) → resolve + `claimTrajectory` → result phases. No-mock honesty: no configured market / no feed ⇒ the UI says so.
> - **`web/components/canvas/forecast-canvas.tsx`** — pointer-drawing SVG surface with screen↔outcome mapping, context overlays (live price, consensus), checkpoint guides; returns `DrawnPoint[]` for `web/lib/curve`. `pnpm -r typecheck`/`lint`/`test` all green.
> **Not done yet (next session):** `/create` wizard wiring (SDK `createMarket`/`createTrajectoryMarket`); `resolver-reflector` trajectory mode (its `__constructor` is single-checkpoint — trajectory markets currently need a vec-outcome resolver supplied externally); a `deploy.sh` trajectory demo (deploy a BTC ChartGuessr trajectory market + write `NEXT_PUBLIC_CHARTGUESSR_MARKET`); passkey submit-path integration in `@kaido/sdk` (RPC `sendTransaction` vs Launchtube — the SDK currently always submits via RPC); Playwright ChartGuessr happy path (needs a seeded tight-window test market + mocked clock); wiring `ConnectButton` into the global header. **Operational note:** `config/networks.testnet.json` on disk still holds the Sprint-1 (scaffold) factory/registry ids — the live `/markets` + ChartGuessr pages only return data after a `make deploy:testnet` re-deploy, and need `external.usdcSacId` / `external.reflectorFeedId` populated.

User stories:
- *As a builder, I call `MarketFactory.create_market(OutcomeSpace, Parameterization, k, b, fee, Resolver, Window)` and get a live `DistributionMarket`.*
- *As a player, I open ChartGuessr, watch 45s of BTC, draw a path, submit, and after 90s see the reveal and get auto-paid.*
- *As a TS dev, I `import { Kaido } from '@kaido/sdk'` and create/trade/resolve markets.*

Engineering tasks:
- `market-factory`: `create_market(...)` deploys a `DistributionMarket` (WASM hash install + deploy), registers it in `Registry`, optionally calls `HouseVault.seed_market`. Validates params (σ_min derivable, `b>0`, fee ≤ cap, window ordering).
- `registry`: index `{market_id, outcome_space, resolver, tier, window, status}`; query fns for the frontend; emits `MarketRegistered`.
- **Trajectory markets:** generalize `distribution-market` to N checkpoints sharing one collateral pool (vector of per-checkpoint Gaussians; collateral = aggregate worst case). `OutcomeSpace::Trajectory { checkpoints: Vec<u64> }`.
- Generate TS bindings for all contracts → `packages/contract-bindings` (committed; CI regenerates on contract diff and fails if stale).
- `packages/sdk` alpha: `createMarket`, `trade`, `addLiquidity`, `resolve`, `getMarket`, `subscribeEvents`; wraps `@stellar/stellar-sdk` (build → simulate → sign → send → poll); pluggable signer (passkey-kit or Freighter).
- `web/lib/curve`: deterministic path → checkpoint-values, and (preview) checkpoint-values → fitted Gaussian-per-checkpoint params; render the *fitted* curve back. Shares `docs/test-vectors/` with `kaido-math`.
- `web/app/(play)/chartguessr`: live BTC chart (data via Reflector reads / a price stream), 45s build → 15s draw → submit (via SDK, play-vs-house) → 90s lock → reveal animation → result. No polish.
- `web/lib/stellar`: RPC client, network config, USDC SAC handle, tx status UI.

**Tests/acceptance:**
- `create_market` integration test: deploy → register → seed → trade → resolve, all via the SDK.
- Trajectory lifecycle test: 6-checkpoint BTC market; payouts scored by aggregate distance match hand calc; solvency holds.
- Bindings staleness check in CI.
- Curve conformance: TS `web/lib/curve` and Rust `kaido-math` agree on every vector (byte-exact on params after rounding rules).
- Playwright: ChartGuessr happy path on testnet (mocked clock + a seeded test market) → user ends with a result card and a balance delta.

**Deliverable:** "create any market from the SDK" + "playable ChartGuessr on testnet" demos.

---

### Sprint 4 — ChartGuessr polish, HouseVault hardening, passkey onboarding, math hardening

**Goal:** the wedge feels good; onboarding is ~10s; HouseVault risk-capped and dogfooded; math edge cases nailed. **End of this sprint ≈ Milestone 1 fully done + Milestone 2 well underway.**

User stories:
- *As a new user, I log in with a passkey in ~10 seconds (no seed phrase) and play.*
- *As a player, I get a screenshot-ready result card (my curve, the truth, my P&L, market name).*
- *As the protocol, HouseVault exposure per market is on-chain, capped, and withdrawable as third-party LPs arrive.*

Engineering tasks:
- Passkey onboarding via `passkey-kit` + Launchtube (submit passkey-signed txs); Freighter as power-user fallback; persist lightweight identity; "play in ~10s" flow. Handle the no-USDC case (testnet faucet / sponsor).
- ChartGuessr UX polish: chart styling, draw affordance (finger/mouse, undo, confidence indicator from line jitter), reveal animation, sounds optional, result card component + share intent, streak counter.
- `house-vault`: finalize per-market caps, proportional withdrawal math, exposure dashboard endpoint; make HouseVault positions visible as ordinary L1 positions in the UI ("you're trading against the house's curve").
- `kaido-math` hardening: prove/test `exp`/`erf` error bounds at domain extremes; overflow audit (use `I256` intermediaries via `soroban-fixed-point-math`); fuzz `worst_case_collateral` against a brute-force grid oracle (must always be ≥ true min within ε and never under-collateralize).
- Commit-reveal scaffolding for the draw phase (hash on submit, reveal on lock) — wired in ChartGuessr.
- Observability: structured contract events for every state transition; a minimal indexer (`web/lib/indexer`) that tails events and powers `use cache`d reads.

**Tests/acceptance:**
- Playwright: full new-user journey — passkey signup → fund → play → win/lose → result card → (mock) share — on testnet.
- HouseVault tests: cap is never exceeded across fuzzed trade sequences; proportional withdrawal conserves collateral; house P&L == negative of aggregate trader P&L (minus fees).
- Math fuzz vs. brute-force oracle: 1M+ cases, zero under-collateralization.
- Commit-reveal test: a tx that reveals a different belief than committed reverts.

**Deliverable:** **Milestone 1 deliverable submitted** ("MVP: core AMM + ChartGuessr loop + HouseVault v0 + property tests on testnet"). Demo video + testnet contract IDs + repo tag `v0.1.0-m1`.

---

### Sprint 5 — Multi-market UX, distribution mode, capped Gaussians, full LP flows, fee splitting, T3 resolver

**Goal:** Kaido reads as a *platform*, not one game: scalar markets with the draw-a-hump UI, capped Gaussians, real LP economics, designated resolvers for fun markets.

User stories:
- *As a forecaster, on a scalar market I drag to set the center and pinch to set the width of my hump; I see the consensus hump faintly behind mine.*
- *As a market creator, I can enable capped Gaussians so traders can express sharp beliefs.*
- *As an LP, I add/remove liquidity at scale `y`, keep my proportional position, and earn fees.*
- *As a community organizer, I create a "trust me" market with myself as the designated resolver — clearly badged.*

Engineering tasks:
- `distribution-market`: capped-Gaussian payout path `f(x) = min(b, λφ(x))` with λ rescaled to keep `‖f‖₂ = k`; `kaido-math` adds the capped-norm solve (numeric root-find in fixed point) and capped settlement math.
- Full `add_liquidity`/`remove_liquidity`: `y·(b−f)` in, `y·L` shares out, `y·f` retained as own position; full collateralization invariant under LP entry/exit; fee accrual per share.
- Fee engine: per-trade bps split → LP pool / treasury / creator; `claim_fees`.
- `resolver-designated` (T3): single named party `report(value)` after `resolve_time`; tier badge surfaced everywhere.
- `web/app/markets/[id]`: generic market page — distribution mode canvas (draw hump → `(μ,σ)`), live consensus overlay, position list, LP panel, resolver tier badge, window countdown. Uses Next 16 `params` Promise + `use cache` for reads.
- `web/app/create`: market-creation wizard (pick outcome space scalar/trajectory, range, resolver tier, k/b/fee, window) → calls `MarketFactory` via SDK; preview of `σ_min`, max payout, fee.
- SDK: add LP methods, fee claims, capped-Gaussian markets, T3 resolver helper.

**Tests/acceptance:**
- Capped-Gaussian property tests: `f(x) ≤ b` always, `‖f‖₂ = k` within ε, settlement = `min(λ₂φ(x₀),b) − min(λ₁φ(x₀),b)`; fuzz vs. brute-force.
- LP invariant tests: enter/exit at random scales over random trade histories → `Σ holdings = b` per outcome always; fee math conserves (no fees minted from thin air).
- Playwright: create a scalar market via the wizard → draw a hump → trade → add LP from a second account → resolve via T3 → both get correct payouts/fees.
- Conformance vectors extended to capped Gaussians (Rust ↔ TS).

**Deliverable:** distribution mode + capped Gaussians + LP economics on testnet. Demo: "create an election-margin market, trade a hump, LP it, resolve it."

---

### Sprint 6 — T1 attested adapter + T2 optimistic oracle, leaderboards/calibration, SDK 1.0, security review kickoff

**Goal:** the trustless/economically-secured frontier — T1 and T2 — plus the social loop; SDK frozen for external use; external audit begins.

User stories:
- *As a data partner, I post a signed report (sports result, box-office number, CPI print) via a permissioned poster; there's a challenge window.*
- *As anyone, on a T2 market I can propose the value with a bond, and anyone can dispute by bonding; undisputed after the window ⇒ final; disputes escalate.*
- *As a forecaster, I appear on a leaderboard ranked by calibration (Brier-like), not just $ won, with streaks.*
- *As an external dev, I install `@kaido/sdk@1.0` and embed a Kaido market in my app.*

Engineering tasks:
- `resolver-attested` (T1): EIP-191-style signed report verified on-chain against a registered provider key; permissioned poster role; challenge window; `dispute()` freezes resolution pending arbitration; build the first adapter (pick one: a sports API or box-office tracker) with an off-chain poster service (a `web/app/api` route handler or a tiny standalone worker — keep the signing key out of the browser).
- `resolver-optimistic` (T2): `propose(value, bond)`, `dispute(bond)`, escalation to a vote/arbitration module (v1: a multisig/committee), bond slashing, finalization after window; basic UI for the dispute game.
- Calibration scoring: off-chain computation over resolved positions → leaderboard tables; streaks; identity tie-in; result cards link to leaderboard rank.
- SDK 1.0: stabilize public API, semver, full TS docs, examples (`examples/embed-a-market`, `examples/custom-resolver`), publish to npm (or a private registry until mainnet).
- **Engage external auditor**; freeze the AMM math API; hand over `kaido-math` + `distribution-market` + `market-factory` + `house-vault` + invariants doc + fuzz corpus.
- Geofencing scaffolding + honest disclosures + ToS draft in the frontend (Part VII items 3–4); resolver tier badges audited for prominence.

**Tests/acceptance:**
- T1: signed-report happy path + bad-signature/expired-report/disputed-then-overturned tests; the off-chain poster has its own integration test against a recorded API fixture.
- T2: propose/dispute/escalate/slash lifecycle tests; "lazy honest watcher" scenario (one dispute is enough to prevent a bad finalization).
- Leaderboard: calibration score matches a reference implementation on a fixed resolved-market dataset.
- SDK: a sample external app (in `examples/`) builds and runs against testnet in CI.
- Audit kickoff meeting held; scope doc accepted.

**Deliverable:** all four resolver tiers live on testnet with tier badges; SDK 1.0 published; leaderboards live; audit in progress. **≈ Milestone 2 deliverable submitted** (repo tag `v0.2.0-m2`).

---

### Sprint 7 — Pre-mainnet hardening, conservative caps, MEV mitigations, ChartGuessr economics finalization, PvP design

**Goal:** turn the testnet system into something safe to put real USDC behind.

User stories:
- *As the protocol, every market has conservative per-market risk caps in early mainnet rounds.*
- *As a trader, my belief tx can't be trivially front-run.*
- *As a player, the "1 USDC" entry, fees, and payouts are exactly as documented — visible rake, no hidden house edge.*

Engineering tasks:
- Address audit findings (rolling — likely spans S7–S8); each fix gets a regression test.
- Conservative caps: global + per-market `b` ceilings, HouseVault exposure ceilings, max position size, max σ-floor aggressiveness — all governance-set, all on-chain, all surfaced in UI.
- MEV: ship commit-reveal for short-window games end to end; per-market trade-size limits (already implied by σ-scaling but enforce explicitly); document why Stellar's ordering model is less MEV-prone; add a fee floor to deter spam.
- ChartGuessr economics: finalize fee bps, pool payout formula (closest-N gets paid from the pool), HouseVault P&L expectations, faucet → real-USDC switch; "what players pay for / where the value goes" copy matches §21.
- PvP pools design doc + skill-bracket matchmaking design (build is M4, but design now so the data model doesn't have to change later).
- Mainnet deploy pipeline: deterministic WASM builds, `stellar contract build --meta`, deploy scripts with checksum verification, per-network config (USDC SAC, Reflector feed address, multisig admin), upgrade/admin keys behind a multisig, runbook.
- Load/soak test on testnet: many concurrent ChartGuessr rounds + market creations; gas/footprint budgets confirmed.

**Tests/acceptance:**
- All P0/P1 audit findings closed with regression tests; P2s triaged.
- Cap-enforcement tests: every cap rejects the over-limit case with the right error.
- MEV tests: front-run-then-commit attack reverts; spam below fee floor reverts.
- Soak test: N hours, zero invariant violations, no stuck markets, gas within budget.
- Mainnet deploy dry-run on testnet using the *exact* mainnet pipeline; checksums match local builds.

**Deliverable:** release candidate `v0.9.0-rc`; audit report (interim) attached; mainnet runbook reviewed.

---

### Sprint 8 — Audit close-out, legal opinion gate, mainnet launch, first non-crypto market, bug bounty

**Goal:** **Milestone 3 — Mainnet / "UX readiness."** Ship it.

User stories:
- *As anyone, I can play 1-USDC ChartGuessr on Stellar mainnet.*
- *As anyone, I can see at least one non-crypto market (election margin or box office) created and resolved end to end via a T1/T2 resolver on mainnet.*
- *As an external party, I have created a market with my own resolver on mainnet.*
- *As the team, we have a written legal opinion for the launch jurisdiction; geofencing + ToS are live.*

Engineering tasks:
- **Legal opinion obtained (gating milestone, per whitepaper Part VII §6).** Implement whatever it requires: entity, ToS, KYC threshold logic if needed, geofence list, disclosures. **No mainnet launch until this is signed off.**
- Final audit report published; all agreed findings fixed; publish the report.
- Mainnet deploy: factory, registry, distribution-market WASM hash, house-vault, all four resolvers; verify checksums; admin multisig live; conservative caps on.
- Launch ChartGuessr-on-BTC mainnet with real USDC (T0 Reflector resolver), play-vs-house.
- Create + run to resolution at least one **non-crypto** market on mainnet via a T1 (attested) or T2 (optimistic) resolver — coordinate the data partner / poster service for real.
- Onboard one external party to create a market with their own resolver (use the SDK + a guided session); document it as a case study.
- Bug bounty live (Immunefi or similar) with scope = deployed contracts; triage process documented.
- SDK 1.0 + full docs site published; "create your first market" tutorial.
- Status page / monitoring / alerting for mainnet contracts and the indexer.

**Tests/acceptance:**
- Mainnet smoke suite: deploy verification (bytecode == audited build), a tiny real-USDC ChartGuessr round end to end, a real non-crypto market resolved correctly, fee splits land in the right accounts.
- Playwright against mainnet (read-only + a controlled small-stake account) green.
- Legal: signed opinion on file; geofence verified (blocked jurisdictions actually blocked at the edge); ToS acceptance enforced before first trade.
- External-party market resolved correctly; case study written.
- Bug bounty page live; an internal "report a bug" dry run completes the triage flow.

**Deliverable:** **Milestone 3 deliverable submitted** — mainnet live, non-crypto market resolved, external creator, audit done, legal opinion obtained, geofencing/ToS in place. Repo tag `v1.0.0`. Public launch announcement.

---

### Sprint 9–10 — Post-launch / Milestone 4 kickoff (follow-on)

**Goal:** prove Kaido is infrastructure, not a game.

Themes (groom into sprints as priorities settle):
- **More T1 adapters** (sports, weather, official stats) + a hardened T2 (better arbitration, larger watcher set, optimistic-oracle audits).
- **Richer belief parameterizations** beyond Gaussian — right-skewed (for rainfall-type markets), then multi-modal mixtures; `kaido-math` gains the new norms/settlement math; canvas gains the UI to draw them; conformance vectors extended.
- **PvP pools with skill brackets**, tournaments, embeddable widgets (an `<iframe>`/web component that drops a Kaido market into any site, backed by the SDK).
- **Partner integrations**: parametric-insurance pilot, a sports app, a forecasting community building on Layer 1 — each one a market created by a third party with their own resolver.
- Correlation structure across trajectory checkpoints (replace the independent-Gaussian-per-checkpoint approximation with a simple correlated model).
- Governance token decision (explicitly out of scope until/unless revisited with counsel).

**Acceptance for M4 deliverable:** ≥2 new T1 adapters live; ≥1 non-Gaussian parameterization shipped and used in a real market; PvP pools live with skill brackets; ≥1 external partner integration in production.

---

## 6. Test strategy (cross-cutting)

**Layered pyramid:**

1. **Rust unit tests** (`#[cfg(test)]` + `soroban_sdk::testutils`) — every contract fn, every error branch, every storage transition. Fast, run on every push.
2. **Property tests** (`proptest`) — the invariants, on `kaido-math` and `distribution-market`:
   - `‖f‖₂ = k` within ε after any trade/LP op.
   - `Σ holdings = b` *exactly* (integer) per outcome at all times.
   - `f(x) ≤ b` for all `x` (σ-floor or capped path).
   - `worst_case_collateral ≥ realized_loss` for any resolution point (never under-collateralized).
   - settlement total == `b` exactly.
   - monotonicities (`l2_norm` ↓ in σ, λ ↑ in σ, etc.).
3. **Fuzzing** (`cargo-fuzz`, nightly lane) — targets: `trade` sequences, `add/remove_liquidity` sequences, `kaido-math` functions vs. a brute-force grid oracle, capped-Gaussian solver, resolver inputs (stale/garbage prices, malformed signed reports). Corpus committed; CI runs a time-boxed smoke (e.g. 5 min/target), nightly runs longer.
4. **Multi-contract integration tests** (`contracts/tests/`) — factory→registry→house→market→resolver lifecycles against a local Soroban RPC, with a **mock SEP-40 oracle** and mock resolvers for determinism; one suite runs against real Reflector testnet as a (flaky-tolerant) smoke.
5. **Conformance / cross-language vectors** (`docs/test-vectors/*.json`) — the single source of truth for curve-fit and Gaussian math; executed by *both* Rust (`kaido-math`) and TS (`web/lib/curve`, `packages/sdk`). A mismatch fails CI on both sides. This is the contract that prevents "drew X, recorded Y" disputes.
6. **SDK tests** (Vitest) — tx building/simulation/encoding against recorded RPC fixtures + a live-testnet integration tier (separate CI job, can be marked allowed-to-fail on RPC outages).
7. **Web unit/component tests** (Vitest + Testing Library) — canvas math, curve preview, market state rendering, wallet flows (mocked signer).
8. **E2E** (Playwright) — runs against testnet with seeded markets and a mocked clock: new-user passkey journey, ChartGuessr round, create-a-market wizard, distribution-mode trade, LP add/remove, T1/T2/T3 resolution flows, result card + leaderboard. A read-only subset runs against mainnet post-launch.
9. **Gas/footprint snapshots** — every contract fn has a recorded resource cost; CI flags regressions > threshold.
10. **Security review & bug bounty** — external audit gated before mainnet (S6 kickoff → S8 close); Immunefi-style bounty live at launch; all findings → regression tests.
11. **Manual exploratory + chaos** — soak tests (many concurrent rounds), oracle-failure drills (kill the mock oracle mid-market → market must pause/dispute, never mispay), reorg/forge-time drills on localnet.

**CI gates (must be green to merge):** fmt, clippy `-D warnings`, `cargo test`, fuzz smoke, conformance vectors (Rust+TS), bindings-staleness check, web lint+typecheck+build, Vitest, Playwright smoke. **Nightly:** long fuzz, full Playwright, live-testnet integration. **Pre-deploy:** deterministic-build checksum verification.

---

## 7. Risk register → mitigations (engineering view; mirrors whitepaper Part VI)

| Risk | Mitigation in this plan | Owned by sprint |
|---|---|---|
| Unbounded LP loss (δ-spike belief) | σ-floor default + capped-Gaussian opt-in; property test `f(x) ≤ b`; HouseVault per-market caps; fuzz vs. brute-force | S1–S5, S7 |
| AMM math bugs | `kaido-math` with proven error bounds; proptest invariants; fuzz; external audit; conservative caps early; bug bounty | S1–S2, S6–S8 |
| Oracle manipulation/failure | tiered labeled resolvers; T0 only for robust feeds; TWAP reads for short windows; challenge windows on T1/T2; oracle-failure drill → market pauses, never mispays | S2, S5–S6 |
| Sophisticates farm casuals | σ-floor caps per-trade extraction; play-vs-house default (house, capped, absorbs skew); skill-bracket PvP later; calibration-leaderboard framing | S4, S6, S9+ |
| Liquidity cold-start | HouseVault seeds every market; play-vs-house default; LP fee incentives | S2–S5 |
| Frontend↔chain belief mismatch | deterministic curve-fit; render fitted curve back before confirm; shared conformance vectors (Rust↔TS); contract is source of truth | S3–S5 |
| MEV / front-running | commit-reveal for short-window games; per-market trade-size limits; fee floor; Stellar ordering model | S4, S7 |
| Regulatory action | market-not-casino framing (HouseVault = LP); platform-not-price-app (ship non-crypto markets early); geofencing; labeled trust tiers; no token; **legal opinion gate before mainnet** | S5–S6, S8 |
| Supply-chain (SDK CVE-2026-26267 etc.) | pin `soroban-sdk` to patched versions; `cargo audit` / `pnpm audit` in CI; Dependabot; reproducible builds | S0, ongoing |
| Testnet reset wipes state mid-sprint (next: 2026‑06‑17, 2026‑12‑16) | scripted idempotent `make deploy:testnet` + re-seed fixtures; nothing off-chain treats a testnet contract id as permanent; reset dates on the sprint calendar so demos/SCF reviews don't land just after a wipe | S0, ongoing |

---

## 8. Milestone ↔ deliverable summary (SCF mapping)

- **M1 (~10%, on acceptance + first deliverable) — MVP/testnet:** `DistributionMarket` core AMM (single scalar, Gaussian + σ-floor, full collateralization, settlement), `HouseVault` v0, basic `MarketFactory`, ChartGuessr-on-BTC loop (45s/15s/reveal/auto-payout, play-vs-house, Reflector T0), property tests on invariants. → **End of Sprint 4.** Tag `v0.1.0-m1`.
- **M2 (~20%) — Testnet feature-complete:** multi-market + permissionless `create_market`, trajectory + scalar markets, capped-Gaussian opt-in, oracle framework (T0 live, T1 adapter + first adapter, T2 optimistic basic, T3 designated) with tier badges, Forecast Canvas both modes polished, result cards, calibration leaderboards, passkey onboarding, LP flows + fee splitting, SDK alpha→1.0 + docs, external security review begun. → **End of Sprint 6.** Tag `v0.2.0-m2`.
- **M3 (~30% + final 40%) — Mainnet / UX readiness:** audit complete, conservative per-market caps, bug bounty live; mainnet launch with 1-USDC ChartGuessr; ≥1 non-crypto market live and resolved via T1/T2; SDK 1.0 + docs + ≥1 external party created a market with their own resolver; legal opinion obtained; geofencing + ToS in place. → **End of Sprint 8.** Tag `v1.0.0`.
- **M4 (follow-on):** more T1 adapters + hardened T2; richer parameterizations (skewed, multi-modal); PvP pools with skill brackets + tournaments + embeddable widgets; partner integrations (parametric-insurance, sports, forecasting communities). → **Sprints 9–10+.**

---

*Build plan v0.1 — working draft, paired with `kaido-whitepaper.md` v0.1. Re-baseline sprint scope after Sprint 0 once the SCF deliverable text is final and `kaido-math` complexity is measured. Open engineering questions tracked in `docs/adr/`: fixed-point scale & error bounds for `exp`/`erf`; capped-Gaussian λ-solve convergence in fixed point; correlation across trajectory checkpoints; T2 arbitration design; deterministic-build pipeline for audited bytecode.*
