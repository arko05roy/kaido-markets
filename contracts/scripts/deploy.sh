#!/usr/bin/env bash
# Scripted, idempotent deploy of the whole Kaido contract suite to one network.
#
#   ./contracts/scripts/deploy.sh <local|testnet|futurenet|mainnet>
#
# Design rules (build.md §0a):
#   * requires stellar-cli >= 27 (fee-bump for large WASM deploy/invoke fees)
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
# Factory WASM-hash install and registry wiring land in Sprints 2–3.
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
# Hackathon demo: KAIDO_DEMO=1 mints a demo token and skips BlendTap (see demo-token.sh).
KAIDO_DEMO="${KAIDO_DEMO:-0}"
# BlendTap spine (liquidity-plan §5.3). Cleared when KAIDO_DEMO=1.
BLEND_POOL_ID="${BLEND_POOL_ID:-}"

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

if [[ "${KAIDO_DEMO}" == "1" ]]; then
  BLEND_POOL_ID=""
  echo "-- KAIDO_DEMO=1: minting demo token, skipping BlendTap --"
  USDC_SAC_ID="$( "${ROOT}/contracts/scripts/demo-token.sh" "${NETWORK}" | tail -1 | tr -d '[:space:]')"
  KAIDO_ISSUER="${DEPLOYER_ADDR}"
  SETTLEMENT_SYMBOL="${KAIDO_ASSET_CODE:-KAIDO}"
  DEMO_MODE_JSON="true"
  B18="${DEMO_B_WAD:-100000000000000000000000}" # 10k * 1e18
else
  : "${USDC_SAC_ID:?set USDC_SAC_ID (the USDC Stellar Asset Contract id for ${STELLAR_NETWORK:-this network}); see .env.example}"
  KAIDO_ISSUER=""
  SETTLEMENT_SYMBOL="USDC"
  DEMO_MODE_JSON="false"
  B18="100000000000000000000" # 100 * 1e18
fi
BLEND_USDC_SAC_ID="${BLEND_USDC_SAC_ID:-${USDC_SAC_ID}}"
if [[ -n "${BLEND_POOL_ID}" && "${BLEND_USDC_SAC_ID}" != "${USDC_SAC_ID}" ]]; then
  echo "warning: BLEND_USDC_SAC_ID != USDC_SAC_ID — BlendTap markets need the same SAC as the pool reserve." >&2
fi
# Optional Reflector feed + asset for the T0 resolver constructor; if unset we
# point the demo resolver at a placeholder so the deploy still completes.
: "${REFLECTOR_FEED_ID:=${USDC_SAC_ID}}"
: "${REFLECTOR_ASSET_SYMBOL:=BTC}"
: "${REFLECTOR_FEED_ID:=}"
: "${ADMIN_ADDRESS:=}"

echo "network        : ${NETWORK}"
echo "rpc            : ${RPC}"
echo "passphrase     : ${PASSPHRASE}"
echo "deployer       : ${DEPLOYER_ADDR} ${DEPLOYER_DESC}"
echo "settlement   : ${SETTLEMENT_SYMBOL} ${USDC_SAC_ID:-<unset>}"
echo "demo mode    : ${DEMO_MODE_JSON}"
echo "reflector feed : ${REFLECTOR_FEED_ID:-<unset — see Reflector /oracles tab>}"
echo "admin          : ${ADMIN_ADDRESS:-<unset>}"
echo

# Admin for the registry / factory / blend-adapter (a multisig on mainnet —
# resolved from .env, never hardcoded; falls back to the deployer on non-mainnet).
ADMIN="${ADMIN_ADDRESS:-${DEPLOYER_ADDR}}"

# --- build wasm ----------------------------------------------------------
( cd "${CONTRACTS_DIR}" && cargo make build-wasm )
WASM_DIR="${CONTRACTS_DIR}/target/wasm32v1-none/release"

# Deploy order: distribution-market WASM hash → blend-adapter + resolvers →
# registry (placeholder factory) → market-factory → registry.set_factory.
CONTRACTS="distribution-market blend-adapter resolver-reflector resolver-attested resolver-optimistic resolver-designated registry market-factory"

# kebab-case -> camelCase, portably (no GNU sed).
to_camel() { awk 'BEGIN{FS="-"}{out=$1;for(i=2;i<=NF;i++)out=out toupper(substr($i,1,1)) substr($i,2);print out}' <<<"$1"; }

CONTRACTS_JSON=""
N=0
for c in ${CONTRACTS}; do
  if [[ "${c}" == "blend-adapter" && -z "${BLEND_POOL_ID}" ]]; then
    echo "-- blend-adapter (skipped — set BLEND_POOL_ID in .env) --"
    continue
  fi
  wasm="${WASM_DIR}/$(echo "${c}" | tr '-' '_').wasm"
  [[ -f "${wasm}" ]] || { echo "missing ${wasm}" >&2; exit 1; }

  echo "-- ${c} --------------------------------"
  hash=""
  for attempt in 1 2 3 4 5 6; do
    if hash="$(stellar contract upload --wasm "${wasm}" --network "${NETWORK}" "${SOURCE_ARG[@]}" 2>/dev/null)"; then
      hash="${hash//\"/}"
      break
    fi
    sleep 3
  done
  [[ -n "${hash}" ]] || { echo "   upload failed after retries (${c})" >&2; exit 1; }
  echo "   wasm hash : ${hash}"
  eval "HASH_$(echo "${c}" | tr '-' '_')=${hash}"
  # `resolver-reflector` / `registry` / `market-factory` have `__constructor`s.
  CTOR_ARGS=()
  case "${c}" in
    resolver-reflector)
      # demo resolver (scalar mode): resolve_time = now+2h, 12-record TWAP,
      # no checkpoints. A second, trajectory-mode resolver is deployed below
      # for trajectory markets created via the factory.
      CTOR_ARGS=(-- --oracle "${REFLECTOR_FEED_ID}" \
        --asset "{\"Other\":\"${REFLECTOR_ASSET_SYMBOL}\"}" \
        --resolve-time "$(( $(date +%s) + 7200 ))" --twap-records 12 \
        --checkpoints '[]')
      ;;
    registry)
      # placeholder factory = admin; rewired to the real factory id below.
      CTOR_ARGS=(-- --admin "${ADMIN}" --factory "${ADMIN}")
      ;;
    blend-adapter)
      CTOR_ARGS=(-- --admin "${ADMIN}" \
        --blend-pool "${BLEND_POOL_ID}" --usdc "${BLEND_USDC_SAC_ID}")
      ;;
    market-factory)
      BLEND_ARG=()
      if [[ -n "${BLEND_POOL_ID:-}" && -n "${ID_blend_adapter:-}" ]]; then
        BLEND_ARG=(--blend-adapter "\"${ID_blend_adapter}\"")
      fi
      CTOR_ARGS=(-- --admin "${ADMIN}" \
        --market-wasm "${HASH_distribution_market}" \
        --registry "${ID_registry}" --usdc "${USDC_SAC_ID}" \
        --treasury "${ADMIN}" ${BLEND_ARG[@]+"${BLEND_ARG[@]}"})
      ;;
    resolver-designated)
      CTOR_ARGS=(-- --designated "${ADMIN}" \
        --resolve-time "$(( $(date +%s) + 7200 ))")
      ;;
    resolver-attested)
      # Poster pubkey: 32-byte Ed25519 hex (defaults to deployer's raw pubkey).
      POSTER_G="${ATTESTED_POSTER_G:-${DEPLOYER_ADDR}}"
      POSTER_PUBKEY_HEX="${ATTESTED_POSTER_PUBKEY_HEX:-$(
        pnpm --dir "${ROOT}/web" exec node -e "
          const { Keypair } = require('@stellar/stellar-sdk');
          const kp = Keypair.fromPublicKey(process.argv[1]);
          process.stdout.write(kp.rawPublicKey().toString('hex'));
        " "${POSTER_G}" 2>/dev/null || echo ''
      )}"
      [[ -n "${POSTER_PUBKEY_HEX}" && "${#POSTER_PUBKEY_HEX}" -eq 64 ]] || {
        echo "set ATTESTED_POSTER_PUBKEY_HEX (32-byte hex) or ATTESTED_POSTER_G (G-address)" >&2
        exit 1
      }
      CTOR_ARGS=(-- --poster-pubkey "${POSTER_PUBKEY_HEX}" \
        --resolve-time "$(( $(date +%s) + 7200 ))" \
        --challenge-window-secs "${ATTESTED_CHALLENGE_WINDOW_SECS:-3600}")
      ;;
    resolver-optimistic)
      CTOR_ARGS=(-- --usdc "${USDC_SAC_ID}" --committee "${ADMIN}" \
        --resolve-time "$(( $(date +%s) + 7200 ))" \
        --dispute-window-secs "${OPTIMISTIC_DISPUTE_WINDOW_SECS:-600}" \
        --min-bond "${OPTIMISTIC_MIN_BOND:-1000000}")
      ;;
  esac
  # `${arr[@]+...}` so an empty CTOR_ARGS doesn't trip `set -u` on bash 3.2 (macOS).
  # Ledger can lag behind upload; retry deploy until WASM is visible.
  id=""
  for attempt in 1 2 3 4 5 6; do
    if id="$(stellar contract deploy --wasm-hash "${hash}" --network "${NETWORK}" "${SOURCE_ARG[@]}" ${CTOR_ARGS[@]+"${CTOR_ARGS[@]}"} 2>/dev/null)"; then
      id="${id//\"/}"
      break
    fi
    sleep 2
  done
  [[ -n "${id}" ]] || { echo "   deploy failed after retries (wasm ${hash})" >&2; exit 1; }
  sleep 1
  echo "   contract  : ${id}"
  key="$(to_camel "${c}")"
  [[ -n "${CONTRACTS_JSON}" ]] && CONTRACTS_JSON="${CONTRACTS_JSON},"
  CONTRACTS_JSON="${CONTRACTS_JSON}
    \"${key}\": { \"id\": \"${id}\", \"wasmHash\": \"${hash}\" }"
  # Remember each id under its snake_case name for the steps below.
  eval "ID_$(echo "${c}" | tr '-' '_')=${id}"
  N=$(( N + 1 ))
done

# --- wire the registry to the real factory -------------------------------
echo "-- registry.set_factory(${ID_market_factory}) --"
sleep 2
for attempt in 1 2 3 4 5 6; do
  if stellar contract invoke --id "${ID_registry}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
    -- set_factory --new-factory "${ID_market_factory}" 2>/dev/null; then
    break
  fi
  [[ "${attempt}" -eq 6 ]] && echo "   (set_factory failed — re-run manually)" >&2
  sleep 3
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
MU0_18="50000000000000000000"          # 50 * 1e18
NOW="$(date +%s)"
W_OPEN="${NOW}"; W_LOCK="$(( NOW + 3600 ))"; W_RESOLVE="$(( NOW + 7200 ))"
if [[ -z "${BLEND_POOL_ID:-}" ]]; then
  echo "-- distribution-market: init + verify (non-BlendTap) ----"
  BLEND_INIT=()
  if [[ -n "${ID_blend_adapter:-}" ]]; then
    BLEND_INIT=(--blend-adapter "\"${ID_blend_adapter}\"")
  fi
  if stellar contract invoke --id "${ID_distribution_market}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
       -- init \
          --k "${WAD18}" --b "${B18}" --fee-bps 30 \
          --resolver "${ID_resolver_reflector}" --tier 0 \
          --window-open "${W_OPEN}" --window-lock "${W_LOCK}" --window-resolve "${W_RESOLVE}" \
          --mu0 "${MU0_18}" --sigma0 "${WAD18}" --usdc "${USDC_SAC_ID}" \
          --capped-flag 0 --treasury "${ADMIN}" --creator "${DEPLOYER_ADDR}" \
          --fee-lp-bps 7000 --fee-treasury-bps 2000 --fee-creator-bps 1000 \
          ${BLEND_INIT[@]+"${BLEND_INIT[@]}"}; then
    echo "   get_params ->"
    stellar contract invoke --id "${ID_distribution_market}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no \
      -- get_params || true
    echo "   get_state  ->"
    stellar contract invoke --id "${ID_distribution_market}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no \
      -- get_state || true
  else
    echo "   (init invoke failed — factory create_market is the primary path)" >&2
  fi
else
  echo "-- distribution-market: skip standalone init (BlendTap uses factory.create_market) --"
fi

# --- demo: create a market through the factory (Sprint 3) ----------------
# Proves the permissionless path: factory deploys a fresh DistributionMarket,
# inits it, and registers it. Same demo curve as above; a *new* market every run.
DEMO_MKT=""
echo "-- market-factory.create_market (demo) ----"
sleep 2
DEMO_MKT=""
for attempt in 1 2 3 4 5 6; do
  if MKT="$(stellar contract invoke --id "${ID_market_factory}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
       -- create_market \
          --creator "${DEPLOYER_ADDR}" \
          --k "${WAD18}" --b "${B18}" --fee-bps 30 \
          --resolver "${ID_resolver_reflector}" --tier 0 \
          --window-open "${W_OPEN}" --window-lock "${W_LOCK}" --window-resolve "${W_RESOLVE}" \
          --mu0 "${MU0_18}" --sigma0 "${WAD18}" --capped-flag 0 2>/dev/null)"; then
    DEMO_MKT="${MKT//\"/}"
    break
  fi
  sleep 3
done
  if [[ -n "${DEMO_MKT}" ]]; then
  echo "   created market : ${DEMO_MKT}"
  if [[ -n "${ID_blend_adapter:-}" ]]; then
    echo "-- blend-adapter.authorize_market (${DEMO_MKT}) --"
    sleep 3
    for attempt in 1 2 3 4 5; do
      if stellar contract invoke --id "${ID_blend_adapter}" --network "${NETWORK}" "${SOURCE_ARG[@]}" \
        -- authorize_market --market "${DEMO_MKT}" --cap-7dp 100000000000 2>/dev/null; then
        break
      fi
      sleep 3
    done || echo "   (authorize_market failed — re-run manually)" >&2
  elif [[ "${DEMO_MODE_JSON}" == "true" ]]; then
    LP_KEY="${KAIDO_TREASURY_KEY_NAME:-kaido-${NETWORK}-treasury}"
    LP_SOURCE=(--source-account "${LP_KEY}")
    if [[ -n "${KAIDO_TREASURY_SECRET_KEY:-}" ]]; then
      LP_SOURCE=(--source-account "${KAIDO_TREASURY_SECRET_KEY}")
      LP_ADDR="$(stellar keys public-key "${KAIDO_TREASURY_SECRET_KEY}" 2>/dev/null || echo "${DEPLOYER_ADDR}")"
    else
      LP_ADDR="$(stellar keys address "${LP_KEY}" 2>/dev/null || echo "${DEPLOYER_ADDR}")"
    fi
    echo "-- add_liquidity protocol seed (${DEMO_MKT}) lp=${LP_ADDR} --"
    sleep 2
    for attempt in 1 2 3 4 5; do
      if stellar contract invoke --id "${DEMO_MKT}" --network "${NETWORK}" "${LP_SOURCE[@]}" \
        -- add_liquidity --lp "${LP_ADDR}" --scale-y "${WAD18}" 2>/dev/null; then
        break
      fi
      sleep 3
    done || echo "   (add_liquidity seed failed — run make seed:${NETWORK})" >&2
  fi
  echo "   registry.count ->"
  stellar contract invoke --id "${ID_registry}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no -- count || true
  echo "   registry.get(${DEMO_MKT}) ->"
  stellar contract invoke --id "${ID_registry}" --network "${NETWORK}" "${SOURCE_ARG[@]}" --send=no -- get --market "${DEMO_MKT}" || true
else
  echo "   (factory create_market failed — re-run manually)" >&2
fi

json_or_null() { [[ -n "$1" ]] && printf '"%s"' "$1" || printf 'null'; }

FIXTURES_JSON=""
if [[ -n "${DEMO_MKT}" ]]; then
  FIXTURES_JSON="
  \"fixtures\": {
    \"demoMarket\": \"${DEMO_MKT}\",
    \"demoResolver\": \"${ID_resolver_reflector}\"
  },"
fi

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
    "settlementSymbol": $(json_or_null "${SETTLEMENT_SYMBOL}"),
    "demoMode": ${DEMO_MODE_JSON},
    "kaidoIssuer": $(json_or_null "${KAIDO_ISSUER}"),
    "reflectorFeedId": $(json_or_null "${REFLECTOR_FEED_ID}"),
    "adminAddress": $(json_or_null "${ADMIN_ADDRESS}")
  },
  "contracts": {${CONTRACTS_JSON}
  },${FIXTURES_JSON}
  "seededAt": null
}
EOF

echo
echo "OK: deployed ${N} contracts to ${NETWORK}; wrote ${OUT#${ROOT}/}"
if [[ -n "${DEMO_MKT}" ]]; then
  echo
  echo "Demo market (factory-registered): ${DEMO_MKT}"
  echo "  export NEXT_PUBLIC_KAIDO_DEMO_MARKET=${DEMO_MKT}"
  if [[ -n "${ID_blend_adapter:-}" ]]; then
    echo "Next: trade on ${DEMO_MKT} — BlendTap JIT borrow fires on first trade"
    echo "       or: ./contracts/scripts/blend-lifecycle-e2e.sh ${NETWORK}"
  elif [[ "${DEMO_MODE_JSON}" == "true" ]]; then
    echo "Next: make seed:${NETWORK}  # LP-seed demo markets with KAIDO"
    echo "       set KAIDO_DEMO=1 in .env — traders claim KAIDO via /api/faucet"
  else
    echo "Next: make seed:${NETWORK}  # lifecycle fixture for integration tests"
  fi
fi
