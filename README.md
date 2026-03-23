# TripAI Backend

AI-powered trip planner API built with Node.js, Express (local dev), and Vercel serverless functions.

Uses `claude-sonnet-4-5` to generate structured `trip-state.json` (normalizedVersion: 2) with full itineraries, hotels, budgets, train tickets, and map data.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set your ANTHROPIC_API_KEY
```

### 3. Run locally

```bash
npm start
# or
npm run dev   # with file watching
```

Server starts at `http://localhost:3001`.

---

## Deploy to Vercel

### First deploy

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Set environment variables in Vercel

```bash
vercel env add ANTHROPIC_API_KEY
vercel env add ALLOWED_ORIGIN
```

Or set them in the [Vercel dashboard](https://vercel.com/dashboard) → Project → Settings → Environment Variables.

### Subsequent deploys

```bash
vercel --prod
```

---

## API Reference

### `GET /api/health`

Health check.

**Response:**
```json
{
  "status": "ok",
  "service": "tripai-backend",
  "version": "1.0.0",
  "timestamp": "2026-03-23T00:00:00.000Z"
}
```

---

### `POST /api/plan`

Generate a full trip plan from scratch.

**Query params:**
- `?stream=true` — Stream progress via SSE (text/event-stream)

**Request body:**
```json
{
  "destination": "Italy + Switzerland",
  "startDate": "2026-03-18",
  "endDate": "2026-03-30",
  "travelers": 2,
  "budget": "RM 15000",
  "style": "efficiency-obsessed couple",
  "interests": ["trains", "food", "alpine views"],
  "homeCity": "Penang, Malaysia"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `destination` | string | ✓ | Trip destination(s) |
| `startDate` | string | ✓ | YYYY-MM-DD format |
| `endDate` | string | ✓ | YYYY-MM-DD format |
| `travelers` | number | ✓ | Positive integer |
| `budget` | string | ✓ | Total budget with currency (e.g. "RM 15000") |
| `style` | string | ✓ | Travel style description |
| `interests` | string[] | ✓ | Array of interests |
| `homeCity` | string | ✓ | Departure city |

**Response (200):** Full `trip-state.json` (normalizedVersion: 2)

**Error responses:**
- `400` — Invalid input (validation errors in `details` field)
- `422` — Claude failed to generate valid JSON after 3 retries
- `429` — Rate limit exceeded (10 req/min per IP)
- `503` — Anthropic API rate limit reached

**SSE events** (when `?stream=true`):
```
data: {"type":"start","message":"Planning your trip..."}
data: {"type":"progress","message":"Designing geography-optimized route..."}
data: {"type":"progress","message":"Building daily itineraries and timelines..."}
data: {"type":"done","data":{...trip-state...}}
```

---

### `POST /api/patch`

Apply a natural-language instruction to an existing trip state.

**Request body:**
```json
{
  "state": { ...existing trip-state (normalizedVersion: 2) },
  "instruction": "Add a day trip to Siena on Day 9"
}
```

**Response (200):** Updated `trip-state.json` — all unchanged fields preserved exactly.

**Error responses:**
- `400` — Invalid input or malformed state
- `422` — Claude failed to generate valid patch after 3 retries
- `429` — Rate limit exceeded

---

## Rate Limiting

10 requests per minute per IP address. Limits are communicated via headers:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 2026-03-23T00:01:00.000Z
```

Note: In Vercel's serverless environment, the in-memory rate limiter resets per cold start. For production scale, replace with a Redis-backed solution (e.g., Upstash).

---

## CORS

By default, only `https://futuriztaos.github.io` is allowed as an origin. Set `ALLOWED_ORIGIN` in your environment to change this. In development (`NODE_ENV !== 'production'`), all origins are permitted.

---

## trip-state.json Schema (normalizedVersion: 2)

```
{
  normalizedVersion: 2,
  planVersion: string,          // ISO timestamp
  rawPlan: {
    trip: { id, name, startDate, endDate, timezone, currency },
    days: [{ day, title, subtitle, emoji, heroSeed, imageUrl,
             timeline: [{ time, title, detail, type, mapQuery, ...optional }],
             highlights, localTips, photos }],
    hotels: [{ city, name, price, note, checkin, checkout, nights, bookUrl, address }],
    budget: [{ item, amount, note }],
    urgent: [{ label, note, url, priority }],
    tickets: [{ name, date, legs: [...], passengers: [...] }],
    mapStops: [{ name, lat, lng, emoji, type, day, nights }],
    mapRoute: [{ lat, lng }]
  }
}
```
