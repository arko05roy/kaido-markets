#!/usr/bin/env bash
# Re-seed demo / test fixtures for a network. Must be safely re-runnable —
# after a testnet reset, `make deploy:testnet && make seed:testnet` restores a
# demoable state from scratch (build.md §0a).
#
#   ./contracts/scripts/seed.sh <local|testnet>
#
# Sprint 0: scaffold only. Fixture markets/positions are defined from Sprint 2.
set -euo pipefail
NETWORK="${1:-${STELLAR_NETWORK:-}}"
[[ -n "${NETWORK}" ]] || { echo "usage: $0 <local|testnet>" >&2; exit 2; }
[[ "${NETWORK}" != "mainnet" ]] || { echo "refusing to seed fixtures on mainnet." >&2; exit 1; }
echo "seed.sh is a Sprint-0 scaffold — fixtures land in Sprint 2. Nothing seeded." >&2
exit 0
