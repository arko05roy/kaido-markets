#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COUNT="${1:-15}"
PREFIX="${DEMO_WALLET_PREFIX:-kaido-demo-wallet}"
NETWORK="${STELLAR_NETWORK:-testnet}"
RUNNER="${ROOT}/web/scripts/generate-demo-wallets.mjs"
CONFIG="${ROOT}/web/config/networks.${NETWORK}.json"
MIN_OPEN_WINDOW_SEC="${DEMO_MIN_OPEN_WINDOW_SEC:-1200}"
RESEED_LOCK_SEC="${DEMO_LIFECYCLE_LOCK_SEC:-1800}"
RESEED_RESOLVE_SEC="${DEMO_LIFECYCLE_RESOLVE_SEC:-3600}"

[[ "${COUNT}" =~ ^[0-9]+$ ]] && (( COUNT >= 15 )) || {
  echo "count must be an integer >= 15" >&2
  exit 2
}

command -v stellar >/dev/null || { echo "stellar CLI is required" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
[[ -f "${RUNNER}" ]] || { echo "missing runner: ${RUNNER}" >&2; exit 1; }

if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

read_cfg() {
  node -e "const j=require('${CONFIG}'); const k='${1}'; process.stdout.write(String(k.split('.').reduce((o,x)=>o?.[x], j) ?? ''))"
}

market_state() {
  stellar contract invoke \
    --id "$1" \
    --network "${NETWORK}" \
    --source-account "${DEPLOYER_KEY_NAME:-kaido-wallet}" \
    --send=no \
    -- get_state 2>/dev/null || true
}

market_is_open() {
  [[ "$(market_state "$1")" == *'"Open"'* ]]
}

market_lock_time() {
  stellar contract invoke \
    --id "$1" \
    --network "${NETWORK}" \
    --source-account "${DEPLOYER_KEY_NAME:-kaido-wallet}" \
    --send=no \
    -- get_params 2>/dev/null |
    node -e 'const fs=require("fs"); const raw=fs.readFileSync(0,"utf8").trim(); if (!raw) process.exit(1); const j=JSON.parse(raw); process.stdout.write(String(j.window?.lock ?? ""));'
}

market_needs_refresh() {
  local market="$1"
  local lock_ts now
  market_is_open "${market}" || return 0
  lock_ts="$(market_lock_time "${market}")"
  now="$(date +%s)"
  [[ -z "${lock_ts}" ]] && return 0
  (( lock_ts - now < MIN_OPEN_WINDOW_SEC ))
}

MARKET_ID="${DEMO_MARKET_ID:-$(read_cfg fixtures.lifecycleMarket)}"
if [[ -z "${MARKET_ID}" ]] || market_needs_refresh "${MARKET_ID}"; then
  echo "Refreshing lifecycle fixture on ${NETWORK} to get an open market window..."
  KAIDO_RESEED_LIFECYCLE=1 \
  LIFECYCLE_LOCK_SEC="${RESEED_LOCK_SEC}" \
  LIFECYCLE_RESOLVE_SEC="${RESEED_RESOLVE_SEC}" \
  "${ROOT}/contracts/scripts/seed.sh" "${NETWORK}"
  MARKET_ID="$(read_cfg fixtures.lifecycleMarket)"
fi

market_is_open "${MARKET_ID}" || {
  echo "market ${MARKET_ID} is not open on ${NETWORK}" >&2
  exit 1
}

for i in $(seq 1 "${COUNT}"); do
  key="${PREFIX}-${i}"
  if ! stellar keys address "${key}" >/dev/null 2>&1; then
    echo "Creating ${key}..."
    stellar keys generate "${key}"
  else
    echo "Reusing ${key}..."
  fi
done

if market_needs_refresh "${MARKET_ID}"; then
  echo "Refreshing lifecycle fixture again before trade batch..."
  KAIDO_RESEED_LIFECYCLE=1 \
  LIFECYCLE_LOCK_SEC="${RESEED_LOCK_SEC}" \
  LIFECYCLE_RESOLVE_SEC="${RESEED_RESOLVE_SEC}" \
  "${ROOT}/contracts/scripts/seed.sh" "${NETWORK}"
  MARKET_ID="$(read_cfg fixtures.lifecycleMarket)"
fi

DEMO_MARKET_ID="${MARKET_ID}" \
DEMO_WALLET_PREFIX="${PREFIX}" \
STELLAR_NETWORK="${NETWORK}" \
node "${RUNNER}" "${COUNT}"
