#!/usr/bin/env bash
# End-to-end BlendTap test on testnet (no mocks):
#   verify market is Open + blend_backed_depth > 0
#   trade() triggers JIT borrow
#   check adapter outstanding_debt > 0 after trade
#
#   ./contracts/scripts/blend-e2e.sh [market_id]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NET="${1:-testnet}"
MARKET_OVERRIDE="${2:-}"

if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

CONFIG="${ROOT}/config/networks.${NET}.json"
SOURCE="${DEPLOYER_KEY_NAME:-kaido-wallet}"
TRADER="$(stellar keys address "${SOURCE}")"

read_cfg() {
  node -e "const j=require('${CONFIG}'); const k='$1'; console.log(k.split('.').reduce((o,x)=>o?.[x], j) ?? '')"
}

MARKET="${MARKET_OVERRIDE:-$(read_cfg fixtures.demoMarket)}"
ADAPTER="$(read_cfg contracts.blendAdapter.id)"
USDC="$(read_cfg external.usdcSacId)"
[[ -n "${USDC}" ]] || USDC="${USDC_SAC_ID:-}"

[[ -n "${MARKET}" ]] || { echo "no market id; pass as arg or deploy first" >&2; exit 1; }
[[ -n "${ADAPTER}" ]] || { echo "no blendAdapter in ${CONFIG}" >&2; exit 1; }

echo "=== BlendTap E2E on ${NET} ==="
echo "trader   : ${TRADER}"
echo "market   : ${MARKET}"
echo "adapter  : ${ADAPTER}"
echo "usdc sac : ${USDC}"
echo

echo "-- market.get_state --"
STATE="$(stellar contract invoke --id "${MARKET}" --network "${NET}" --source "${SOURCE}" --send=no -- get_state)"
echo "${STATE}"
echo "${STATE}" | grep -q '"Open"' || { echo "market not Open — cannot trade" >&2; exit 1; }

echo "-- market.blend_backed_depth --"
DEPTH="$(stellar contract invoke --id "${MARKET}" --network "${NET}" --source "${SOURCE}" --send=no -- blend_backed_depth)"
echo "${DEPTH}"
[[ "${DEPTH//\"/}" -gt 0 ]] || { echo "blend_backed_depth is 0" >&2; exit 1; }

BAL_BEFORE="$(stellar contract invoke --id "${USDC}" --network "${NET}" --source "${SOURCE}" --send=no -- balance --id "${TRADER}" | tr -d '"')"
echo "-- trader USDC before: ${BAL_BEFORE} --"

# μ₂=55 WAD, σ₂=2 WAD, max collateral 3 USDC (room for fees on ~16 USDC wallet)
MU2=50000000000000000000
SIGMA2=2000000000000000000
MAX_COL=30000000

echo "-- market.trade (JIT borrow on first trade) --"
POS="$(stellar contract invoke --id "${MARKET}" --network "${NET}" --source-account "${SOURCE}" \
  -- trade --trader "${TRADER}" --mu2 "${MU2}" --sigma2 "${SIGMA2}" --max-collateral-7dp "${MAX_COL}")"
POS="${POS//\"/}"
echo "   position_id: ${POS}"

DEBT="$(stellar contract invoke --id "${ADAPTER}" --network "${NET}" --source "${SOURCE}" --send=no \
  -- outstanding_debt --market "${MARKET}" | tr -d '"')"
echo "-- adapter.outstanding_debt: ${DEBT} --"
[[ "${DEBT}" -gt 0 ]] || { echo "expected outstanding debt after JIT borrow" >&2; exit 1; }

BAL_AFTER="$(stellar contract invoke --id "${USDC}" --network "${NET}" --source "${SOURCE}" --send=no -- balance --id "${TRADER}" | tr -d '"')"
echo "-- trader USDC after: ${BAL_AFTER} --"

echo
echo "OK: BlendTap E2E passed (trade + JIT borrow on live testnet)"
