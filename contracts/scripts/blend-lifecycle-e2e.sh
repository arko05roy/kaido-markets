#!/usr/bin/env bash
# BlendTap full lifecycle on testnet: create short-window market → authorize →
# trade (JIT borrow) → wait → resolve → claim → verify Blend debt unwound.
#
#   ./contracts/scripts/blend-lifecycle-e2e.sh [testnet]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NET="${1:-testnet}"
CONFIG="${ROOT}/config/networks.${NET}.json"
SOURCE="${DEPLOYER_KEY_NAME:-kaido-wallet}"
TRADER="$(stellar keys address "${SOURCE}")"

if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

read_cfg() {
  node -e "const j=require('${CONFIG}'); const k='$1'; console.log(k.split('.').reduce((o,x)=>o?.[x], j) ?? '')"
}

FACTORY="$(read_cfg contracts.marketFactory.id)"
ADAPTER="$(read_cfg contracts.blendAdapter.id)"
REGISTRY="$(read_cfg contracts.registry.id)"
REFLECTOR_WASM="$(read_cfg contracts.resolverReflector.wasmHash)"
REFLECTOR_FEED="${REFLECTOR_FEED_ID:-$(read_cfg external.reflectorFeedId)}"
USDC="$(read_cfg external.usdcSacId)"
ASSET="${REFLECTOR_ASSET_SYMBOL:-BTC}"

[[ -n "${FACTORY}" && -n "${ADAPTER}" && -n "${REFLECTOR_WASM}" ]] || {
  echo "missing deploy ids in ${CONFIG} — run make deploy:${NET} first" >&2
  exit 1
}

WAD18=1000000000000000000
B18=100000000000000000000
MU0_18=50000000000000000000
LOCK_SEC="${LIFECYCLE_LOCK_SEC:-90}"
RESOLVE_SEC="${LIFECYCLE_RESOLVE_SEC:-150}"
NOW="$(date +%s)"
W_OPEN="${NOW}"
W_LOCK="$(( NOW + LOCK_SEC ))"
W_RESOLVE="$(( NOW + RESOLVE_SEC ))"

echo "=== BlendTap lifecycle E2E (${NET}) ==="
echo "trader   : ${TRADER}"
echo "windows  : open=${W_OPEN} lock=${W_LOCK} resolve=${W_RESOLVE}"
echo

echo "-- deploy short-window resolver (resolve ${W_RESOLVE}) --"
RESOLVER="$(stellar contract deploy --wasm-hash "${REFLECTOR_WASM}" --network "${NET}" --source-account "${SOURCE}" \
  -- --oracle "${REFLECTOR_FEED}" \
     --asset "{\"Other\":\"${ASSET}\"}" \
     --resolve-time "${W_RESOLVE}" --twap-records 12 \
     --checkpoints '[]')"
RESOLVER="${RESOLVER//\"/}"
echo "   resolver: ${RESOLVER}"

echo "-- factory.create_market --"
sleep 2
MARKET=""
for attempt in 1 2 3 4 5 6; do
  if MKT="$(stellar contract invoke --id "${FACTORY}" --network "${NET}" --source-account "${SOURCE}" \
    -- create_market \
      --creator "${TRADER}" \
      --k "${WAD18}" --b "${B18}" --fee-bps 30 \
      --resolver "${RESOLVER}" --tier 0 \
      --window-open "${W_OPEN}" --window-lock "${W_LOCK}" --window-resolve "${W_RESOLVE}" \
      --mu0 "${MU0_18}" --sigma0 "${WAD18}" --capped-flag 0 2>/dev/null)"; then
    MARKET="${MKT//\"/}"
    break
  fi
  sleep 3
done
[[ -n "${MARKET}" ]] || { echo "create_market failed after retries" >&2; exit 1; }
echo "   market  : ${MARKET}"

echo "-- authorize_market --"
for attempt in 1 2 3 4 5 6; do
  if stellar contract invoke --id "${ADAPTER}" --network "${NET}" --source-account "${SOURCE}" \
    -- authorize_market --market "${MARKET}" --cap-7dp 100000000000 2>/dev/null; then
    break
  fi
  sleep 3
done

echo "-- trade (JIT borrow) --"
MU2=55000000000000000000
SIGMA2=2000000000000000000
MAX_COL=20000000
POS="$(stellar contract invoke --id "${MARKET}" --network "${NET}" --source-account "${SOURCE}" \
  -- trade --trader "${TRADER}" --mu2 "${MU2}" --sigma2 "${SIGMA2}" --max-collateral-7dp "${MAX_COL}")"
POS="${POS//\"/}"
echo "   position: ${POS}"

DEBT="$(stellar contract invoke --id "${ADAPTER}" --network "${NET}" --source-account "${SOURCE}" --send=no \
  -- outstanding_debt --market "${MARKET}" | tr -d '"')"
echo "   outstanding_debt after trade: ${DEBT}"
[[ "${DEBT}" -gt 0 ]] || { echo "expected debt after JIT borrow" >&2; exit 1; }

WAIT="$(( W_RESOLVE - $(date +%s) + 5 ))"
echo "-- waiting ${WAIT}s for resolve window --"
sleep "${WAIT}"

echo "-- resolve --"
stellar contract invoke --id "${MARKET}" --network "${NET}" --source-account "${SOURCE}" -- resolve

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  STATE="$(stellar contract invoke --id "${MARKET}" --network "${NET}" --source-account "${SOURCE}" --send=no -- get_state)"
  if echo "${STATE}" | grep -q '"Resolved"'; then
    break
  fi
  sleep 3
done
echo "   state: ${STATE}"
echo "${STATE}" | grep -q '"Resolved"' || {
  echo "market not resolved after retries" >&2
  exit 1
}

echo "-- claim position ${POS} --"
PAYOUT="$(stellar contract invoke --id "${MARKET}" --network "${NET}" --source-account "${SOURCE}" \
  -- claim --position-id "${POS}" | tr -d '"')"
echo "   payout (7dp): ${PAYOUT}"

DEBT_AFTER="$(stellar contract invoke --id "${ADAPTER}" --network "${NET}" --source-account "${SOURCE}" --send=no \
  -- outstanding_debt --market "${MARKET}" | tr -d '"')"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [[ "${DEBT_AFTER}" == "0" ]] && break
  sleep 3
  DEBT_AFTER="$(stellar contract invoke --id "${ADAPTER}" --network "${NET}" --source-account "${SOURCE}" --send=no \
    -- outstanding_debt --market "${MARKET}" | tr -d '"')"
done
echo "-- outstanding_debt after claim: ${DEBT_AFTER} --"
[[ "${DEBT_AFTER}" == "0" ]] || { echo "expected debt cleared after claim unwind" >&2; exit 1; }

echo
echo "OK: BlendTap lifecycle E2E passed (trade → borrow → resolve → claim → unwind)"
