# `contracts/fuzz` — cargo-fuzz targets (nightly lane)

This crate is **excluded from the main Cargo workspace** (see `contracts/Cargo.toml`)
because `cargo-fuzz` / `libfuzzer-sys` require the nightly toolchain.

It's a stub in Sprint 0. Real targets land from Sprint 2 (see build.md §6 Test
strategy, item 3 and Sprint 2 acceptance):

- `trade_sequences` — random `trade` call sequences never break `Σ holdings = b`
  and never make `f(x) > b`; collateral posted ≥ realized loss.
- `liquidity_sequences` — random `add_liquidity` / `remove_liquidity` sequences.
- `kaido_math_vs_grid` — `kaido-math` functions vs. a brute-force grid oracle.
- `capped_gaussian_solver` — the capped-norm λ root-find.
- `resolver_inputs` — stale/garbage prices, malformed signed reports.

## Setup (when implementing)

```bash
rustup toolchain install nightly
cargo install cargo-fuzz
cd contracts/fuzz   # or: cargo +nightly fuzz run <target> from contracts/
cargo +nightly fuzz init        # generates Cargo.toml + fuzz_targets/
cargo +nightly fuzz run trade_sequences -- -max_total_time=300   # CI smoke
```

The corpus is committed under `fuzz/corpus/<target>/`; CI runs a time-boxed
smoke (≈5 min/target), the nightly job runs longer.
