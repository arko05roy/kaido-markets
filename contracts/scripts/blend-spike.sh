#!/usr/bin/env bash
# BlendTap testnet spike (liquidity-plan §9.1):
#   1. Deploy `blend-adapter` (or reuse from config/networks.<net>.json)
#   2. Read live pool `get_status` + `available_depth` proxy via `get_reserve`
#   3. `authorize_market` + `borrow_for_market` + `repay_for_market` round-trip
#
# Uses real Blend pool + USDC SAC — no mocks.
#
#   ./contracts/scripts/blend-spike.sh testnet
set -euo pipefail

NETWORK="${1:-testnet}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACTS_DIR="${ROOT}/contracts"
OUT="${ROOT}/config/networks.${NETWORK}.json"

if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

: "${BLEND_POOL_ID:?set BLEND_POOL_ID in .env (see liquidity-plan.md §5.3)}"
BLEND_USDC_SAC_ID="${BLEND_USDC_SAC_ID:-CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU}"
SOURCE="${DEPLOYER_KEY_NAME:-kaido-wallet}"
ADMIN="${ADMIN_ADDRESS:-$(stellar keys address "${SOURCE}")}"

echo "network     : ${NETWORK}"
echo "blend pool  : ${BLEND_POOL_ID}"
echo "blend usdc  : ${BLEND_USDC_SAC_ID}"
echo "admin       : ${ADMIN}"
echo

# --- pool health ----------------------------------------------------------
echo "-- pool.get_status --"
STATUS="$(stellar contract invoke --id "${BLEND_POOL_ID}" --network "${NETWORK}" \
  --source "${SOURCE}" --send=no -- get_status 2>/dev/null || echo "?")"
echo "   status: ${STATUS}"
if [[ "${STATUS}" =~ ^[0-9]+$ ]] && [[ "${STATUS}" -gt 1 ]]; then
  echo "   pool status > 1 (On-Ice/Frozen) — borrows will fail (Blend error 1206)" >&2
fi

echo "-- pool.get_reserve (USDC) --"
stellar contract invoke --id "${BLEND_POOL_ID}" --network "${NETWORK}" \
  --source "${SOURCE}" --send=no -- get_reserve --asset "${BLEND_USDC_SAC_ID}" || true
echo

# --- adapter deploy -------------------------------------------------------
ADAPTER_ID=""
if [[ -f "${OUT}" ]]; then
  ADAPTER_ID="$(node -e "const j=require('${OUT}');process.stdout.write(j.contracts?.blendAdapter?.id||'')" 2>/dev/null || true)"
fi

if [[ -z "${ADAPTER_ID}" ]]; then
  echo "-- deploy blend-adapter --"
  ( cd "${CONTRACTS_DIR}" && unset CARGO_TARGET_DIR && cargo make build-wasm )
  WASM="${CONTRACTS_DIR}/target/wasm32v1-none/release/blend_adapter.wasm"
  HASH="$(stellar contract upload --wasm "${WASM}" --network "${NETWORK}" --source-account "${SOURCE}" | tail -1 | tr -d '[:space:]')"
  echo "   wasm hash: ${HASH}"
  ADAPTER_ID="$(stellar contract deploy --wasm-hash "${HASH}" --network "${NETWORK}" \
    --source-account "${SOURCE}" \
    -- --admin "${ADMIN}" --blend-pool "${BLEND_POOL_ID}" --usdc "${BLEND_USDC_SAC_ID}")"
  ADAPTER_ID="${ADAPTER_ID//\"/}"
  echo "   adapter  : ${ADAPTER_ID}"
else
  echo "-- reuse blend-adapter: ${ADAPTER_ID} --"
fi

# --- synthetic market address for auth ------------------------------------
SPIKE_KEY="blend-spike-market"
if ! stellar keys address "${SPIKE_KEY}" >/dev/null 2>&1; then
  echo "-- create spike market key --"
  stellar keys generate "${SPIKE_KEY}" --network "${NETWORK}" --fund
fi
MARKET="$(stellar keys address "${SPIKE_KEY}")"
BLEND_ASSET="$(stellar contract invoke --id "${BLEND_USDC_SAC_ID}" --network "${NETWORK}" \
  --source "${SOURCE}" --send=no -- name 2>/dev/null | tr -d '"')"
echo "spike market: ${MARKET}"

if [[ -n "${BLEND_ASSET}" ]]; then
  echo "-- change-trust ${BLEND_ASSET} (spike market + deployer) --"
  stellar tx new change-trust --source-account "${SPIKE_KEY}" --network "${NETWORK}" \
    --line "${BLEND_ASSET}" >/dev/null 2>&1 || true
  stellar tx new change-trust --source-account "${SOURCE}" --network "${NETWORK}" \
    --line "${BLEND_ASSET}" >/dev/null 2>&1 || true
fi

CAP_7DP="100000000000"   # 10k USDC @ 7dp
COLLATERAL_7DP="1000000000"  # 100 USDC
BORROW_7DP="500000000"       # 50 USDC (50% LTV)

echo "-- authorize_market --"
stellar contract invoke --id "${ADAPTER_ID}" --network "${NETWORK}" --source-account "${SOURCE}" \
  -- authorize_market --market "${MARKET}" --cap-7dp "${CAP_7DP}"

echo "-- available_depth --"
stellar contract invoke --id "${ADAPTER_ID}" --network "${NETWORK}" \
  --source "${SOURCE}" --send=no \
  -- available_depth --market "${MARKET}"

# Fund spike market with Blend USDC (must already exist — SAC admin is not the deployer).
echo "-- fund spike market with ${COLLATERAL_7DP} (7-dp) Blend USDC --"
BAL="$(stellar contract invoke --id "${BLEND_USDC_SAC_ID}" --network "${NETWORK}" \
  --source "${SOURCE}" --send=no -- balance --id "${MARKET}" 2>/dev/null | tr -d '"')"
if [[ "${BAL:-0}" -lt "${COLLATERAL_7DP}" ]]; then
  echo "   insufficient Blend USDC on ${MARKET} (have ${BAL:-0}, need ${COLLATERAL_7DP})" >&2
  echo "   acquire ${BLEND_ASSET} on testnet (Blend faucet / DEX) then re-run" >&2
  exit 1
fi

echo "-- transfer collateral -> adapter --"
stellar contract invoke --id "${BLEND_USDC_SAC_ID}" --network "${NETWORK}" --source-account "${SPIKE_KEY}" \
  -- transfer --from "${MARKET}" --to "${ADAPTER_ID}" --amount "${COLLATERAL_7DP}"

echo "-- borrow_for_market --"
BORROWED="$(stellar contract invoke --id "${ADAPTER_ID}" --network "${NETWORK}" --source-account "${SPIKE_KEY}" \
  -- borrow_for_market --market "${MARKET}" \
  --collateral-7dp "${COLLATERAL_7DP}" --borrow-7dp "${BORROW_7DP}")"
echo "   borrowed: ${BORROWED}"

echo "-- outstanding_debt --"
stellar contract invoke --id "${ADAPTER_ID}" --network "${NETWORK}" \
  --source "${SOURCE}" --send=no -- outstanding_debt --market "${MARKET}"

echo "-- repay round-trip --"
stellar contract invoke --id "${BLEND_USDC_SAC_ID}" --network "${NETWORK}" --source-account "${SPIKE_KEY}" \
  -- transfer --from "${MARKET}" --to "${ADAPTER_ID}" --amount "${BORROW_7DP}"
stellar contract invoke --id "${ADAPTER_ID}" --network "${NETWORK}" --source-account "${SPIKE_KEY}" \
  -- repay_for_market --market "${MARKET}" --amount-7dp "${BORROW_7DP}"

echo
echo "OK: BlendTap spike passed on ${NETWORK}"
echo "   adapter=${ADAPTER_ID}"
echo "   Add to .env: BLEND_POOL_ID=${BLEND_POOL_ID}"
echo "   For BlendTap markets set USDC_SAC_ID=${BLEND_USDC_SAC_ID} (must match pool reserve)"
