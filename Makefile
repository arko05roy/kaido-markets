# Root convenience targets. JS lives under pnpm/turbo; Rust under cargo-make
# (`contracts/Makefile.toml`). These targets mostly delegate.
#
#   make localnet         start a local Stellar/Soroban network (Docker)
#   make localnet-stop     stop it
#   make contracts-build   build all contract WASM
#   make contracts-test    cargo test the contracts workspace
#   make deploy:testnet    scripted, idempotent deploy of the whole suite
#   make seed:testnet      re-seed demo/test fixtures (re-runnable after a reset)

.PHONY: localnet localnet-stop localnet-logs contracts-build contracts-test \
        deploy\:local deploy\:testnet deploy\:futurenet deploy\:mainnet \
        seed\:testnet web-dev bootstrap

LOCAL_CONTAINER ?= kaido-localnet

bootstrap:
	pnpm install
	cargo make --cwd contracts build-wasm

# --- local network --------------------------------------------------------
# Uses the Stellar CLI's bundled quickstart container (Docker required).
# RPC: http://localhost:8000/rpc · Horizon: http://localhost:8000
# Friendbot: http://localhost:8000/friendbot
# Passphrase: "Standalone Network ; February 2017"
localnet:
	stellar container start local --name $(LOCAL_CONTAINER) \
	  || docker run -d --rm -p 8000:8000 --name $(LOCAL_CONTAINER) \
	       stellar/quickstart:latest --local --enable rpc
	@echo "local network up on http://localhost:8000 (rpc at /rpc)"

localnet-stop:
	-stellar container stop $(LOCAL_CONTAINER) || docker stop $(LOCAL_CONTAINER)

localnet-logs:
	-stellar container logs $(LOCAL_CONTAINER) || docker logs -f $(LOCAL_CONTAINER)

# --- contracts ------------------------------------------------------------
contracts-build:
	cargo make --cwd contracts build-wasm

contracts-test:
	cargo make --cwd contracts test

# --- deploy / seed --------------------------------------------------------
# Each deploy is scripted + idempotent: it re-deploys the whole suite and
# rewrites config/networks.<network>.json. Nothing off-chain may treat a
# testnet contract id as permanent (testnet resets ~2-4x/yr).
deploy\:local:
	STELLAR_NETWORK=local cargo make --cwd contracts deploy
deploy\:testnet:
	STELLAR_NETWORK=testnet cargo make --cwd contracts deploy
deploy\:futurenet:
	STELLAR_NETWORK=futurenet cargo make --cwd contracts deploy
deploy\:mainnet:
	STELLAR_NETWORK=mainnet cargo make --cwd contracts deploy

seed\:testnet:
	STELLAR_NETWORK=testnet ./contracts/scripts/seed.sh testnet

# --- web ------------------------------------------------------------------
web-dev:
	pnpm --filter web dev
