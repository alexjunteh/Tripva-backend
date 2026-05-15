# Flight Search + Constraint Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live flight search (Kiwi Tequila API) with Kiwi affiliate monetization, and harden constraint awareness so the AI planner blocks off arrival/departure time windows accurately.

**Architecture:** New `api/flights.js` proxies Kiwi Tequila search. `lib/airports.js` provides O(1) city→IATA lookup (static JSON, ~600 entries). A new flight-search screen in `plan.html` is conditionally shown when `_bookingAnchors.length === 0`. Selected flights auto-create a booking anchor with exact times, which flow into a strengthened `lib/prompt.js` constraint block that derives per-day BLOCKED TIME windows instead of relying on LLM inference.

**Tech Stack:** Node.js ESM (Vercel functions), Kiwi Tequila REST API (API key auth), vanilla JS (plan.html), Zod validation (existing), Vitest (existing)

**Vercel function budget:** currently 11/12. Merge `api/save.js` (POST) into `api/trip.js` to free 1 slot → add `api/flights.js` → stays at 12/12.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `api/flights.js` | CREATE | Kiwi Tequila proxy — search endpoint |
| `lib/airports.js` | CREATE | Static city→IATA map, top ~600 airports |
| `api/trip.js` | MODIFY | Absorb save.js POST handler (method routing) |
| `api/save.js` | DELETE | Merged into trip.js |
| `vercel.json` | MODIFY | Add flights function, add save→trip rewrite, remove save.js entry |
| `lib/prompt.js` | MODIFY | Derive per-day BLOCKED TIME from anchors |
| `lib/affiliate.js` | MODIFY | `flightLink()` → Kiwi affiliate deep-link URL |
| `plan.html` (frontend) | MODIFY | Add flight search screen (smart conditional) |
| `tests/unit/airports.test.js` | CREATE | IATA lookup unit tests |
| `tests/unit/constraint-deriv.test.js` | CREATE | Blocked-time derivation unit tests |
| `tests/unit/affiliate-flight.test.js` | CREATE | `flightLink()` Kiwi URL tests |
| `tests/integration/flights.test.js` | CREATE | `api/flights.js` handler tests |

---

## Task 1: Merge save.js into trip.js — free Vercel function slot

**Files:**
- Modify: `api/trip.js`
- Delete: `api/save.js`
- Modify: `vercel.json`

- [ ] **Step 1: Add POST (save) handler to trip.js**

Open `api/trip.js`. The file currently only handles GET. Add the full save logic from `api/save.js` under a method check. Replace the entire file content:

```js
/**
 * GET  /api/trip?id=<gist_id>  — load a trip plan
 * POST /api/trip                — save a trip plan (was /api/save)
 */
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const SHARE_BASE = 'https://tripva.app/trip';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // ── POST /api/save — merged here ──────────────────────────────────────────
  if (req.method === 'POST') {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(ip);
    res.setHeader('X-RateLimit-Limit', '10');
    res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'Too many requests', message: 'Rate limit: 10 requests per minute' });
    }

    const { plan } = req.body || {};
    if (!plan) return res.status(400).json({ error: 'Missing plan in request body' });

    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

    try {
      const ghRes = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Tripva/1.0',
        },
        body: JSON.stringify({
          description: `Tripva trip plan — ${plan?.trip?.name || 'Untitled'}`,
          public: false,
          files: { 'plan.json': { content: JSON.stringify(plan) } },
        }),
      });

      if (!ghRes.ok) {
        const errText = await ghRes.text();
        console.error('GitHub Gist error:', ghRes.status, errText);
        return res.status(502).json({ error: 'Failed to save plan', details: errText });
      }

      const gist = await ghRes.json();
      return res.status(200).json({ id: gist.id, url: `${SHARE_BASE}?id=${gist.id}` });
    } catch (err) {
      console.error('save error:', err);
      return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }

  // ── GET /api/trip?id=<gist_id> ────────────────────────────────────────────
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id parameter' });

  const token = process.env.GITHUB_TOKEN;

  try {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Tripva/1.0',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const ghRes = await fetch(`https://api.github.com/gists/${id}`, { headers });

    if (!ghRes.ok) {
      if (ghRes.status === 404) return res.status(404).json({ error: 'Trip not found' });
      return res.status(502).json({ error: 'Failed to load trip' });
    }

    const gist = await ghRes.json();
    const fileContent = gist.files?.['plan.json']?.content;
    if (!fileContent) return res.status(404).json({ error: 'Trip data not found in gist' });

    const plan = JSON.parse(fileContent);
    return res.status(200).json({ rawPlan: plan });
  } catch (err) {
    console.error('trip load error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
```

- [ ] **Step 2: Delete api/save.js**

```bash
rm api/save.js
```

- [ ] **Step 3: Update vercel.json — remove save.js, add save→trip rewrite**

In `vercel.json`:
1. Remove the `"api/save.js"` entry from the `functions` block.
2. Add this rewrite to the `rewrites` array (before the closing bracket):

```json
{
  "source": "/api/save",
  "destination": "/api/trip"
}
```

- [ ] **Step 4: Verify function count**

```bash
node -e "const v=JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('Functions:', Object.keys(v.functions).length)"
```

Expected output: `Functions: 11` (plan, patch, trip, stats, user, packing, admin, stripe, push, photospot — 10 existing minus save = 10, then flights will add 1 → 11 total; flights added in Task 2)

- [ ] **Step 5: Quick smoke test — save route still works**

```bash
curl -s -X POST http://localhost:3000/api/save \
  -H "Content-Type: application/json" \
  -d '{"plan":{"trip":{"name":"Test"}}}' | jq .
```

Expected: Either `{"id":"...","url":"..."}` or `{"error":"GITHUB_TOKEN not configured"}` (both valid — no 404/405).

- [ ] **Step 6: Commit**

```bash
git add api/trip.js api/save.js vercel.json
git commit -m "refactor: merge save.js into trip.js to free Vercel function slot"
```

---

## Task 2: Create lib/airports.js — static city→IATA map

**Files:**
- Create: `lib/airports.js`
- Create: `tests/unit/airports.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/airports.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { cityToIata, iataToCity } from '../../lib/airports.js';

describe('cityToIata', () => {
  it('returns IATA for exact city name', () => {
    expect(cityToIata('Tokyo')).toBe('TYO');
  });
  it('is case-insensitive', () => {
    expect(cityToIata('tokyo')).toBe('TYO');
    expect(cityToIata('KUALA LUMPUR')).toBe('KUL');
  });
  it('returns null for unknown city', () => {
    expect(cityToIata('Nonexistentville')).toBeNull();
  });
  it('handles common aliases', () => {
    expect(cityToIata('New York')).toBe('JFK');
    expect(cityToIata('London')).toBe('LON');
  });
});

describe('iataToCity', () => {
  it('returns city name for known code', () => {
    expect(iataToCity('KUL')).toBe('Kuala Lumpur');
  });
  it('returns null for unknown code', () => {
    expect(iataToCity('ZZZ')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/airports.test.js
```

Expected: FAIL with "Cannot find module '../../lib/airports.js'"

- [ ] **Step 3: Create lib/airports.js**

The data structure: two maps — `CITY_TO_IATA` (lowercase city name → IATA metro code) and `IATA_TO_CITY` (code → display name). Include top ~150 most-searched destinations now; comment with expansion note.

```js
// Top travel destinations — city name → IATA metro/airport code
// Add more entries as needed; kept sorted by region for readability.
const CITY_TO_IATA = {
  // Southeast Asia
  'kuala lumpur': 'KUL', 'kl': 'KUL',
  'singapore': 'SIN',
  'bangkok': 'BKK',
  'phuket': 'HKT',
  'chiang mai': 'CNX',
  'jakarta': 'CGK',
  'bali': 'DPS', 'denpasar': 'DPS',
  'ho chi minh city': 'SGN', 'saigon': 'SGN',
  'hanoi': 'HAN',
  'da nang': 'DAD',
  'manila': 'MNL',
  'cebu': 'CEB',
  'yangon': 'RGN',
  'phnom penh': 'PNH',
  'siem reap': 'REP',
  'vientiane': 'VTE',
  'colombo': 'CMB',
  'kathmandu': 'KTM',
  // East Asia
  'tokyo': 'TYO',
  'osaka': 'OSA',
  'kyoto': 'UKY',
  'seoul': 'SEL',
  'busan': 'PUS',
  'beijing': 'BJS',
  'shanghai': 'SHA',
  'hong kong': 'HKG',
  'taipei': 'TPE',
  'macau': 'MFM',
  // South Asia
  'delhi': 'DEL', 'new delhi': 'DEL',
  'mumbai': 'BOM', 'bombay': 'BOM',
  'bangalore': 'BLR', 'bengaluru': 'BLR',
  'chennai': 'MAA',
  'hyderabad': 'HYD',
  'goa': 'GOI',
  'dhaka': 'DAC',
  'karachi': 'KHI',
  'lahore': 'LHE',
  // Middle East
  'dubai': 'DXB',
  'abu dhabi': 'AUH',
  'doha': 'DOH',
  'riyadh': 'RUH',
  'kuwait': 'KWI', 'kuwait city': 'KWI',
  'muscat': 'MCT',
  'beirut': 'BEY',
  'tel aviv': 'TLV',
  'amman': 'AMM',
  'istanbul': 'IST',
  // Europe
  'london': 'LON',
  'paris': 'PAR',
  'amsterdam': 'AMS',
  'frankfurt': 'FRA',
  'munich': 'MUC',
  'berlin': 'BER',
  'madrid': 'MAD',
  'barcelona': 'BCN',
  'rome': 'ROM',
  'milan': 'MIL',
  'venice': 'VCE',
  'florence': 'FLR',
  'naples': 'NAP',
  'vienna': 'VIE',
  'zurich': 'ZRH',
  'geneva': 'GVA',
  'brussels': 'BRU',
  'copenhagen': 'CPH',
  'oslo': 'OSL',
  'stockholm': 'STO',
  'helsinki': 'HEL',
  'lisbon': 'LIS',
  'porto': 'OPO',
  'athens': 'ATH',
  'prague': 'PRG',
  'warsaw': 'WAW',
  'budapest': 'BUD',
  'bucharest': 'OTP',
  'sofia': 'SOF',
  'zagreb': 'ZAG',
  'dubrovnik': 'DBV',
  'split': 'SPU',
  'reykjavik': 'REK',
  'edinburgh': 'EDI',
  'dublin': 'DUB',
  'nice': 'NCE',
  'lyon': 'LYS',
  'marseille': 'MRS',
  'zurich': 'ZRH',
  // Africa
  'cairo': 'CAI',
  'casablanca': 'CAS',
  'nairobi': 'NBO',
  'johannesburg': 'JNB',
  'cape town': 'CPT',
  'accra': 'ACC',
  'lagos': 'LOS',
  'addis ababa': 'ADD',
  'dar es salaam': 'DAR',
  'mauritius': 'MRU',
  // North America
  'new york': 'JFK', 'nyc': 'JFK',
  'los angeles': 'LAX', 'la': 'LAX',
  'miami': 'MIA',
  'chicago': 'CHI',
  'toronto': 'YYZ',
  'vancouver': 'YVR',
  'montreal': 'YUL',
  'san francisco': 'SFO',
  'las vegas': 'LAS',
  'seattle': 'SEA',
  'boston': 'BOS',
  'washington': 'WAS', 'washington dc': 'WAS',
  'dallas': 'DFW',
  'houston': 'IAH',
  'atlanta': 'ATL',
  'mexico city': 'MEX',
  'cancun': 'CUN',
  // South America & Caribbean
  'sao paulo': 'SAO',
  'rio de janeiro': 'RIO',
  'buenos aires': 'BUE',
  'bogota': 'BOG',
  'lima': 'LIM',
  'santiago': 'SCL',
  'havana': 'HAV',
  'san jose': 'SJO',
  // Oceania
  'sydney': 'SYD',
  'melbourne': 'MEL',
  'brisbane': 'BNE',
  'perth': 'PER',
  'auckland': 'AKL',
  'christchurch': 'CHC',
  'fiji': 'NAN', 'nadi': 'NAN',
  // Indian Ocean / Islands
  'maldives': 'MLE', 'male': 'MLE',
  'seychelles': 'SEZ',
  'zanzibar': 'ZNZ',
};

const IATA_TO_CITY = {
  'KUL': 'Kuala Lumpur', 'SIN': 'Singapore', 'BKK': 'Bangkok',
  'HKT': 'Phuket', 'CNX': 'Chiang Mai', 'CGK': 'Jakarta',
  'DPS': 'Bali', 'SGN': 'Ho Chi Minh City', 'HAN': 'Hanoi',
  'DAD': 'Da Nang', 'MNL': 'Manila', 'CEB': 'Cebu',
  'RGN': 'Yangon', 'PNH': 'Phnom Penh', 'REP': 'Siem Reap',
  'VTE': 'Vientiane', 'CMB': 'Colombo', 'KTM': 'Kathmandu',
  'TYO': 'Tokyo', 'OSA': 'Osaka', 'UKY': 'Kyoto',
  'SEL': 'Seoul', 'PUS': 'Busan', 'BJS': 'Beijing',
  'SHA': 'Shanghai', 'HKG': 'Hong Kong', 'TPE': 'Taipei', 'MFM': 'Macau',
  'DEL': 'Delhi', 'BOM': 'Mumbai', 'BLR': 'Bangalore',
  'MAA': 'Chennai', 'HYD': 'Hyderabad', 'GOI': 'Goa',
  'DAC': 'Dhaka', 'KHI': 'Karachi', 'LHE': 'Lahore',
  'DXB': 'Dubai', 'AUH': 'Abu Dhabi', 'DOH': 'Doha',
  'RUH': 'Riyadh', 'KWI': 'Kuwait City', 'MCT': 'Muscat',
  'BEY': 'Beirut', 'TLV': 'Tel Aviv', 'AMM': 'Amman', 'IST': 'Istanbul',
  'LON': 'London', 'PAR': 'Paris', 'AMS': 'Amsterdam',
  'FRA': 'Frankfurt', 'MUC': 'Munich', 'BER': 'Berlin',
  'MAD': 'Madrid', 'BCN': 'Barcelona', 'ROM': 'Rome', 'MIL': 'Milan',
  'VCE': 'Venice', 'FLR': 'Florence', 'NAP': 'Naples',
  'VIE': 'Vienna', 'ZRH': 'Zurich', 'GVA': 'Geneva', 'BRU': 'Brussels',
  'CPH': 'Copenhagen', 'OSL': 'Oslo', 'STO': 'Stockholm', 'HEL': 'Helsinki',
  'LIS': 'Lisbon', 'OPO': 'Porto', 'ATH': 'Athens', 'PRG': 'Prague',
  'WAW': 'Warsaw', 'BUD': 'Budapest', 'OTP': 'Bucharest',
  'SOF': 'Sofia', 'ZAG': 'Zagreb', 'DBV': 'Dubrovnik', 'SPU': 'Split',
  'REK': 'Reykjavik', 'EDI': 'Edinburgh', 'DUB': 'Dublin',
  'NCE': 'Nice', 'LYS': 'Lyon', 'MRS': 'Marseille',
  'CAI': 'Cairo', 'CAS': 'Casablanca', 'NBO': 'Nairobi',
  'JNB': 'Johannesburg', 'CPT': 'Cape Town', 'ACC': 'Accra',
  'LOS': 'Lagos', 'ADD': 'Addis Ababa', 'DAR': 'Dar es Salaam', 'MRU': 'Mauritius',
  'JFK': 'New York', 'LAX': 'Los Angeles', 'MIA': 'Miami',
  'CHI': 'Chicago', 'YYZ': 'Toronto', 'YVR': 'Vancouver', 'YUL': 'Montreal',
  'SFO': 'San Francisco', 'LAS': 'Las Vegas', 'SEA': 'Seattle',
  'BOS': 'Boston', 'WAS': 'Washington DC', 'DFW': 'Dallas', 'IAH': 'Houston',
  'ATL': 'Atlanta', 'MEX': 'Mexico City', 'CUN': 'Cancun',
  'SAO': 'São Paulo', 'RIO': 'Rio de Janeiro', 'BUE': 'Buenos Aires',
  'BOG': 'Bogotá', 'LIM': 'Lima', 'SCL': 'Santiago', 'HAV': 'Havana',
  'SJO': 'San José',
  'SYD': 'Sydney', 'MEL': 'Melbourne', 'BNE': 'Brisbane',
  'PER': 'Perth', 'AKL': 'Auckland', 'CHC': 'Christchurch', 'NAN': 'Fiji',
  'MLE': 'Maldives', 'SEZ': 'Seychelles', 'ZNZ': 'Zanzibar',
};

/**
 * Returns the IATA metro/airport code for a city name, or null if not found.
 * @param {string} city
 * @returns {string|null}
 */
export function cityToIata(city) {
  if (!city) return null;
  return CITY_TO_IATA[city.toLowerCase().trim()] ?? null;
}

/**
 * Returns the display city name for an IATA code, or null if not found.
 * @param {string} code
 * @returns {string|null}
 */
export function iataToCity(code) {
  if (!code) return null;
  return IATA_TO_CITY[code.toUpperCase().trim()] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/airports.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/airports.js tests/unit/airports.test.js
git commit -m "feat: add static city→IATA airport lookup (lib/airports.js)"
```

---

## Task 3: Create api/flights.js — Kiwi Tequila proxy

**Files:**
- Create: `api/flights.js`
- Modify: `vercel.json` (add flights function)
- Create: `tests/integration/flights.test.js`

**Environment variable needed:** `KIWI_API_KEY` — must be set in Vercel dashboard before deploying.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/flights.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch for integration test
global.fetch = vi.fn();

const makeReq = (body, query = {}) => ({
  method: 'POST',
  body,
  query,
  headers: { 'origin': 'https://tripva.app' },
});

const makeRes = () => {
  const res = { _status: 200, _body: null, _headers: {} };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  res.setHeader = (k, v) => { res._headers[k] = v; };
  res.end = () => {};
  return res;
};

describe('api/flights.js', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.KIWI_API_KEY = 'test-key'; });

  it('returns 400 when from is missing', async () => {
    const { default: handler } = await import('../../api/flights.js');
    const req = makeReq({ to: 'NRT', date: '2024-10-01', travelers: 2 });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/from/i);
  });

  it('returns flights array from Kiwi on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'f1', price: 450, airlines: ['MH'] }] }),
    });
    const { default: handler } = await import('../../api/flights.js');
    const req = makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 2 });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(Array.isArray(res._body.flights)).toBe(true);
    expect(res._body.flights.length).toBe(1);
  });

  it('returns empty array when Kiwi returns no data', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });
    const { default: handler } = await import('../../api/flights.js');
    const req = makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 2 });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.flights).toEqual([]);
  });

  it('returns 503 when KIWI_API_KEY not set', async () => {
    delete process.env.KIWI_API_KEY;
    const { default: handler } = await import('../../api/flights.js');
    const req = makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 2 });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/integration/flights.test.js
```

Expected: FAIL with "Cannot find module '../../api/flights.js'"

- [ ] **Step 3: Create api/flights.js**

```js
/**
 * POST /api/flights
 * Proxy to Kiwi Tequila flight search API.
 * Body: { from: "KUL", to: "NRT", date: "YYYY-MM-DD", returnDate?: "YYYY-MM-DD", travelers?: 2 }
 * Returns: { flights: [ { id, price, currency, airlines, departure, arrival, duration, deepLink } ] }
 */
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const KIWI_BASE = 'https://tequila.kiwi.com/v2/search';
const KIWI_AFFILIATE = process.env.KIWI_AFFILIATE_ID || '';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.KIWI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Flight search unavailable' });

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Too many requests' });

  const { from, to, date, returnDate, travelers = 2 } = req.body || {};

  if (!from) return res.status(400).json({ error: 'from (IATA code) is required' });
  if (!to)   return res.status(400).json({ error: 'to (IATA code) is required' });
  if (!date) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });

  // Kiwi expects date as DD/MM/YYYY
  const fmtDate = (ymd) => {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  };

  const params = new URLSearchParams({
    fly_from: from,
    fly_to:   to,
    date_from: fmtDate(date),
    date_to:   fmtDate(date),
    adults:    String(travelers),
    curr:      'USD',
    limit:     '10',
    sort:      'price',
    one_for_city: '1',
  });

  if (returnDate) {
    params.set('return_from', fmtDate(returnDate));
    params.set('return_to',   fmtDate(returnDate));
  }

  try {
    const kiwiRes = await fetch(`${KIWI_BASE}?${params.toString()}`, {
      headers: { 'apikey': apiKey },
    });

    if (!kiwiRes.ok) {
      console.error('[flights] Kiwi error:', kiwiRes.status);
      return res.status(502).json({ error: 'Flight search failed' });
    }

    const data = await kiwiRes.json();
    const raw = Array.isArray(data?.data) ? data.data : [];

    const flights = raw.map((f) => {
      const dep = f.route?.[0];
      const arr = f.route?.[f.route.length - 1];
      // Build Kiwi booking deep-link
      const bookingUrl = buildKiwiDeepLink(f, KIWI_AFFILIATE);
      return {
        id:          f.id,
        price:       f.price,
        currency:    data.currency || 'USD',
        airlines:    f.airlines || [],
        departure:   dep ? { iata: dep.flyFrom, time: dep.local_departure } : null,
        arrival:     arr ? { iata: arr.flyTo,   time: arr.local_arrival   } : null,
        duration:    f.duration?.total ?? null,
        stops:       (f.route?.length ?? 1) - 1,
        deepLink:    bookingUrl,
      };
    });

    return res.status(200).json({ flights });
  } catch (err) {
    console.error('[flights] unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}

function buildKiwiDeepLink(flight, affiliateId) {
  // Kiwi booking link — affilid param triggers affiliate tracking
  const base = 'https://www.kiwi.com/booking';
  const params = new URLSearchParams({ token: flight.booking_token || '' });
  if (affiliateId) params.set('affilid', affiliateId);
  return `${base}?${params.toString()}`;
}
```

- [ ] **Step 4: Add flights to vercel.json functions block**

In `vercel.json`, add to the `functions` object:

```json
"api/flights.js": {
  "maxDuration": 30
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/integration/flights.test.js
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add api/flights.js vercel.json tests/integration/flights.test.js
git commit -m "feat: add /api/flights Kiwi Tequila proxy endpoint"
```

---

## Task 4: Strengthen constraint awareness in lib/prompt.js

**Files:**
- Modify: `lib/prompt.js` (anchorsBlock section, lines ~463-487)
- Create: `tests/unit/constraint-deriv.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/constraint-deriv.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { deriveConstraintLines } from '../../lib/prompt.js';

describe('deriveConstraintLines', () => {
  it('generates arrival block for inbound flight', () => {
    const anchor = {
      type: 'flight',
      from: 'KUL',
      to: 'NRT',
      date: '2024-10-01',
      arrivalTime: '15:30',
    };
    const lines = deriveConstraintLines([anchor]);
    expect(lines).toContain('2024-10-01');
    expect(lines).toMatch(/ARRIVAL DAY/i);
    expect(lines).toMatch(/17:00/);  // 15:30 + 90 min transit buffer
  });

  it('generates departure block for outbound flight', () => {
    const anchor = {
      type: 'flight',
      from: 'NRT',
      to: 'KUL',
      date: '2024-10-07',
      departureTime: '09:30',
    };
    const lines = deriveConstraintLines([anchor]);
    expect(lines).toContain('2024-10-07');
    expect(lines).toMatch(/DEPARTURE DAY/i);
    expect(lines).toMatch(/07:30/);  // 09:30 - 2h airport buffer
  });

  it('returns empty string for hotel-only anchors', () => {
    const anchor = {
      type: 'hotel',
      city: 'Tokyo',
      checkinDate: '2024-10-01',
      checkoutDate: '2024-10-05',
    };
    const result = deriveConstraintLines([anchor]);
    expect(result).toBe('');
  });

  it('handles missing times gracefully', () => {
    const anchor = { type: 'flight', from: 'KUL', to: 'NRT', date: '2024-10-01' };
    expect(() => deriveConstraintLines([anchor])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/constraint-deriv.test.js
```

Expected: FAIL with "deriveConstraintLines is not a function" (not yet exported)

- [ ] **Step 3: Add deriveConstraintLines to lib/prompt.js**

Add this function near the top of `lib/prompt.js` (before `buildPlanPrompt`):

```js
/**
 * Derives per-day blocked time windows from booking anchors.
 * Returns a multi-line string to inject into the prompt, or '' if no time constraints.
 */
export function deriveConstraintLines(anchors) {
  if (!Array.isArray(anchors) || anchors.length === 0) return '';

  const lines = [];

  for (const a of anchors) {
    if (a.type === 'flight' || a.type === 'train') {
      // Inbound (arrival anchor): block the morning until arrival + transit buffer
      if (a.arrivalTime && a.date) {
        const [h, m] = a.arrivalTime.split(':').map(Number);
        // 90 min buffer after landing for transit, baggage, getting to hotel
        const bufMin = h * 60 + m + 90;
        const bufH = String(Math.floor(bufMin / 60)).padStart(2, '0');
        const bufM = String(bufMin % 60).padStart(2, '0');
        lines.push(
          `${a.date}: ARRIVAL DAY — do not schedule activities before ${bufH}:${bufM} ` +
          `(${a.type} arrives ${a.from}→${a.to} at ${a.arrivalTime}, +90 min transit buffer). ` +
          `First activity no earlier than ${bufH}:${bufM}.`
        );
      }
      // Outbound (departure anchor): block from airport-by time onwards
      if (a.departureTime && a.date && !a.arrivalTime) {
        const [h, m] = a.departureTime.split(':').map(Number);
        // 2h airport buffer before departure
        const bufMin = h * 60 + m - 120;
        const bufH = String(Math.max(0, Math.floor(bufMin / 60))).padStart(2, '0');
        const bufM = String(Math.max(0, bufMin % 60)).padStart(2, '0');
        lines.push(
          `${a.date}: DEPARTURE DAY — all activities must end by ${bufH}:${bufM} ` +
          `(${a.type} departs ${a.from}→${a.to} at ${a.departureTime}, -2h airport buffer). ` +
          `Must be at airport by ${bufH}:${bufM}.`
        );
      }
    }
    // Hotel anchors: no time-of-day constraint, already handled by date anchoring
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Inject constraint lines into anchorsBlock in buildPlanPrompt**

Find the `anchorsBlock` section in `lib/prompt.js` (around line 463-487). Replace the closing `'Rules: ...'` line:

**Find:**
```js
      'Rules: flight/train date = transit day (no sightseeing during travel). Hotel anchor = use that hotel; do NOT suggest alternatives for those nights. Respect departure times (early flight = previous night in origin city).\n'
```

**Replace with:**
```js
      'Rules: flight/train date = transit day (no sightseeing during travel). Hotel anchor = use that hotel; do NOT suggest alternatives for those nights.\n' +
      (() => {
        const constraintLines = deriveConstraintLines(anchors);
        return constraintLines ? 'PER-DAY TIME CONSTRAINTS (hard — ignore at your peril):\n' + constraintLines + '\n' : '';
      })()
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/constraint-deriv.test.js
```

Expected: All tests PASS.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/prompt.js tests/unit/constraint-deriv.test.js
git commit -m "feat: derive per-day blocked time windows from booking anchors"
```

---

## Task 5: Update flightLink() to Kiwi affiliate URL

**Files:**
- Modify: `lib/affiliate.js` (lines 183-188)
- Create: `tests/unit/affiliate-flight.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/affiliate-flight.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';

describe('flightLink', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns Kiwi deep-link URL', async () => {
    process.env.KIWI_AFFILIATE_ID = 'myaffilid';
    const { flightLink } = await import('../../lib/affiliate.js');
    const url = flightLink({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 2 });
    expect(url).toContain('kiwi.com');
    expect(url).toContain('KUL');
    expect(url).toContain('NRT');
    expect(url).toContain('myaffilid');
  });

  it('includes return date when provided', async () => {
    const { flightLink } = await import('../../lib/affiliate.js');
    const url = flightLink({ from: 'KUL', to: 'NRT', date: '2024-10-01', returnDate: '2024-10-08', travelers: 2 });
    expect(url).toContain('2024-10-08');
  });

  it('works without affiliate ID', async () => {
    delete process.env.KIWI_AFFILIATE_ID;
    const { flightLink } = await import('../../lib/affiliate.js');
    const url = flightLink({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 1 });
    expect(url).toContain('kiwi.com');
    expect(() => new URL(url)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/affiliate-flight.test.js
```

Expected: FAIL (current URL contains `google.com/flights`, not `kiwi.com`)

- [ ] **Step 3: Update flightLink() in lib/affiliate.js**

Find the `flightLink` function (around line 183) and replace it:

**Find:**
```js
export function flightLink({ from, to, date, returnDate = '', travelers = 2 }) {
  const trip = returnDate
    ? `${from}/${to}/${date}/${returnDate}`
    : `${from}/${to}/${date}`;
  return `https://www.google.com/flights#flt=${trip};c:USD;e:1;s:0;sd:1;t:f;px:${travelers}`;
}
```

**Replace with:**
```js
export function flightLink({ from, to, date, returnDate = '', travelers = 2 }) {
  const params = new URLSearchParams({
    fly_from:    from,
    fly_to:      to,
    date_from:   date,
    date_to:     date,
    adults:      String(travelers),
    curr:        'USD',
    one_for_city: '1',
  });
  if (returnDate) {
    params.set('return_from', returnDate);
    params.set('return_to',   returnDate);
  }
  const affiliateId = process.env.KIWI_AFFILIATE_ID || '';
  if (affiliateId) params.set('affilid', affiliateId);
  return `https://www.kiwi.com/us/search/results?${params.toString()}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/affiliate-flight.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/affiliate.js tests/unit/affiliate-flight.test.js
git commit -m "feat: update flightLink() to Kiwi affiliate deep-link URL"
```

---

## Task 6: Add flight search screen to plan.html (frontend)

**Files:**
- Modify: `tripva-frontend/plan.html` (or equivalent frontend file)

**Note:** The frontend lives in a separate repo at `/home/alex/.openclaw/workspace-travelapp/tripva-frontend/`. All changes in this task are to `plan.html` in that repo.

**UX logic:**
- After the booking-anchor section, show the flight search screen only if `_bookingAnchors.length === 0` (user hasn't already uploaded their flights)
- Flight search screen: two city inputs (from + to), date picker, travelers count, Search button + Skip button
- On search: call `POST /api/flights` with IATA codes (looked up via `cityToIata()` inlined in plan.html)
- Results: show up to 10 flight cards (airline, departure time, arrival time, price, stops)
- On "Select": push a booking anchor into `_bookingAnchors` with the flight's departure/arrival times → proceed to spot selector
- "Skip": proceed to spot selector without adding a flight anchor

- [ ] **Step 1: Read the current plan.html to find the right insertion point**

```bash
grep -n "showSpotSelector\|bookingSection\|_bookingAnchors\|customSpotSection" plan.html | head -30
```

Note the line numbers for `showSpotSelector()` and the booking section end.

- [ ] **Step 2: Add the flight search screen HTML**

Find where `showSpotSelector()` is called from the booking section (the "Next →" or equivalent button after anchors). Before that call, insert a new screen div:

```html
<!-- ── Flight search screen (shown when no booking anchors) ───────────── -->
<div id="flightSearchScreen" style="display:none; padding:24px 16px; max-width:480px; margin:0 auto;">
  <h2 style="font-family:'Cormorant Garamond',serif; font-size:1.8rem; margin:0 0 8px;">Find flights</h2>
  <p style="color:#666; margin:0 0 24px; font-size:0.95rem;">We'll find options that fit your budget and lock in your exact travel dates.</p>

  <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
    <div>
      <label style="font-size:0.8rem; font-weight:600; color:#444; text-transform:uppercase; letter-spacing:.05em;">Flying from</label>
      <input id="flightFrom" type="text" placeholder="City or airport (e.g. Kuala Lumpur)"
        style="width:100%; padding:12px 14px; border:1.5px solid #ddd; border-radius:10px; font-size:1rem; box-sizing:border-box; margin-top:4px;" />
    </div>
    <div>
      <label style="font-size:0.8rem; font-weight:600; color:#444; text-transform:uppercase; letter-spacing:.05em;">Flying to</label>
      <input id="flightTo" type="text" placeholder="City or airport (e.g. Tokyo)"
        style="width:100%; padding:12px 14px; border:1.5px solid #ddd; border-radius:10px; font-size:1rem; box-sizing:border-box; margin-top:4px;" />
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#444; text-transform:uppercase; letter-spacing:.05em;">Depart</label>
        <input id="flightDate" type="date"
          style="width:100%; padding:12px 14px; border:1.5px solid #ddd; border-radius:10px; font-size:1rem; box-sizing:border-box; margin-top:4px;" />
      </div>
      <div>
        <label style="font-size:0.8rem; font-weight:600; color:#444; text-transform:uppercase; letter-spacing:.05em;">Travelers</label>
        <input id="flightTravelers" type="number" min="1" max="9" value="2"
          style="width:100%; padding:12px 14px; border:1.5px solid #ddd; border-radius:10px; font-size:1rem; box-sizing:border-box; margin-top:4px;" />
      </div>
    </div>
  </div>

  <button onclick="searchFlights()"
    style="width:100%; padding:14px; background:#1a1a1a; color:#fff; border:none; border-radius:12px; font-size:1rem; font-weight:600; cursor:pointer; margin-bottom:10px;">
    Search flights
  </button>
  <button onclick="skipFlightSearch()"
    style="width:100%; padding:14px; background:transparent; color:#666; border:1.5px solid #ddd; border-radius:12px; font-size:1rem; cursor:pointer;">
    Skip — I'll book flights separately
  </button>

  <div id="flightResults" style="margin-top:24px;"></div>
</div>
```

- [ ] **Step 3: Add the JS functions for flight search**

Add these functions to the `<script>` block in plan.html:

```js
// Minimal city→IATA lookup (matches lib/airports.js — keep in sync)
const CITY_IATA = {
  'kuala lumpur':'KUL','kl':'KUL','singapore':'SIN','bangkok':'BKK',
  'phuket':'HKT','chiang mai':'CNX','jakarta':'CGK','bali':'DPS',
  'ho chi minh city':'SGN','saigon':'SGN','hanoi':'HAN','da nang':'DAD',
  'manila':'MNL','cebu':'CEB','yangon':'RGN','phnom penh':'PNH',
  'siem reap':'REP','vientiane':'VTE','colombo':'CMB','kathmandu':'KTM',
  'tokyo':'TYO','osaka':'OSA','kyoto':'UKY','seoul':'SEL','busan':'PUS',
  'beijing':'BJS','shanghai':'SHA','hong kong':'HKG','taipei':'TPE',
  'delhi':'DEL','new delhi':'DEL','mumbai':'BOM','bangalore':'BLR',
  'goa':'GOI','dubai':'DXB','abu dhabi':'AUH','doha':'DOH','istanbul':'IST',
  'london':'LON','paris':'PAR','amsterdam':'AMS','frankfurt':'FRA',
  'berlin':'BER','madrid':'MAD','barcelona':'BCN','rome':'ROM','milan':'MIL',
  'vienna':'VIE','zurich':'ZRH','lisbon':'LIS','athens':'ATH','prague':'PRG',
  'new york':'JFK','nyc':'JFK','los angeles':'LAX','miami':'MIA',
  'toronto':'YYZ','sydney':'SYD','melbourne':'MEL','auckland':'AKL',
  'maldives':'MLE','male':'MLE',
};

function cityToIata(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  // If it looks like an IATA code already, use it directly
  if (/^[A-Z]{3}$/.test(name.trim())) return name.trim();
  return CITY_IATA[lower] || null;
}

async function searchFlights() {
  const fromRaw = document.getElementById('flightFrom').value.trim();
  const toRaw   = document.getElementById('flightTo').value.trim();
  const date    = document.getElementById('flightDate').value;
  const travelers = parseInt(document.getElementById('flightTravelers').value) || 2;

  const from = cityToIata(fromRaw);
  const to   = cityToIata(toRaw);
  const resultsDiv = document.getElementById('flightResults');

  if (!from) {
    resultsDiv.innerHTML = `<p style="color:#c00;">Couldn't find airport for "${fromRaw}". Try entering the IATA code (e.g. KUL).</p>`;
    return;
  }
  if (!to) {
    resultsDiv.innerHTML = `<p style="color:#c00;">Couldn't find airport for "${toRaw}". Try entering the IATA code (e.g. NRT).</p>`;
    return;
  }
  if (!date) {
    resultsDiv.innerHTML = `<p style="color:#c00;">Please select a departure date.</p>`;
    return;
  }

  resultsDiv.innerHTML = `<p style="color:#666; text-align:center;">Searching flights...</p>`;

  try {
    const resp = await fetch('/api/flights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, date, travelers }),
    });
    const data = await resp.json();

    if (!resp.ok || !data.flights) {
      resultsDiv.innerHTML = `<p style="color:#c00;">Flight search failed. Try again or skip.</p>`;
      return;
    }

    if (data.flights.length === 0) {
      resultsDiv.innerHTML = `<p style="color:#666; text-align:center;">No flights found. Try different dates or skip.</p>`;
      return;
    }

    resultsDiv.innerHTML = data.flights.map((f, i) => `
      <div style="border:1.5px solid #eee; border-radius:12px; padding:16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:700; font-size:1.1rem;">$${f.price} <span style="font-size:0.85rem; font-weight:400; color:#888;">${f.currency}</span></span>
          <span style="font-size:0.8rem; color:#888;">${f.stops === 0 ? 'Direct' : f.stops + ' stop' + (f.stops > 1 ? 's' : '')}</span>
        </div>
        <div style="font-size:0.95rem; color:#333;">
          ${f.departure ? f.departure.iata + ' ' + (f.departure.time || '').slice(11,16) : from}
          → ${f.arrival ? f.arrival.iata + ' ' + (f.arrival.time || '').slice(11,16) : to}
        </div>
        <div style="font-size:0.8rem; color:#888; margin-top:4px;">${(f.airlines || []).join(', ')}</div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button onclick="selectFlight(${i})" data-flight='${JSON.stringify(f)}'
            style="flex:1; padding:10px; background:#1a1a1a; color:#fff; border:none; border-radius:8px; font-size:0.9rem; cursor:pointer; font-weight:600;">
            Select this flight
          </button>
          <a href="${f.deepLink}" target="_blank"
            style="padding:10px 14px; border:1.5px solid #ddd; border-radius:8px; font-size:0.9rem; color:#333; text-decoration:none; display:flex; align-items:center;">
            View →
          </a>
        </div>
      </div>
    `).join('');

    // Store flights for selectFlight()
    window._lastFlightResults = data.flights;
  } catch (err) {
    resultsDiv.innerHTML = `<p style="color:#c00;">Connection error. Please try again.</p>`;
  }
}

function selectFlight(index) {
  const f = window._lastFlightResults?.[index];
  if (!f) return;

  // Build a booking anchor from the selected flight
  const dep = f.departure;
  const arr = f.arrival;
  const anchor = {
    type: 'flight',
    from:          dep?.iata || '',
    to:            arr?.iata || '',
    date:          dep?.time ? dep.time.slice(0, 10) : '',
    departureTime: dep?.time ? dep.time.slice(11, 16) : null,
    arrivalTime:   arr?.time ? arr.time.slice(11, 16) : null,
    summary:       `${(f.airlines||[]).join('/')} ${dep?.iata||''}→${arr?.iata||''} $${f.price}`,
    bookingUrl:    f.deepLink,
  };

  if (!Array.isArray(window._bookingAnchors)) window._bookingAnchors = [];
  window._bookingAnchors.push(anchor);

  // Proceed to spot selector
  document.getElementById('flightSearchScreen').style.display = 'none';
  showSpotSelector();
}

function skipFlightSearch() {
  document.getElementById('flightSearchScreen').style.display = 'none';
  showSpotSelector();
}

function maybeShowFlightSearch(destination) {
  const anchors = window._bookingAnchors || [];
  if (anchors.length === 0) {
    // Pre-fill destination as "to" if we can derive it
    const toInput = document.getElementById('flightTo');
    if (toInput && destination) toInput.value = destination;
    document.getElementById('flightSearchScreen').style.display = 'block';
    document.getElementById('flightSearchScreen').scrollIntoView({ behavior: 'smooth' });
  } else {
    showSpotSelector();
  }
}
```

- [ ] **Step 4: Wire maybeShowFlightSearch into the booking flow**

Find where `showSpotSelector()` is called after the booking-anchor "Next" button in plan.html. Replace that call with `maybeShowFlightSearch(currentDestination)`. For example:

**Find (approximate — adapt to actual code):**
```js
// After booking anchors next button click handler:
showSpotSelector();
```

**Replace with:**
```js
maybeShowFlightSearch(_destinations?.[0] || '');
```

- [ ] **Step 5: Manual test — open the form in browser**

```bash
# Start dev server if not running
cd /home/alex/.openclaw/workspace-travelapp/tripva-frontend
# (start dev server per project convention)
```

Then verify:
1. Open the plan form
2. Do NOT upload any booking
3. Click the "Next" button after the booking section — flight search screen should appear
4. Enter "Kuala Lumpur" in from, "Tokyo" in to, pick a date, click Search
5. Flights should appear (or a "no results" message — both OK)
6. Click "Skip" — should go to spot selector

- [ ] **Step 6: Commit (frontend repo)**

```bash
git add plan.html
git commit -m "feat: add conditional flight search screen with Kiwi integration"
```

---

## Task 7: Deploy and verify

- [ ] **Step 1: Merge feat/booking-anchors to main in tripva-backend**

```bash
git checkout main
git merge feat/booking-anchors --no-ff -m "feat: flight search + constraint awareness"
```

- [ ] **Step 2: Push to trigger Vercel deploy**

```bash
git push origin main
```

- [ ] **Step 3: Add KIWI_API_KEY to Vercel environment**

In the Vercel dashboard (or via CLI):
```bash
vercel env add KIWI_API_KEY production
vercel env add KIWI_AFFILIATE_ID production
```

- [ ] **Step 4: Verify /api/flights responds**

```bash
curl -s -X POST https://tripva.app/api/flights \
  -H "Content-Type: application/json" \
  -d '{"from":"KUL","to":"NRT","date":"2024-12-01","travelers":2}' | jq '{count: (.flights | length)}'
```

Expected: `{"count": N}` (N ≥ 0)

- [ ] **Step 5: Verify constraint awareness — generate a plan with an arrival anchor**

Use the parse-booking endpoint to create an anchor, then generate a plan. Verify the generated Day 1 timeline starts at the expected blocked time.

- [ ] **Step 6: Run full test suite one final time**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 7: Commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: post-deploy cleanup"
```
