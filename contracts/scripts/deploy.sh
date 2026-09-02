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
: "${USDC_SAC_ID:=}"
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

# --- build wasm ----------------------------------------------------------
( cd "${CONTRACTS_DIR}" && cargo make build-wasm )
WASM_DIR="${CONTRACTS_DIR}/target/wasm32v1-none/release"

# Contracts to deploy. Keep in sync with contracts/contracts/*.
CONTRACTS="market-factory distribution-market house-vault registry resolver-reflector resolver-attested resolver-optimistic resolver-designated"

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
  # All contracts deploy with no constructor args; `distribution-market` has an
  # explicit `init(params, mu0, sigma0)` invoked below.
  id="$(stellar contract deploy --wasm-hash "${hash}" --network "${NETWORK}" "${SOURCE_ARG[@]}")"
  echo "   contract  : ${id}"
  key="$(to_camel "${c}")"
  [[ -n "${CONTRACTS_JSON}" ]] && CONTRACTS_JSON="${CONTRACTS_JSON},"
  CONTRACTS_JSON="${CONTRACTS_JSON}
    \"${key}\": { \"id\": \"${id}\", \"wasmHash\": \"${hash}\" }"
  # Remember each id under its snake_case name for the steps below.
  eval "ID_$(echo "${c}" | tr '-' '_')=${id}"
  N=$(( N + 1 ))
done

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
        --mu0 "${MU0_18}" --sigma0 "${WAD18}"; then
  echo "   get_params ->"
  stellar contract invoke --id "${ID_distribution_market}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no \
    -- get_params || true
  echo "   get_state  ->"
  stellar contract invoke --id "${ID_distribution_market}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no \
    -- get_state || true
else
  echo "   (init invoke failed — the contract is deployed; re-run init manually with the same args)" >&2
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
  "contracts": {${CONTRACTS_JSON}
  }
}
EOF

echo
echo "OK: deployed ${N} contracts to ${NETWORK}; wrote ${OUT#${ROOT}/}"
