#!/usr/bin/env bash
# Re-seed test fixtures for a network (idempotent where the chain allows).
#
#   ./contracts/scripts/seed.sh <local|testnet|futurenet>
#
# BlendTap mode (BLEND_POOL_ID set at deploy):
#   blend-adapter.authorize_market on demo + lifecycle markets
#
# KAIDO demo mode (KAIDO_DEMO=1 at deploy):
#   protocol add_liquidity seed on demo + lifecycle markets (no Blend)
#
# Prerequisites: make deploy:<network> has already run.
set -euo pipefail

NETWORK="${1:-${STELLAR_NETWORK:-}}"
[[ -n "${NETWORK}" ]] || { echo "usage: $0 <local|testnet|futurenet>" >&2; exit 2; }
[[ "${NETWORK}" != "mainnet" ]] || { echo "refusing to seed fixtures on mainnet." >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG="${ROOT}/config/networks.json"
NET_FILE="${ROOT}/config/networks.${NETWORK}.json"

if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

[[ -f "${NET_FILE}" ]] || {
  echo "missing ${NET_FILE} — run make deploy:${NETWORK} first" >&2
  exit 1
}

read_cfg() { node -e "const c=require('${CONFIG}').networks['${NETWORK}']||{};process.stdout.write(String(c['$1']??''))"; }
PASSPHRASE="$(read_cfg networkPassphrase)"
RPC="${RPC_URL:-$(read_cfg rpcUrl)}"
[[ -n "${PASSPHRASE}" ]] || { echo "unknown network '${NETWORK}'" >&2; exit 2; }
[[ -n "${RPC}" ]] || { echo "no RPC url for '${NETWORK}'" >&2; exit 2; }

: "${REFLECTOR_FEED_ID:?set REFLECTOR_FEED_ID in .env}"
: "${REFLECTOR_ASSET_SYMBOL:=BTC}"

stellar network add "${NETWORK}" \
  --rpc-url "${RPC}" \
  --network-passphrase "${PASSPHRASE}" >/dev/null 2>&1 || true

if [[ -n "${DEPLOYER_SECRET_KEY:-}" ]]; then
  SOURCE="${DEPLOYER_SECRET_KEY}"
  DEPLOYER_ADDR="$(stellar keys public-key "${DEPLOYER_SECRET_KEY}" 2>/dev/null || true)"
else
  KEY_NAME="${DEPLOYER_KEY_NAME:-kaido-${NETWORK}-deployer}"
  if ! stellar keys address "${KEY_NAME}" >/dev/null 2>&1; then
    echo "deployer key '${KEY_NAME}' not found — run make deploy:${NETWORK} first" >&2
    exit 1
  fi
  SOURCE="${KEY_NAME}"
  DEPLOYER_ADDR="$(stellar keys address "${KEY_NAME}")"
fi
SOURCE_ARG=(--source-account "${SOURCE}")

eval "$(node -e "
const j=require('${NET_FILE}');
const c=j.contracts||{};
const f=j.fixtures||{};
const ext=j.external||{};
const lines=[
  'ID_BLEND_ADAPTER='+(c.blendAdapter?.id||''),
  'ID_MARKET_FACTORY='+(c.marketFactory?.id||''),
  'HASH_RESOLVER_REFLECTOR='+(c.resolverReflector?.wasmHash||''),
  'DEMO_MARKET='+(f.demoMarket||''),
  'DEMO_RESOLVER='+(f.demoResolver||''),
  'LIFECYCLE_MARKET='+(f.lifecycleMarket||''),
  'LIFECYCLE_RESOLVER='+(f.lifecycleResolver||''),
  'DEMO_MODE='+(ext.demoMode?'1':'0'),
  'SETTLEMENT_SAC='+(ext.usdcSacId||''),
];
for (const l of lines) console.log(l);
")"

[[ -n "${ID_MARKET_FACTORY}" ]] || { echo "marketFactory id missing in ${NET_FILE}" >&2; exit 1; }
[[ -n "${DEMO_MARKET}" ]] || { echo "fixtures.demoMarket missing — re-run make deploy:${NETWORK}" >&2; exit 1; }

WAD18="1000000000000000000"
B18="${DEMO_B_WAD:-100000000000000000000000}"
MU0_18="50000000000000000000"
if [[ "${DEMO_MODE}" != "1" ]]; then
  B18="100000000000000000000"
fi

echo "network       : ${NETWORK}"
echo "deployer      : ${DEPLOYER_ADDR}"
echo "demo market   : ${DEMO_MARKET}"
echo "demo mode     : ${DEMO_MODE}"
echo "blend adapter : ${ID_BLEND_ADAPTER:-<none>}"
echo

authorize_blend_market() {
  local market="$1"
  echo "-- blend-adapter.authorize_market (${market}) --"
  sleep 2
  for attempt in 1 2 3 4 5; do
    if stellar contract invoke --id "${ID_BLEND_ADAPTER}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
      -- authorize_market --market "${market}" --cap-7dp 100000000000 2>/dev/null; then
      return 0
    fi
    sleep 3
  done
  echo "   (authorize_market failed)" >&2
  return 1
}

seed_lp_market() {
  local market="$1"
  local lp_key="${KAIDO_TREASURY_KEY_NAME:-kaido-${NETWORK}-treasury}"
  local lp_addr
  lp_addr="$(stellar keys address "${lp_key}" 2>/dev/null || echo "${DEPLOYER_ADDR}")"
  local lp_source=(--source-account "${lp_key}")
  if [[ -n "${KAIDO_TREASURY_SECRET_KEY:-}" ]]; then
    lp_source=(--source-account "${KAIDO_TREASURY_SECRET_KEY}")
    lp_addr="$(stellar keys public-key "${KAIDO_TREASURY_SECRET_KEY}" 2>/dev/null || echo "${lp_addr}")"
  fi
  echo "-- add_liquidity protocol seed (${market}) lp=${lp_addr} --"
  sleep 2
  for attempt in 1 2 3 4 5; do
    if stellar contract invoke --id "${market}" --network "${NETWORK}" "${lp_source[@]}" \
      -- add_liquidity --lp "${lp_addr}" --scale-y "${WAD18}" 2>/dev/null; then
      return 0
    fi
    sleep 3
  done
  echo "   (add_liquidity failed)" >&2
  return 1
}

bootstrap_market() {
  local market="$1"
  if [[ -n "${ID_BLEND_ADAPTER}" ]]; then
    authorize_blend_market "${market}" || true
  else
    seed_lp_market "${market}" || true
  fi
}

bootstrap_market "${DEMO_MARKET}"

LIFECYCLE_LOCK_SEC="${LIFECYCLE_LOCK_SEC:-300}"
LIFECYCLE_RESOLVE_SEC="${LIFECYCLE_RESOLVE_SEC:-600}"

if [[ -z "${LIFECYCLE_MARKET}" || "${KAIDO_RESEED_LIFECYCLE:-}" == "1" ]]; then
  NOW="$(date +%s)"
  W_OPEN="${NOW}"
  W_LOCK="$(( NOW + LIFECYCLE_LOCK_SEC ))"
  W_RESOLVE="$(( NOW + LIFECYCLE_RESOLVE_SEC ))"

  echo "-- lifecycle resolver (resolve ${W_RESOLVE}) --"
  [[ -n "${HASH_RESOLVER_REFLECTOR}" ]] || { echo "resolverReflector wasmHash missing" >&2; exit 1; }
  LIFECYCLE_RESOLVER="$(stellar contract deploy \
    --wasm-hash "${HASH_RESOLVER_REFLECTOR}" \
    --network "${NETWORK}" "${SOURCE_ARG[@]}" \
    -- --oracle "${REFLECTOR_FEED_ID}" \
       --asset "{\"Other\":\"${REFLECTOR_ASSET_SYMBOL}\"}" \
       --resolve-time "${W_RESOLVE}" --twap-records 12 \
       --checkpoints '[]')"
  LIFECYCLE_RESOLVER="${LIFECYCLE_RESOLVER//\"/}"
  echo "   resolver : ${LIFECYCLE_RESOLVER}"

  echo "-- lifecycle market (lock +${LIFECYCLE_LOCK_SEC}s, resolve +${LIFECYCLE_RESOLVE_SEC}s) --"
  LIFECYCLE_MARKET="$(stellar contract invoke --id "${ID_MARKET_FACTORY}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
    -- create_market \
       --creator "${DEPLOYER_ADDR}" \
       --k "${WAD18}" --b "${B18}" --fee-bps 30 \
       --resolver "${LIFECYCLE_RESOLVER}" --tier 0 \
       --window-open "${W_OPEN}" --window-lock "${W_LOCK}" --window-resolve "${W_RESOLVE}" \
       --mu0 "${MU0_18}" --sigma0 "${WAD18}" --capped-flag 0)"
  LIFECYCLE_MARKET="${LIFECYCLE_MARKET//\"/}"
  echo "   market   : ${LIFECYCLE_MARKET}"

  bootstrap_market "${LIFECYCLE_MARKET}"
else
  echo "-- lifecycle fixture already present: ${LIFECYCLE_MARKET} --"
fi

node -e "
const fs=require('fs');
const path='${NET_FILE}';
const j=JSON.parse(fs.readFileSync(path,'utf8'));
j.fixtures={
  demoMarket:'${DEMO_MARKET}',
  demoResolver:'${DEMO_RESOLVER:-}',
  lifecycleMarket:'${LIFECYCLE_MARKET}',
  lifecycleResolver:'${LIFECYCLE_RESOLVER}',
};
j.seededAt=new Date().toISOString();
fs.writeFileSync(path, JSON.stringify(j, null, 2) + '\n');
"

WEB_OUT="${ROOT}/web/config/networks.${NETWORK}.json"
mkdir -p "$(dirname "${WEB_OUT}")"
cp "${NET_FILE}" "${WEB_OUT}"

echo
echo "OK: seeded fixtures on ${NETWORK}; updated ${NET_FILE#${ROOT}/}"
echo "  mirrored ${WEB_OUT#${ROOT}/}"
echo "  demo market      : ${DEMO_MARKET}"
echo "  lifecycle market : ${LIFECYCLE_MARKET}"
echo "  export NEXT_PUBLIC_KAIDO_DEMO_MARKET=${DEMO_MARKET}"
echo "  export NEXT_PUBLIC_KAIDO_LIFECYCLE_MARKET=${LIFECYCLE_MARKET}"
