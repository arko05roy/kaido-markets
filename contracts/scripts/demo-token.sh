#!/usr/bin/env bash
# Issue KAIDO demo token + deploy its SAC for hackathon mode (KAIDO_DEMO=1).
# Mint a huge supply to the deployer; markets use this SAC as settlement asset.
#
# ponytail: issuer = deployer; SAC cannot mint to issuer — treasury key holds balances.
# Mainnet path: swap settlement to native XLM SAC + GMX-style LP vault (out of scope here).
set -euo pipefail

NETWORK="${1:-${STELLAR_NETWORK:-testnet}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

CONFIG="${ROOT}/config/networks.json"
read_cfg() { node -e "const c=require('${CONFIG}').networks['${NETWORK}']||{};process.stdout.write(String(c['$1']??''))"; }
PASSPHRASE="$(read_cfg networkPassphrase)"
RPC="${RPC_URL:-$(read_cfg rpcUrl)}"

stellar network add "${NETWORK}" \
  --rpc-url "${RPC}" \
  --network-passphrase "${PASSPHRASE}" >/dev/null 2>&1 || true

if [[ -n "${DEPLOYER_SECRET_KEY:-}" ]]; then
  SOURCE="${DEPLOYER_SECRET_KEY}"
  DEPLOYER_ADDR="$(stellar keys public-key "${DEPLOYER_SECRET_KEY}" 2>/dev/null || true)"
else
  KEY_NAME="${DEPLOYER_KEY_NAME:-kaido-${NETWORK}-deployer}"
  SOURCE="${KEY_NAME}"
  DEPLOYER_ADDR="$(stellar keys address "${KEY_NAME}")"
fi
SOURCE_ARG=(--source-account "${SOURCE}")

TREASURY_KEY="${KAIDO_TREASURY_KEY_NAME:-kaido-${NETWORK}-treasury}"
if ! stellar keys address "${TREASURY_KEY}" >/dev/null 2>&1; then
  echo "   creating treasury key ${TREASURY_KEY}..." >&2
  [[ "${NETWORK}" == "mainnet" ]] && { echo "refusing to auto-create treasury on mainnet" >&2; exit 1; }
  stellar keys generate "${TREASURY_KEY}" --network "${NETWORK}" --fund
fi
TREASURY_ADDR="$(stellar keys address "${TREASURY_KEY}")"
TREASURY_SOURCE=(--source-account "${TREASURY_KEY}")

ASSET_CODE="${KAIDO_ASSET_CODE:-KAIDO}"
ASSET="${ASSET_CODE}:${DEPLOYER_ADDR}"
MINT_AMOUNT="${KAIDO_SAC_MINT_7DP:-10000000000000000}" # 1M KAIDO at 7dp

echo "-- demo token: ${ASSET} on ${NETWORK} --" >&2
echo "   issuer   : ${DEPLOYER_ADDR}" >&2
echo "   treasury : ${TREASURY_ADDR}" >&2

NET_FILE="${ROOT}/config/networks.${NETWORK}.json"
if [[ -f "${NET_FILE}" ]]; then
  EXISTING="$(node -e "
    const j=require('${NET_FILE}');
    process.stdout.write(j.external?.usdcSacId && j.external?.demoMode ? j.external.usdcSacId : '');
  " 2>/dev/null || true)"
  if [[ -n "${EXISTING}" ]]; then
    echo "   reusing SAC: ${EXISTING}" >&2
    echo "${EXISTING}"
    exit 0
  fi
fi

SAC_ID=""
for attempt in 1 2 3 4 5; do
  if SAC_ID="$(stellar contract id asset --asset "${ASSET}" --network "${NETWORK}" 2>/dev/null)"; then
    SAC_ID="${SAC_ID//\"/}"
    if stellar contract invoke --id "${SAC_ID}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no -- admin >/dev/null 2>&1; then
      break
    fi
    SAC_ID=""
  fi
  sleep 2
done

if [[ -z "${SAC_ID}" ]]; then
  echo "   deploying SAC for ${ASSET}..." >&2
  for attempt in 1 2 3 4 5; do
    if stellar contract asset deploy --asset "${ASSET}" --network "${NETWORK}" "${SOURCE_ARG[@]}"; then
      break
    fi
    sleep 3
  done
  SAC_ID="$(stellar contract id asset --asset "${ASSET}" --network "${NETWORK}")"
  SAC_ID="${SAC_ID//\"/}"
fi

echo "   SAC id   : ${SAC_ID}" >&2

# Treasury trustline + issuer SAC mint (issuer cannot hold its own SAC balance).
echo "   SAC trust + mint ${MINT_AMOUNT} stroops to treasury..." >&2
for attempt in 1 2 3 4 5; do
  if stellar contract invoke --id "${SAC_ID}" --network "${NETWORK}" "${TREASURY_SOURCE[@]}" \
    -- trust --addr "${TREASURY_ADDR}" 2>/dev/null; then
    break
  fi
  sleep 2
done
for attempt in 1 2 3 4 5; do
  if stellar contract invoke --id "${SAC_ID}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
    -- mint --to "${TREASURY_ADDR}" --amount "${MINT_AMOUNT}" 2>/dev/null; then
    break
  fi
  sleep 2
done

echo "${SAC_ID}"
