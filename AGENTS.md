# Tripva Backend — Agent Instructions

This file is for OpenAI Codex and other LLM agents. See CLAUDE.md for the full reference — both files enforce the same rules.

## Critical Rule: Deploy SOP

**NEVER run `vercel deploy --prod` directly. Use the release pipeline.**

```bash
# Deploy to production
./scripts/release.sh

# Roll back
./scripts/rollback.sh <deployment-id>

# Smoke-test any URL
./scripts/smoke.sh <url>
```

Release.sh handles: clean worktree isolation → tests → preview deploy → smoke tests → promote → health check → git tag. Do NOT replicate these steps manually or create alternative deploy scripts.

## Quick Reference
- Tests: `npm test` (vitest)
- Main branch: master
- Prod: https://tripai-backend.vercel.app
- Health: /api/health
- No Vercel Git auto-deploy — all deploys are manual via release.sh
