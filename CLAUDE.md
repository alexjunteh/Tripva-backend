# Tripva Backend — Agent Instructions

## Project Overview
AI trip planner backend. Node.js serverless functions on Vercel (Hobby plan).
- **Prod URL:** https://tripai-backend.vercel.app
- **Health check:** /api/health (rewrite → /api/stats?_health=1)
- **Frontend:** https://tripva.app (Cloudflare Pages, separate repo)
- **Database:** Supabase (PostgreSQL)
- **Payments:** Stripe
- **Tests:** `npm test` (vitest, 106+ tests)

## 🔴 Deploy SOP — MANDATORY

**NEVER run `vercel deploy --prod` directly. NEVER invent a deploy script. Use the release pipeline.**

Every production deployment MUST go through `scripts/release.sh`. No exceptions. No shortcuts. No "just this once."

### To deploy
```bash
# Full pipeline (recommended)
./scripts/release.sh

# If CI already passed, skip local tests
./scripts/release.sh --skip-tests

# Deploy a specific commit
./scripts/release.sh --sha <commit>

# Non-interactive (for automation)
./scripts/release.sh --yes
```

### What release.sh does (do NOT replicate manually)
1. Verifies clean worktree at target SHA (excludes .claude/ and scripts/publish.js)
2. Runs `npm test`
3. Creates a clean git worktree → preview deploys from it (uncommitted work CANNOT ship)
4. Runs `scripts/smoke.sh` against the preview URL (10 endpoint checks)
5. Prints current prod deployment ID (for rollback)
6. **Asks for confirmation** before promoting
7. Promotes preview → production (same build, no rebuild)
8. Post-promote health check
9. Tags the release (vX.Y.Z)

### To roll back
```bash
./scripts/rollback.sh <deployment-id>
# Example: ./scripts/rollback.sh dpl_BWXFGVENUgGUpSNMBWyGD1WNpGaz
```

### To smoke-test any deployment
```bash
./scripts/smoke.sh <url>
# Example: ./scripts/smoke.sh https://tripai-backend-abc123.vercel.app
```

### Why this exists
- Vercel has NO Git auto-deploy on this repo (no GitHub integration connected)
- Working tree often has uncommitted work from other features (e.g., social-media scripts) that must not ship
- Previous deploys were ad-hoc and error-prone — clean worktree isolation + smoke tests prevent shipping broken or unintended code
- Preview deploy → smoke → promote ensures what you tested is byte-for-byte what goes live

### Rules for any AI agent
1. **NEVER** run `vercel deploy --prod` outside of `scripts/release.sh`
2. **NEVER** create a new deploy script — use the existing one
3. **NEVER** deploy from the working tree — release.sh uses a clean worktree
4. **ALWAYS** run smoke tests before promoting (release.sh does this automatically)
5. **ALWAYS** know the rollback deployment ID before promoting
6. If release.sh fails at any step, **STOP and report the failure** — do not work around it

## Git Workflow
- **Main branch:** master
- **GitHub remote:** origin (PAT embedded in remote URL)
- **CI:** `.github/workflows/test.yml` — runs `npm test` on push/PR
- **CI is flaky:** GitHub Actions runs sometimes wedge in "queued" for hours. If this happens, report it — do not bypass branch protection without Alex's approval.

## Key Paths
- API functions: `api/*.js`
- Shared library: `lib/*.js`
- Tests: `tests/` (vitest)
- Vercel config: `vercel.json`
- Migrations: `migrations/`
- Release scripts: `scripts/release.sh`, `scripts/smoke.sh`, `scripts/rollback.sh`

## Environment
- Vercel project: `prj_a1AFq48w9sUjRltEAlUYt5MkCSPm` (team `team_adTrujCWTUH136k1HthzgWuj`)
- Vercel CLI is authenticated locally
- Node 18+
