# Tripva Monetization Strategy

## Pricing

- **Free tier**: Full AI itinerary, 3/day anon, 10/day logged-in, 1 saved trip
- **Tripva Pro**: $24.99/year or $2.99/month — unlimited generation, saves, share/export

## Unit Economics

- API cost per trip: ~$0.004 (gpt-4o-mini)
- Break-even: 1 Pro sub covers 750 free users' API costs (0.13% conversion rate)
- Industry freemium conversion: 2-5% → 15-38x safety margin

## Revenue Streams

1. **Subscriptions** — immediate Stripe deposits, cash flow backbone
2. **Affiliate commissions** — $0.05-0.50/trip, 30-90 day lag (Booking.com ~4-5%, GetYourGuide/Viator 8%)
3. **Trip credits** (future) — $0.99-2.99 one-time purchases for PDF export, AI concierge, premium regen
4. **B2B API** (future) — $99-299/mo for travel agencies/bloggers
5. **Destination sponsorships** (future) — tourism boards pay per trip inclusion

## Pro Conversion Gates (Backend)

### Gate 1: Save Limit
- Free = 1 saved trip, Pro = unlimited
- Trigger: `api/user.js` POST /api/user/trips/save — count check before insert
- Response: 403 `save_limit_reached` with upgrade prompt

### Gate 2: Share/Export
- Free = no sharing, Pro = shareable links + PDF
- Trigger: frontend gates "Copy Link" / "Download PDF" behind Pro check
- Backend: `GET /api/user/plan` returns plan status + limits

### Gate 3: Quota Exhaustion
- Enriched 429 response includes upgrade info (price, benefits, URL)
- Trigger: `api/plan.js` quota exceeded response

### Gate 4: Trip Edit Limit
- Free = 2 edits per trip, Pro = unlimited
- Trigger: `api/trip.js` patch endpoint (future)

### Gate 5: Pro Quality
- Pro users get richer prompts (higher MAX_TOKENS, insider tips)
- Trigger: `lib/claude.js` prompt builder checks plan tier

## Backend Implementation

### New: lib/pro.js
Centralized Pro status checker — reads `profiles.plan` from Supabase.

### Modified: api/user.js
- Save limit gate on POST /api/user/trips/save
- New endpoint: GET /api/user/plan (plan status, limits, usage)

### Modified: api/plan.js
- Quota tier reads from profiles.plan (not just auth presence)
- Enriched 429 response with upgrade info

### Modified: lib/quota.js
- No changes needed — already supports 'paid' tier with Infinity limit

## Growth Strategy

1. **Months 1-3**: Organic (SEO, Reddit, social). $0 acquisition cost.
2. **Month 3+**: Light Google Ads ($200/mo on "AI trip planner" keywords)
3. **Month 6+**: Reinvest affiliate revenue into scaled paid acquisition
4. **Flywheel**: Pro users share trips → links drive traffic → new users → conversions

## Revenue Projections

| MAU | Pro Subs | Sub Rev/mo | Affiliate/mo | Net Profit/mo |
|-----|----------|-----------|-------------|---------------|
| 1K | 30 | $73 | $160 | $220 |
| 10K | 300 | $734 | $1,600 | $2,161 |
| 50K | 1,500 | $3,668 | $8,000 | $10,926 |
| 100K | 3,000 | $7,336 | $16,050 | $21,902 |
