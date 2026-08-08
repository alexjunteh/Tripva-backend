#!/usr/bin/env bash
set -euo pipefail

# QA gate for Tripva releases — visual + API quality checks.
# Usage: ./scripts/qa.sh [preview-url]
# Called by release.sh after smoke tests pass.
# Can also be run standalone against production:
#   ./scripts/qa.sh https://tripai-backend.vercel.app

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREVIEW_URL="${1:-}"

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

bold "=== Tripva QA Gate ==="
echo "Frontend: ${FRONTEND_URL:-https://tripva.app}"
[[ -n "$PREVIEW_URL" ]] && echo "Backend:  $PREVIEW_URL"
echo ""

node "$REPO_ROOT/scripts/qa-visual.js" ${PREVIEW_URL:+"$PREVIEW_URL"}
EXIT=$?

if [[ $EXIT -ne 0 ]]; then
  echo ""
  red "QA GATE FAILED — do NOT promote to production"
  red "Screenshots: ${QA_SCREENSHOT_DIR:-/tmp/tripva-qa}/"
  exit 1
fi

echo ""
green "QA gate passed — safe to promote"
exit 0
