# Feature Context: Tripva Marketing

## Purpose

## Build Intent
- **Trigger:**
- **Desired outcome:**
- **Constraint removed:**
- **Why this solution:**
- **Closed loop:**
- **Compounding value:**
- **Success signal:**
- **Alternatives rejected:**
- **Confidence:** unknown — ask Alex

## Current State

## Key Decisions

## Session Notes

<!-- auto-sync-start -->
**Score:** 85% | **Synced:** 2026-07-31T08:05:22Z

**Goals:**
- Finalize Tripva brand kit with clean logo files, colors, typography, and content-pipeline-ready exports

**Open Todos:**
- [p1] Run migrations/001_scheduled_posts.sql in Supabase SQL Editor
- [p1] Merge PR #17 (scheduled posts system)

**Decisions:**
- Connected Tripva FB page (1301852893001275) and IG @tripva.app (17841438766066506) via admin-only /api/social endpoints using never-expiring system user token with 28 permissions
- Built direct Meta Graph API publishing instead of Buffer (free plan channel limit blocks adding Tripva channels)
- Built self-hosted post scheduler with Vercel Cron (every 15 min) + Supabase scheduled_posts table instead of using Buffer
- Switched to local desktop publishing via CLI script (scripts/publish.js) instead of Vercel-hosted endpoints — GitHub repo stays code-only
- Created 16 remaining marketing post images using Playwright HTML→PNG rendering, uploaded all to Supabase marketing bucket, updated schedule.json — all 20/20 posts now ready with images

**Work State:**
OBJECTIVE: Create and schedule marketing content for Tripva via local CLI (not Vercel)
STATUS: ALL 20 POSTS READY — images created, uploaded, schedule.json updated
PRODUCED:
- 16 new PNG images rendered via Playwright (V5 photo-first style, 1080x1080)
- All 16 uploaded to Supabase marketing/posts/ bucket (HTTP 200)
- scripts/schedule.json updated — 20/20 posts with imageUrl + ready:true
- render.js script at tripva-frontend/assets/campaign/marketing/render.js (reusable)
- 16 HTML templates for future editing
IMAGES: P1-P6, D1-D8, L1-L6 — all complete
NEXT: Publish all 20 posts via `node scripts/publish.js batch scripts/schedule.json`
KEY FILES:
- Publish CLI: tripva-backend/scripts/publish.js
- Batch file: tripva-backend/scripts/schedule.json
- Render script: tripva-frontend/assets/campaign/marketing/render.js
- Images: tripva-frontend/assets/campaign/marketing/*.png
- Supabase bucket: marketing/posts/
<!-- auto-sync-end -->
