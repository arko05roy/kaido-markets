#!/usr/bin/env bash
# Scripted, idempotent deploy of the whole Kaido contract suite to one network.
#
#   ./contracts/scripts/deploy.sh <local|testnet|futurenet|mainnet>
#
# Design rules (build.md §0a):
#   * idempotent — re-running re-installs/re-deploys the whole suite and
#     rewrites config/networks.<network>.json (the "live ids" file, gitignored);
#   * never hardcodes per-network ids — USDC SAC, Reflector feed, admin
#     multisig, Launchtube are read from .env / config and stored in the
#     contracts' own config at deploy time;
#   * the *exact* same script is used for testnet and the mainnet dry-run.
#
# Sprint 0: this is a scaffold. It validates inputs, loads network config, and
# exits with a clear "not yet implemented" message. The real install/deploy
# steps (factory WASM hash install, deploy, registry wiring, house-vault seed)
# land in Sprints 2–3 (see build.md §5).
set -euo pipefail

NETWORK="${1:-${STELLAR_NETWORK:-}}"
if [[ -z "${NETWORK}" ]]; then
  echo "usage: $0 <local|testnet|futurenet|mainnet>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG="${ROOT}/config/networks.json"

# Load .env if present (never committed).
if [[ -f "${ROOT}/.env" ]]; then
  set -a; # shellcheck disable=SC1091
  source "${ROOT}/.env"; set +a
fi

# Pull static params for this network out of config/networks.json.
read_cfg() { node -e "const c=require('${CONFIG}').networks['${NETWORK}']||{};process.stdout.write(String(c['$1']??''))"; }
PASSPHRASE="$(read_cfg networkPassphrase)"
RPC="${RPC_URL:-$(read_cfg rpcUrl)}"

if [[ -z "${PASSPHRASE}" ]]; then
  echo "unknown network '${NETWORK}' (not in ${CONFIG})" >&2
  exit 2
fi
if [[ -z "${RPC}" ]]; then
  echo "no RPC url for '${NETWORK}'. Set RPC_URL in .env (mainnet needs a third-party provider)." >&2
  exit 2
fi

# Per-network values that must be resolved (never hardcoded). On mainnet all
# four are mandatory; on local/testnet some can be auto-derived (a freshly
# deployed mock USDC SAC, a Friendbot-funded deployer) by later versions of
# this script.
: "${USDC_SAC_ID:=}"
: "${REFLECTOR_FEED_ID:=}"
: "${ADMIN_ADDRESS:=}"
: "${DEPLOYER_SECRET_KEY:=}"

echo "network        : ${NETWORK}"
echo "passphrase     : ${PASSPHRASE}"
echo "rpc            : ${RPC}"
echo "usdc sac id    : ${USDC_SAC_ID:-<unset — resolve before deploy>}"
echo "reflector feed : ${REFLECTOR_FEED_ID:-<unset — see Reflector /oracles tab>}"
echo "admin          : ${ADMIN_ADDRESS:-<unset — multisig on mainnet>}"

if [[ "${NETWORK}" == "mainnet" ]]; then
  : "${USDC_SAC_ID:?mainnet deploy requires USDC_SAC_ID}"
  : "${REFLECTOR_FEED_ID:?mainnet deploy requires REFLECTOR_FEED_ID}"
  : "${ADMIN_ADDRESS:?mainnet deploy requires ADMIN_ADDRESS (multisig)}"
  echo "refusing to proceed: mainnet deploy is gated on the audit + legal opinion (build.md Sprint 8)." >&2
  exit 1
fi

echo
echo "deploy.sh is a Sprint-0 scaffold — contract install/deploy lands in Sprints 2–3." >&2
echo "Nothing was deployed." >&2
exit 0
