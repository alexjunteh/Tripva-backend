/**
 * POST /api/flights
 * Proxy to SerpAPI Google Flights.
 * Body: { from: "KUL", to: "NRT", date: "YYYY-MM-DD", returnDate?: "YYYY-MM-DD", travelers?: 2 }
 * Returns: { flights: [...] }
 *
 * Requires env: SERPAPI_KEY (serpapi.com — 250 free searches/month)
 */
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const SERPAPI_BASE = 'https://serpapi.com/search.json';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Flight search unavailable' });

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  res.setHeader('X-RateLimit-Reset', rateCheck.resetAt);
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Too many requests' });

  const { from, to, date, returnDate, travelers = 2 } = req.body || {};

  if (!from) return res.status(400).json({ error: 'from (IATA code) is required' });
  if (!to)   return res.status(400).json({ error: 'to (IATA code) is required' });
  if (!date) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD format' });
  if (returnDate && !DATE_RE.test(returnDate)) return res.status(400).json({ error: 'returnDate must be YYYY-MM-DD format' });

  const adultCount = Math.max(1, Math.min(9, parseInt(travelers) || 2));

  const params = new URLSearchParams({
    engine:         'google_flights',
    departure_id:   from.toUpperCase(),
    arrival_id:     to.toUpperCase(),
    outbound_date:  date,
    adults:         String(adultCount),
    currency:       'USD',
    hl:             'en',
    type:           returnDate ? '1' : '2', // 1=round trip, 2=one way
    api_key:        apiKey,
  });
  if (returnDate) params.set('return_date', returnDate);

  try {
    const r = await fetch(`${SERPAPI_BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(20000),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('[flights] SerpAPI error:', r.status, err);
      return res.status(502).json({ error: 'Flight search failed' });
    }

    const data = await r.json();
    const raw = [
      ...(Array.isArray(data.best_flights)  ? data.best_flights  : []),
      ...(Array.isArray(data.other_flights) ? data.other_flights : []),
    ].slice(0, 10);

    const tripcomCode = process.env.TRIPCOM_ALLIANCE_CODE || '';

    const flights = raw.map((it, idx) => {
      const segs     = Array.isArray(it.flights) ? it.flights : [];
      const first    = segs[0] || {};
      const last     = segs[segs.length - 1] || first;
      const airlines = [...new Set(segs.map(s => s.airline).filter(Boolean))];

      // Google Flights deep link
      const gfDate = date.replace(/-/g, '');
      const bookingLink = `https://www.google.com/flights?hl=en#flt=${from}.${to}.${gfDate}`;

      const tcParams = new URLSearchParams({ from, to, date, adult: String(adultCount) });
      if (tripcomCode) tcParams.set('alliancecode', tripcomCode);

      return {
        id:          `gf-${idx}`,
        price:       typeof it.price === 'number' ? it.price : null,
        currency:    'USD',
        airlines,
        airlineLogos: segs.map(s => s.airline_logo).filter(Boolean),
        departure:   first.departure_airport ? {
          iata: first.departure_airport.id,
          time: first.departure_airport.time,
        } : null,
        arrival: last.arrival_airport ? {
          iata: last.arrival_airport.id,
          time: last.arrival_airport.time,
        } : null,
        durationSec: it.total_duration ? it.total_duration * 60 : null,
        stops:       Math.max(0, segs.length - 1),
        bookingLink,
        tripcomLink: `https://www.trip.com/flights/?${tcParams.toString()}`,
      };
    });

    return res.status(200).json({ flights });
  } catch (err) {
    console.error('[flights] error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
