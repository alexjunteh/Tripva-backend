#!/usr/bin/env bash
set -euo pipefail

# Smoke-test a deployed Tripva backend instance.
# Usage: ./scripts/smoke.sh <base-url>
# Example: ./scripts/smoke.sh https://tripai-backend-abc123.vercel.app

BASE="${1:?Usage: smoke.sh <base-url>}"
BASE="${BASE%/}"
PASS=0
FAIL=0
TOTAL=0

BYPASS_HEADER=""
if [[ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]]; then
  BYPASS_HEADER="-H x-vercel-protection-bypass:${VERCEL_AUTOMATION_BYPASS_SECRET}"
fi

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

check() {
  local label="$1" url="$2" expect_status="${3:-200}" expect_body="${4:-}"
  TOTAL=$((TOTAL + 1))

  local resp status body
  resp=$(curl -sS -w '\n__HTTP_STATUS__%{http_code}' --max-time 15 $BYPASS_HEADER "$url" 2>&1) || {
    FAIL=$((FAIL + 1))
    red "FAIL [$label] curl error: $resp"
    return
  }

  status=$(echo "$resp" | grep -oE '__HTTP_STATUS__[0-9]+' | grep -oE '[0-9]+$')
  body=$(echo "$resp" | sed 's/__HTTP_STATUS__[0-9]*//')

  # expect_status can be "200|429" for multiple acceptable codes
  local match=false
  IFS='|' read -ra CODES <<< "$expect_status"
  for code in "${CODES[@]}"; do
    [[ "$status" == "$code" ]] && match=true
  done

  if ! $match; then
    FAIL=$((FAIL + 1))
    red "FAIL [$label] expected $expect_status, got $status"
    return
  fi

  if [[ -n "$expect_body" ]] && ! echo "$body" | grep -q "$expect_body"; then
    FAIL=$((FAIL + 1))
    red "FAIL [$label] body missing: $expect_body"
    return
  fi

  PASS=$((PASS + 1))
  green "PASS [$label] ($status)"
}

bold "=== Tripva Backend Smoke Tests ==="
bold "Target: $BASE"
echo ""

# 1. Health endpoint
check "health" "$BASE/api/health" 200 '"ok"'

# 2. Stats endpoint (returns analytics)
check "stats-200" "$BASE/api/stats" 200

# 3. Spots/photospot selector (needs destination param; 429 = rate-limited but alive)
check "spots-endpoint" "$BASE/api/spots?destination=Tokyo" "200|429"


# 4. User endpoint without auth returns 401
check "user-unauthed" "$BASE/api/user/me" 401

# 5. Stripe checkout (POST-only) without auth returns 401
TOTAL=$((TOTAL + 1))
STRIPE_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 $BYPASS_HEADER -X POST "$BASE/api/stripe/checkout" 2>/dev/null || echo "000")
if [[ "$STRIPE_STATUS" == "401" ]]; then
  PASS=$((PASS + 1))
  green "PASS [stripe-unauthed]"
else
  FAIL=$((FAIL + 1))
  red "FAIL [stripe-unauthed] expected 401, got $STRIPE_STATUS"
fi

# 6. Plan endpoint requires POST with body — GET should 405 or 400
check "plan-no-post" "$BASE/api/plan" 405

# 7. Flight search endpoint responds (may be 400 without params, that's fine)
check "flights-reachable" "$BASE/api/flights/cheap?origin=SYD" 200

# 8. Push public-key endpoint
check "push-pubkey" "$BASE/api/push/public-key" 200

# 9. Social status (may 401 without auth)
check "social-status" "$BASE/api/social/status" 401

# 10. SSE plan endpoint — POST with minimal body, just verify it connects and starts streaming
SSE_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
  $BYPASS_HEADER \
  -X POST -H 'Content-Type: application/json' \
  -d '{"destinations":["Tokyo"],"startDate":"2026-09-01","endDate":"2026-09-03","travelers":1}' \
  "$BASE/api/plan" 2>/dev/null || echo "000")
TOTAL=$((TOTAL + 1))
if [[ "$SSE_STATUS" == "200" ]]; then
  PASS=$((PASS + 1))
  green "PASS [sse-plan-connects] SSE stream started (status $SSE_STATUS)"
elif [[ "$SSE_STATUS" == "429" ]]; then
  PASS=$((PASS + 1))
  green "PASS [sse-plan-connects] rate-limited (429) — endpoint alive"
else
  FAIL=$((FAIL + 1))
  red "FAIL [sse-plan-connects] expected 200 or 429, got $SSE_STATUS"
fi

echo ""
bold "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
  red "SMOKE TESTS FAILED — do NOT promote to production"
  exit 1
fi

green "All smoke tests passed — safe to promote"
exit 0
