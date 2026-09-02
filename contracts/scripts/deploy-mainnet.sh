#!/usr/bin/env bash
# Production entry point for deploying Kaido's DistributionMarket to Stellar mainnet.
#
# This intentionally delegates to deploy.sh so mainnet and testnet use the same
# build, upload, and deploy path.
# Never put a secret key in this file or commit it to the repository.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

: "${RPC_URL:?set RPC_URL to your Stellar mainnet RPC provider}"
: "${USDC_SAC_ID:?set USDC_SAC_ID to the production USDC SAC contract id}"
: "${REFLECTOR_FEED_ID:?set REFLECTOR_FEED_ID to the production Reflector feed contract id}"
: "${ADMIN_ADDRESS:?set ADMIN_ADDRESS to the production admin multisig}"
: "${DEPLOYER_KEY_NAME:?set DEPLOYER_KEY_NAME to an imported CLI key (recommended)}"

[[ "${KAIDO_DEMO:-0}" == "0" ]] || {
  echo "Refusing mainnet deployment while KAIDO_DEMO=1. Set KAIDO_DEMO=0." >&2
  exit 1
}

stellar keys address "${DEPLOYER_KEY_NAME}" >/dev/null || {
  echo "CLI key '${DEPLOYER_KEY_NAME}' is not available; import it before deploying." >&2
  exit 1
}

DEPLOYER_ADDRESS="$(stellar keys address "${DEPLOYER_KEY_NAME}")"
[[ "${ADMIN_ADDRESS}" != "${DEPLOYER_ADDRESS}" ]] || {
  echo "ADMIN_ADDRESS must not equal the deployer key on mainnet; use a multisig/dedicated admin." >&2
  exit 1
}

if [[ "${MAINNET_DEPLOY_CONFIRM:-}" != "I_UNDERSTAND_MAINNET_DEPLOY" ]]; then
  cat >&2 <<'EOF'
Mainnet deployment is irreversible and will spend XLM and publish contracts.
Review the production .env values, audited WASM, admin multisig, and RPC provider.
To continue, export:
  MAINNET_DEPLOY_CONFIRM=I_UNDERSTAND_MAINNET_DEPLOY
EOF
  exit 2
fi

export STELLAR_NETWORK=mainnet
export KAIDO_DEMO=0
export DEPLOYER_ADDRESS

exec "${ROOT}/contracts/scripts/deploy.sh" mainnet
