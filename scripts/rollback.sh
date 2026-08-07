#!/usr/bin/env bash
set -euo pipefail

# Roll back to a previous Vercel deployment.
# Usage: rollback.sh <deployment-id>
# Example: rollback.sh dpl_BWXFGVENUgGUpSNMBWyGD1WNpGaz

DPL_ID="${1:?Usage: rollback.sh <deployment-id>  (e.g. dpl_BWXFGVENUgGUpSNMBWyGD1WNpGaz)}"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }

bold "Rolling back to $DPL_ID ..."
vercel promote "$DPL_ID" --yes || { red "Promote/rollback failed"; exit 1; }

echo "Waiting 5s for alias propagation..."
sleep 5

HEALTH=$(curl -sS --max-time 10 "https://tripai-backend.vercel.app/api/health" 2>&1)
if echo "$HEALTH" | grep -q '"ok"'; then
  green "Rollback complete — health check passed"
else
  red "WARNING: Health check after rollback: $HEALTH"
  exit 1
fi
