# Feature Context: Social Media Content

**Project:** tripva
**Created:** 2026-07-30

## Purpose
<!-- One sentence: what outcome this feature creates and why Alex chose to build it -->

## Build Intent
- **Trigger:** <!-- pain, evidence, opportunity, or ambition gap -->
- **Desired outcome:** <!-- what changes when this works -->
- **Constraint removed:** <!-- time, scale, quality, risk, or revenue bottleneck -->
- **Why this solution:** <!-- why a reusable feature/system instead of a one-off or existing tool -->
- **Closed loop:** <!-- observe → decide → act → verify; include Alex approval boundary -->
- **Compounding value:** <!-- what future work or revenue becomes easier -->
- **Success signal:** <!-- measurable proof the original reason was satisfied -->
- **Alternatives rejected:** <!-- other options considered and why not -->
- **Confidence:** <!-- confirmed by Alex | inferred | unknown — ask Alex -->

## Current State
<!-- What is built, what is working, what is in progress -->

## Key Decisions
<!-- Architecture decisions, trade-offs, constraints -->

## SOPs & References
<!-- Links to docs, commands, API endpoints specific to this feature -->

## Open Questions
<!-- Things to investigate or decide -->

## Session Notes
<!-- Claude: append discoveries and decisions here during sessions -->

<!-- auto-sync-start -->
**Score:** 9% | **Synced:** 2026-07-31T06:55:39Z

**Goals:**
- Create and execute social media content strategy for Tripva to go viral and gain users

**Open Todos:**
- [p0] [ALEX] Create Tripva Facebook page
- [p0] [ALEX] Create @tripva Instagram account
- [p0] [ALEX] Create Tripva TikTok account
- [p0] Decide on Buffer plan upgrade ($6/mo) — free plan 10-post cap blocks any real cadence
- [p0] [ALEX] Connect Tripva FB+IG to Buffer
- [p1] Schedule Phase 1 launch posts (1-7) via Buffer once channels connected
- [p1] Build Destination Content Factory loop (daily auto-generation of destination showcase content)
- [p2] Wire Higgsfield for auto-generating destination reel videos
- ...2 more

**Decisions:**
- Planned 5-pillar content strategy: destination showcases (40%), pain points (25%), feature deep-dives (15%), UGC (10%), trending (10%)
- Planned 3-loop automation system: daily destination factory, 2x/week trend reactor, weekly analytics optimizer
- Recommended TikTok as highest-priority platform for travel virality over Facebook

**Work State:**
OBJECTIVE: Assemble 7 themed narrated destination reels for Tripva social media (Aug+Sep 2026)
STATUS: Reels 1-2 assembled via explainer_video BUT HAVE A BUG — 5-second freeze between clips because explainer_video uses fixed 10s blocks and our clips are only 5s. Need to re-assemble.
ROOT CAUSE: explainer_video = 10s fixed blocks. 5s video clips freeze for remaining 5s per block.
PROPOSED FIX: Use ffmpeg to assemble locally — download clips + voiceovers, stitch with exact timing, no dead frames.
VOICEOVERS DONE: 8/21 (Amalfi, Dubrovnik, Lisbon, Swiss Alps, Maldives, Dubai, Vietnam, Singapore). Cape Town (#9) was pending.
REELS COMPLETED: None usable (Reel 1 + 2 have freeze bug)
NEXT: Alex to confirm ffmpeg approach, then re-assemble all reels + generate remaining voiceovers
BLOCKERS ON ALEX: Create FB/IG/TikTok accounts, connect Buffer, upgrade Buffer ($6/mo)
KEY FILES: tripva-backend/.claude/features/social-media-content/log.md, state.md
<!-- auto-sync-end -->
