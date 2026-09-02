#!/usr/bin/env bash
# Deploy only Kaido's production DistributionMarket Soroban contract.
# Contract initialization is a separate, explicit action: do not create demo
# markets or substitute testnet values on mainnet.
set -euo pipefail

NETWORK="${1:-${STELLAR_NETWORK:-}}"
[[ -n "${NETWORK}" ]] || { echo "usage: $0 <network>" >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

: "${RPC_URL:?set RPC_URL for the target Stellar network}"
: "${DEPLOYER_KEY_NAME:?set DEPLOYER_KEY_NAME to an imported Stellar CLI key}"

if [[ "${NETWORK}" == "mainnet" ]]; then
  [[ "${MAINNET_DEPLOY_CONFIRM:-}" == "I_UNDERSTAND_MAINNET_DEPLOY" ]] || {
    echo "Set MAINNET_DEPLOY_CONFIRM=I_UNDERSTAND_MAINNET_DEPLOY after reviewing the release." >&2
    exit 2
  }
fi

case "${NETWORK}" in
  mainnet) PASSPHRASE="Public Global Stellar Network ; September 2015" ;;
  testnet) PASSPHRASE="Test SDF Network ; September 2015" ;;
  futurenet) PASSPHRASE="Test SDF Future Network ; October 2022" ;;
  *) echo "Unsupported network: ${NETWORK}" >&2; exit 2 ;;
esac

stellar network add "${NETWORK}" --rpc-url "${RPC_URL}" --network-passphrase "${PASSPHRASE}" >/dev/null 2>&1 || true
(cd "${ROOT}/contracts" && cargo make build-wasm)

WASM="${ROOT}/contracts/target/wasm32v1-none/release/distribution_market.wasm"
[[ -s "${WASM}" ]] || { echo "missing built WASM: ${WASM}" >&2; exit 1; }
HASH="$(stellar contract upload --wasm "${WASM}" --network "${NETWORK}" --source-account "${DEPLOYER_KEY_NAME}")"
CONTRACT_ID="$(stellar contract deploy --wasm-hash "${HASH//\"/}" --network "${NETWORK}" --source-account "${DEPLOYER_KEY_NAME}")"

printf 'network=%s\nwasm_hash=%s\ncontract_id=%s\n' "${NETWORK}" "${HASH//\"/}" "${CONTRACT_ID//\"/}"
