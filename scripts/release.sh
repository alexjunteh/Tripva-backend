#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

die() { red "ERROR: $*"; exit 1; }

SKIP_TESTS=false
SKIP_SMOKE=false
SKIP_QA=false
AUTO_YES=false
TARGET_SHA=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-tests)  SKIP_TESTS=true; shift ;;
    --skip-smoke)  SKIP_SMOKE=true; shift ;;
    --skip-qa)     SKIP_QA=true; shift ;;
    --yes|-y)      AUTO_YES=true; shift ;;
    --sha)         TARGET_SHA="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: release.sh [--sha <commit>] [--skip-tests] [--skip-smoke] [--skip-qa] [--yes]"
      echo ""
      echo "Steps: verify clean → tests → preview deploy → smoke → QA gate → promote → tag"
      echo ""
      echo "Options:"
      echo "  --sha <commit>   Deploy a specific commit (default: HEAD)"
      echo "  --skip-tests     Skip vitest (use if CI already passed)"
      echo "  --skip-smoke     Skip smoke suite (not recommended)"
      echo "  --skip-qa        Skip visual QA gate (not recommended)"
      echo "  --yes / -y       Skip confirmation prompts"
      exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

confirm() {
  if $AUTO_YES; then return 0; fi
  read -rp "$1 [y/N] " ans
  [[ "$ans" =~ ^[Yy] ]] || die "Aborted by user"
}

# ── Step 1: Verify state ─────────────────────────────────────────────

bold "=== Step 1: Verify repo state ==="

[[ -z "$TARGET_SHA" ]] && TARGET_SHA=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
SHORT_SHA=$(git rev-parse --short "$TARGET_SHA")

echo "Branch:     $BRANCH"
echo "Target SHA: $TARGET_SHA ($SHORT_SHA)"

DIRTY=$(git status --porcelain --ignore-submodules | grep -v '^\?\?' | grep -v '\.claude/' | grep -v 'scripts/publish.js' | grep -v 'scripts/schedule.json' || true)
if [[ -n "$DIRTY" ]]; then
  echo "$DIRTY"
  die "Working tree has uncommitted tracked changes (excluding .claude/ and scripts/publish.js). Commit or stash first."
fi

green "Repo state OK"

# ── Step 2: Run tests ────────────────────────────────────────────────

bold "=== Step 2: Run tests ==="

if $SKIP_TESTS; then
  echo "Skipped (--skip-tests)"
else
  npm test || die "Tests failed — fix before releasing"
  green "Tests passed"
fi

# ── Step 3: Preview deploy (clean worktree) ──────────────────────────

bold "=== Step 3: Preview deploy ==="

WORKTREE="/tmp/tripva-release-$$"
trap 'rm -rf "$WORKTREE" 2>/dev/null; git worktree remove "$WORKTREE" --force 2>/dev/null || true' EXIT

git worktree add "$WORKTREE" "$TARGET_SHA" --detach --quiet
cp -r "$REPO_ROOT/.vercel" "$WORKTREE/.vercel"

echo "Deploying preview from clean worktree at $SHORT_SHA ..."
PREVIEW_OUTPUT=$(cd "$WORKTREE" && vercel deploy --yes 2>&1) || die "Preview deploy failed: $PREVIEW_OUTPUT"
PREVIEW_URL=$(echo "$PREVIEW_OUTPUT" | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | tail -1)

if [[ -z "$PREVIEW_URL" ]]; then
  die "Could not extract preview URL from deploy output:\n$PREVIEW_OUTPUT"
fi

green "Preview deployed: $PREVIEW_URL"

# ── Step 4: Smoke tests ──────────────────────────────────────────────

bold "=== Step 4: Smoke tests against preview ==="

if $SKIP_SMOKE; then
  echo "Skipped (--skip-smoke)"
else
  echo "Waiting 10s for functions to warm up..."
  sleep 10
  if [[ -z "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]]; then
    tmpenv="/tmp/tripva-env-$$"
    vercel env pull "$tmpenv" --environment preview --yes >/dev/null 2>&1 || true
    if [[ -f "$tmpenv" ]]; then
      VERCEL_AUTOMATION_BYPASS_SECRET=$(grep '^VERCEL_AUTOMATION_BYPASS_SECRET=' "$tmpenv" | cut -d= -f2- | tr -d '"' || echo "")
      rm -f "$tmpenv"
    fi
    export VERCEL_AUTOMATION_BYPASS_SECRET
  fi
  bash "$REPO_ROOT/scripts/smoke.sh" "$PREVIEW_URL" || die "Smoke tests failed — preview NOT promoted"
  green "Smoke tests passed"
fi

# ── Step 5: QA gate (visual + API quality) ───────────────────────────

bold "=== Step 5: QA gate ==="

if $SKIP_QA; then
  echo "Skipped (--skip-qa)"
else
  bash "$REPO_ROOT/scripts/qa.sh" "$PREVIEW_URL" || die "QA gate failed — preview NOT promoted"
  green "QA gate passed"
fi

# ── Step 6: Record current prod (for rollback) ──────────────────────

bold "=== Step 6: Record current production deployment ==="

CURRENT_PROD=$(vercel inspect tripai-backend.vercel.app 2>&1 | grep -oE 'dpl_[a-zA-Z0-9]+' | head -1 || echo "unknown")
echo "Current prod deployment: $CURRENT_PROD"
echo "  To rollback: vercel promote $CURRENT_PROD --yes"
echo ""

# ── Step 7: Promote to production ────────────────────────────────────

bold "=== Step 7: Promote preview to production ==="

PREVIEW_DPL=$(vercel inspect "$PREVIEW_URL" 2>&1 | grep -oE 'dpl_[a-zA-Z0-9]+' | head -1 || echo "")
if [[ -z "$PREVIEW_DPL" ]]; then
  die "Could not determine preview deployment ID"
fi

echo "Preview deployment: $PREVIEW_DPL"
echo "This will make $SHORT_SHA live on tripai-backend.vercel.app"
confirm "Promote to production?"

vercel promote "$PREVIEW_DPL" --yes || die "Promote failed"

echo "Waiting 5s for alias propagation..."
sleep 5

# ── Step 8: Post-promote health check ────────────────────────────────

bold "=== Step 8: Post-promote health check ==="

HEALTH=$(curl -sS --max-time 10 "https://tripai-backend.vercel.app/api/health" 2>&1)
if echo "$HEALTH" | grep -q '"ok"'; then
  green "Production health check passed"
else
  red "WARNING: Health check returned: $HEALTH"
  echo "  Rollback: vercel promote $CURRENT_PROD --yes"
  die "Post-promote health check failed"
fi

# ── Step 9: Tag release ──────────────────────────────────────────────

bold "=== Step 9: Tag release ==="

LATEST_TAG=$(git tag -l 'v*' --sort=-v:refname | head -1 || echo "")
if [[ -z "$LATEST_TAG" ]]; then
  NEXT_TAG="v1.0.0"
else
  MAJOR=$(echo "$LATEST_TAG" | cut -d. -f1)
  MINOR=$(echo "$LATEST_TAG" | cut -d. -f2)
  PATCH=$(echo "$LATEST_TAG" | cut -d. -f3)
  NEXT_TAG="${MAJOR}.${MINOR}.$((PATCH + 1))"
fi

echo "Previous tag: ${LATEST_TAG:-none}"
echo "Next tag:     $NEXT_TAG"

git tag -a "$NEXT_TAG" "$TARGET_SHA" -m "Release $NEXT_TAG (deployed $SHORT_SHA)"
green "Tagged $NEXT_TAG at $SHORT_SHA"

echo ""
bold "=== Release complete ==="
green "  Version:    $NEXT_TAG"
green "  Commit:     $SHORT_SHA"
green "  Production: https://tripai-backend.vercel.app"
green "  Rollback:   vercel promote $CURRENT_PROD --yes"
echo ""
