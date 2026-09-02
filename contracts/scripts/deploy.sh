#!/usr/bin/env bash
# Scripted, idempotent deploy of the whole Kaido contract suite to one network.
#
#   ./contracts/scripts/deploy.sh <local|testnet|futurenet|mainnet>
#
# Design rules (build.md §0a):
#   * idempotent — re-running re-builds, re-uploads and re-deploys the whole
#     suite and rewrites config/networks.<network>.json (the "live ids" file,
#     gitignored);
#   * never hardcodes per-network ids — USDC SAC, Reflector feed, admin
#     multisig, Launchtube are read from .env / config and (later) stored in the
#     contracts' own config at deploy time;
#   * the *exact* same script is used for testnet and the mainnet dry-run.
#
# Status: Sprint 1 — `distribution-market` has real logic (storage, `init`,
# `get_params`/`get_state`, `MarketCreated`), and is deployed *and* seeded with a
# demo scalar Gaussian market here; the other 7 crates are still scaffolds.
# Factory WASM-hash install, registry wiring and house-vault seeding land in
# Sprints 2–3.
set -euo pipefail

NETWORK="${1:-${STELLAR_NETWORK:-}}"
if [[ -z "${NETWORK}" ]]; then
  echo "usage: $0 <local|testnet|futurenet|mainnet>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACTS_DIR="${ROOT}/contracts"
CONFIG="${ROOT}/config/networks.json"
OUT="${ROOT}/config/networks.${NETWORK}.json"

# Load .env if present (never committed).
if [[ -f "${ROOT}/.env" ]]; then
  set -a; # shellcheck disable=SC1091
  source "${ROOT}/.env"; set +a
fi

# --- network params -------------------------------------------------------
read_cfg() { node -e "const c=require('${CONFIG}').networks['${NETWORK}']||{};process.stdout.write(String(c['$1']??''))"; }
PASSPHRASE="$(read_cfg networkPassphrase)"
RPC="${RPC_URL:-$(read_cfg rpcUrl)}"
FRIENDBOT="${FRIENDBOT_URL:-$(read_cfg friendbotUrl)}"
[[ -n "${PASSPHRASE}" ]] || { echo "unknown network '${NETWORK}' (not in ${CONFIG})" >&2; exit 2; }
[[ -n "${RPC}" ]] || { echo "no RPC url for '${NETWORK}'. Set RPC_URL in .env (mainnet needs a third-party provider)." >&2; exit 2; }

# --- per-network values that must be resolved (never hardcoded) ----------
# Sprint 2: the USDC SAC id is now load-bearing (the distribution-market and
# house-vault take it as a constructor/init arg — never hardcoded). Require it
# from the environment with no default; fail loudly if unset.
: "${USDC_SAC_ID:?set USDC_SAC_ID (the USDC Stellar Asset Contract id for ${STELLAR_NETWORK:-this network}); see .env.example}"
# Optional Reflector feed + asset for the T0 resolver constructor; if unset we
# point the demo resolver at a placeholder so the deploy still completes.
: "${REFLECTOR_FEED_ID:=${USDC_SAC_ID}}"
: "${REFLECTOR_ASSET_SYMBOL:=BTC}"
: "${REFLECTOR_FEED_ID:=}"
: "${ADMIN_ADDRESS:=}"

if [[ "${NETWORK}" == "mainnet" ]]; then
  : "${USDC_SAC_ID:?mainnet deploy requires USDC_SAC_ID}"
  : "${REFLECTOR_FEED_ID:?mainnet deploy requires REFLECTOR_FEED_ID}"
  : "${ADMIN_ADDRESS:?mainnet deploy requires ADMIN_ADDRESS (multisig)}"
  echo "refusing to proceed: mainnet deploy is gated on the audit + legal opinion (build.md Sprint 8)." >&2
  exit 1
fi

# --- register the network with the Stellar CLI (idempotent) --------------
stellar network add "${NETWORK}" \
  --rpc-url "${RPC}" \
  --network-passphrase "${PASSPHRASE}" >/dev/null 2>&1 || true

# --- deployer identity ---------------------------------------------------
# Priority: DEPLOYER_SECRET_KEY (raw, from .env) > DEPLOYER_KEY_NAME (CLI-managed,
# auto-created + Friendbot-funded on non-mainnet if it doesn't exist).
if [[ -n "${DEPLOYER_SECRET_KEY:-}" ]]; then
  SOURCE="${DEPLOYER_SECRET_KEY}"
  DEPLOYER_DESC="(secret key from .env)"
  DEPLOYER_ADDR="$(stellar keys public-key "${DEPLOYER_SECRET_KEY}" 2>/dev/null || echo "(from .env secret)")"
else
  KEY_NAME="${DEPLOYER_KEY_NAME:-kaido-${NETWORK}-deployer}"
  if ! stellar keys address "${KEY_NAME}" >/dev/null 2>&1; then
    [[ "${NETWORK}" == "mainnet" ]] && { echo "won't auto-create a mainnet key" >&2; exit 1; }
    echo "creating + funding deployer key '${KEY_NAME}' on ${NETWORK}..."
    stellar keys generate "${KEY_NAME}" --network "${NETWORK}" --fund
  fi
  SOURCE="${KEY_NAME}"
  DEPLOYER_DESC="(CLI key '${KEY_NAME}')"
  DEPLOYER_ADDR="$(stellar keys address "${KEY_NAME}")"
fi
SOURCE_ARG=(--source-account "${SOURCE}")

echo "network        : ${NETWORK}"
echo "rpc            : ${RPC}"
echo "passphrase     : ${PASSPHRASE}"
echo "deployer       : ${DEPLOYER_ADDR} ${DEPLOYER_DESC}"
echo "usdc sac id    : ${USDC_SAC_ID:-<unset — resolve before trading goes live>}"
echo "reflector feed : ${REFLECTOR_FEED_ID:-<unset — see Reflector /oracles tab>}"
echo "admin          : ${ADMIN_ADDRESS:-<unset>}"
echo

# Admin for the registry / factory / house-vault (a multisig on mainnet —
# resolved from .env, never hardcoded; falls back to the deployer on non-mainnet).
ADMIN="${ADMIN_ADDRESS:-${DEPLOYER_ADDR}}"

# --- build wasm ----------------------------------------------------------
( cd "${CONTRACTS_DIR}" && cargo make build-wasm )
WASM_DIR="${CONTRACTS_DIR}/target/wasm32v1-none/release"

# Deploy order matters: `distribution-market` (its WASM hash feeds the factory),
# the resolvers and `house-vault` (no inter-deps), then `registry` (constructed
# with a placeholder factory = admin), then `market-factory` (needs the registry
# id + the dm WASM hash), and finally `registry.set_factory(<factory id>)`.
CONTRACTS="distribution-market resolver-reflector resolver-attested resolver-optimistic resolver-designated house-vault registry market-factory"

# kebab-case -> camelCase, portably (no GNU sed).
to_camel() { awk 'BEGIN{FS="-"}{out=$1;for(i=2;i<=NF;i++)out=out toupper(substr($i,1,1)) substr($i,2);print out}' <<<"$1"; }

CONTRACTS_JSON=""
N=0
for c in ${CONTRACTS}; do
  wasm="${WASM_DIR}/$(echo "${c}" | tr '-' '_').wasm"
  [[ -f "${wasm}" ]] || { echo "missing ${wasm}" >&2; exit 1; }

  echo "-- ${c} --------------------------------"
  hash="$(stellar contract upload --wasm "${wasm}" --network "${NETWORK}" "${SOURCE_ARG[@]}")"
  echo "   wasm hash : ${hash}"
  eval "HASH_$(echo "${c}" | tr '-' '_')=${hash}"
  # `distribution-market` uses an explicit `init(...)` (invoked below);
  # `house-vault` / `resolver-reflector` / `registry` / `market-factory` have
  # `__constructor`s. None hardcode per-network ids — they take them as args.
  CTOR_ARGS=()
  case "${c}" in
    house-vault)
      CTOR_ARGS=(-- --admin "${ADMIN}" --usdc "${USDC_SAC_ID}")
      ;;
    resolver-reflector)
      # demo resolver (scalar mode): resolve_time = now+2h, 12-record TWAP,
      # no checkpoints. A second, trajectory-mode resolver is deployed below
      # for the ChartGuessr demo market.
      CTOR_ARGS=(-- --oracle "${REFLECTOR_FEED_ID}" \
        --asset "{\"Other\":\"${REFLECTOR_ASSET_SYMBOL}\"}" \
        --resolve-time "$(( $(date +%s) + 7200 ))" --twap-records 12 \
        --checkpoints '[]')
      ;;
    registry)
      # placeholder factory = admin; rewired to the real factory id below.
      CTOR_ARGS=(-- --admin "${ADMIN}" --factory "${ADMIN}")
      ;;
    market-factory)
      CTOR_ARGS=(-- --admin "${ADMIN}" \
        --market-wasm "${HASH_distribution_market}" \
        --registry "${ID_registry}" --usdc "${USDC_SAC_ID}")
      ;;
  esac
  # `${arr[@]+...}` so an empty CTOR_ARGS doesn't trip `set -u` on bash 3.2 (macOS).
  id="$(stellar contract deploy --wasm-hash "${hash}" --network "${NETWORK}" "${SOURCE_ARG[@]}" ${CTOR_ARGS[@]+"${CTOR_ARGS[@]}"})"
  echo "   contract  : ${id}"
  key="$(to_camel "${c}")"
  [[ -n "${CONTRACTS_JSON}" ]] && CONTRACTS_JSON="${CONTRACTS_JSON},"
  CONTRACTS_JSON="${CONTRACTS_JSON}
    \"${key}\": { \"id\": \"${id}\", \"wasmHash\": \"${hash}\" }"
  # Remember each id under its snake_case name for the steps below.
  eval "ID_$(echo "${c}" | tr '-' '_')=${id}"
  N=$(( N + 1 ))
done

# --- wire the registry to the real factory -------------------------------
echo "-- registry.set_factory(${ID_market_factory}) --"
stellar contract invoke --id "${ID_registry}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
  -- set_factory --new-factory "${ID_market_factory}" || \
  echo "   (set_factory failed — re-run manually)" >&2

# --- seed + verify the distribution-market (Sprint 1 deliverable) ---------
# Initialise the just-deployed scalar Gaussian market with a small demo curve:
# k = 1, b = 100, μ₀ = 50, σ₀ = 1 (all WAD-scaled, 1e18; ADR-1/ADR-2), 0.30%
# fee, tier 0 (Reflector / T0), resolver = the (still-scaffold) resolver-reflector
# contract (only *called* at resolve() time — Sprint 2 — so any valid address
# does), window now / +1h / +2h. Then read `get_params` / `get_state` back to
# prove the round-trip. This market is a demo seed; a fresh one is deployed on
# every run (testnet resets ~2-4×/yr — build.md §0a).
WAD18="1000000000000000000"            # 1e18
B18="100000000000000000000"            # 100 * 1e18
MU0_18="50000000000000000000"          # 50 * 1e18
NOW="$(date +%s)"
W_OPEN="${NOW}"; W_LOCK="$(( NOW + 3600 ))"; W_RESOLVE="$(( NOW + 7200 ))"
echo "-- distribution-market: init + verify ----"
if stellar contract invoke --id "${ID_distribution_market}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
     -- init \
        --k "${WAD18}" --b "${B18}" --fee-bps 30 \
        --resolver "${ID_resolver_reflector}" --tier 0 \
        --window-open "${W_OPEN}" --window-lock "${W_LOCK}" --window-resolve "${W_RESOLVE}" \
        --mu0 "${MU0_18}" --sigma0 "${WAD18}" --usdc "${USDC_SAC_ID}"; then
  echo "   get_params ->"
  stellar contract invoke --id "${ID_distribution_market}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no \
    -- get_params || true
  echo "   get_state  ->"
  stellar contract invoke --id "${ID_distribution_market}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no \
    -- get_state || true
else
  echo "   (init invoke failed — the contract is deployed; re-run init manually with the same args)" >&2
fi

# --- demo: create a market through the factory (Sprint 3) ----------------
# Proves the permissionless path: factory deploys a fresh DistributionMarket,
# inits it, and registers it. Same demo curve as above; a *new* market every run.
echo "-- market-factory.create_market (demo) ----"
if MKT="$(stellar contract invoke --id "${ID_market_factory}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
     -- create_market \
        --creator "${DEPLOYER_ADDR}" \
        --k "${WAD18}" --b "${B18}" --fee-bps 30 \
        --resolver "${ID_resolver_reflector}" --tier 0 \
        --window-open "${W_OPEN}" --window-lock "${W_LOCK}" --window-resolve "${W_RESOLVE}" \
        --mu0 "${MU0_18}" --sigma0 "${WAD18}" 2>/dev/null)"; then
  MKT="${MKT//\"/}"
  echo "   created market : ${MKT}"
  echo "   registry.count ->"
  stellar contract invoke --id "${ID_registry}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no -- count || true
  echo "   registry.get(${MKT}) ->"
  stellar contract invoke --id "${ID_registry}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no -- get --market "${MKT}" || true
else
  echo "   (factory create_market failed — re-run manually)" >&2
fi

# --- demo: a trajectory ChartGuessr-on-BTC market (Sprint 3) -------------
# Deploys a *second* resolver-reflector in trajectory mode (3 checkpoints on
# the BTC feed), then `factory.create_trajectory_market` against it. The
# resulting market id is what the web app's `NEXT_PUBLIC_CHARTGUESSR_MARKET`
# points at; we also record it in the live-ids file under `demo`. A fresh
# market every run (testnet resets — build.md §0a).
echo "-- ChartGuessr trajectory demo ------------"
T_NOW="$(date +%s)"
CP1="$(( T_NOW + 600 ))"; CP2="$(( T_NOW + 1200 ))"; CP3="$(( T_NOW + 1800 ))"
TJ_RESOLVE="$(( CP3 + 60 ))"
TJ_OPEN="${T_NOW}"; TJ_LOCK="$(( CP3 - 60 ))"
CHECKPOINTS_JSON="[${CP1},${CP2},${CP3}]"
# initial consensus: flat at μ = 50 (WAD), σ = 1 (WAD) per checkpoint — the
# real curve gets traded in; this is just a non-degenerate seed.
MUS0_JSON="[\"${MU0_18}\",\"${MU0_18}\",\"${MU0_18}\"]"
SIGMAS0_JSON="[\"${WAD18}\",\"${WAD18}\",\"${WAD18}\"]"
CHARTGUESSR_RESOLVER=""
CHARTGUESSR_MARKET=""
if CHARTGUESSR_RESOLVER="$(stellar contract deploy --wasm-hash "${HASH_resolver_reflector}" \
     --network "${NETWORK}" "${SOURCE_ARG[@]}" \
     -- --oracle "${REFLECTOR_FEED_ID}" --asset "{\"Other\":\"${REFLECTOR_ASSET_SYMBOL}\"}" \
        --resolve-time "${TJ_RESOLVE}" --twap-records 1 --checkpoints "${CHECKPOINTS_JSON}" 2>/dev/null)"; then
  echo "   trajectory resolver : ${CHARTGUESSR_RESOLVER}"
  if CHARTGUESSR_MARKET="$(stellar contract invoke --id "${ID_market_factory}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
       -- create_trajectory_market \
          --creator "${DEPLOYER_ADDR}" \
          --k "${WAD18}" --b "${B18}" --fee-bps 30 \
          --resolver "${CHARTGUESSR_RESOLVER}" --tier 0 \
          --checkpoints "${CHECKPOINTS_JSON}" \
          --window-open "${TJ_OPEN}" --window-lock "${TJ_LOCK}" --window-resolve "${TJ_RESOLVE}" \
          --mus0 "${MUS0_JSON}" --sigmas0 "${SIGMAS0_JSON}" 2>/dev/null)"; then
    CHARTGUESSR_MARKET="${CHARTGUESSR_MARKET//\"/}"
    echo "   chartguessr market  : ${CHARTGUESSR_MARKET}"
  else
    echo "   (create_trajectory_market failed — re-run manually)" >&2
  fi
else
  echo "   (trajectory resolver deploy failed — re-run manually)" >&2
fi

json_or_null() { [[ -n "$1" ]] && printf '"%s"' "$1" || printf 'null'; }

# --- write the live-ids file --------------------------------------------
# This file is gitignored and is the source of truth for "what is deployed
# right now on ${NETWORK}". Nothing off-chain may assume these ids are
# permanent (testnet resets ~2-4x/year).
cat > "${OUT}" <<EOF
{
  "network": "${NETWORK}",
  "networkPassphrase": "${PASSPHRASE}",
  "rpcUrl": "${RPC}",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployer": "${DEPLOYER_ADDR}",
  "external": {
    "usdcSacId": $(json_or_null "${USDC_SAC_ID}"),
    "reflectorFeedId": $(json_or_null "${REFLECTOR_FEED_ID}"),
    "adminAddress": $(json_or_null "${ADMIN_ADDRESS}")
  },
  "demo": {
    "chartGuessrMarket": $(json_or_null "${CHARTGUESSR_MARKET}"),
    "chartGuessrResolver": $(json_or_null "${CHARTGUESSR_RESOLVER}")
  },
  "contracts": {${CONTRACTS_JSON}
  }
}
EOF

echo
echo "OK: deployed ${N} contracts to ${NETWORK}; wrote ${OUT#${ROOT}/}"
if [[ -n "${CHARTGUESSR_MARKET}" ]]; then
  echo
  echo "ChartGuessr demo market: ${CHARTGUESSR_MARKET}"
  echo "  point the web app at it with:"
  echo "    export NEXT_PUBLIC_CHARTGUESSR_MARKET=${CHARTGUESSR_MARKET}"
  echo "  (or it's picked up automatically from ${OUT#${ROOT}/} \"demo.chartGuessrMarket\")"
fi
