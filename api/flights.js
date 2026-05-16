/**
 * POST /api/flights
 * Proxy to Sky Scrapper (RapidAPI) — real Skyscanner data.
 * Body: { from: "KUL", to: "NRT", date: "YYYY-MM-DD", returnDate?: "YYYY-MM-DD", travelers?: 2 }
 * Returns: { flights: [...] }
 *
 * Requires env: RAPIDAPI_KEY (from rapidapi.com, subscribe to "Sky Scrapper" free tier)
 */
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const RAPIDAPI_HOST = 'sky-scrapper.p.rapidapi.com';
const RAPIDAPI_BASE = 'https://sky-scrapper.p.rapidapi.com/api/v1/flights';

// In-memory cache: IATA → { skyId, entityId }
// Pre-seeded with common Asian/global airports so most searches skip the lookup call.
const AIRPORT_CACHE = {
  KUL: { skyId: 'KUL', entityId: '95673827' },
  SIN: { skyId: 'SIN', entityId: '95673536' },
  BKK: { skyId: 'BKK', entityId: '95673706' },
  NRT: { skyId: 'NRT', entityId: '95673766' },
  HND: { skyId: 'HND', entityId: '95673765' },
  ICN: { skyId: 'ICN', entityId: '95673469' },
  PVG: { skyId: 'PVG', entityId: '95673509' },
  PEK: { skyId: 'PEK', entityId: '95673439' },
  HKG: { skyId: 'HKG', entityId: '95673529' },
  CGK: { skyId: 'CGK', entityId: '95673574' },
  MNL: { skyId: 'MNL', entityId: '95673600' },
  DXB: { skyId: 'DXB', entityId: '95673400' },
  LHR: { skyId: 'LHR', entityId: '95565052' },
  CDG: { skyId: 'CDG', entityId: '95565041' },
  JFK: { skyId: 'JFK', entityId: '95565058' },
  LAX: { skyId: 'LAX', entityId: '95565072' },
  SYD: { skyId: 'SYD', entityId: '95673781' },
  MEL: { skyId: 'MEL', entityId: '95673756' },
  DEL: { skyId: 'DEL', entityId: '95673412' },
  BOM: { skyId: 'BOM', entityId: '95673320' },
};

async function resolveAirport(iata, apiKey) {
  const upper = iata.toUpperCase();
  if (AIRPORT_CACHE[upper]) return AIRPORT_CACHE[upper];

  const r = await fetch(
    `${RAPIDAPI_BASE}/searchAirport?query=${encodeURIComponent(upper)}&locale=en-US`,
    {
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': RAPIDAPI_HOST },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!r.ok) return null;
  const d = await r.json();
  const hit = (d?.data || []).find(a =>
    a.navigation?.relevantFlightParams?.skyId?.toUpperCase() === upper ||
    a.skyId?.toUpperCase() === upper
  );
  if (!hit) return null;
  const result = {
    skyId:    hit.navigation?.relevantFlightParams?.skyId || hit.skyId,
    entityId: hit.navigation?.relevantFlightParams?.entityId || hit.entityId,
  };
  AIRPORT_CACHE[upper] = result;
  return result;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RAPIDAPI_KEY;
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

  try {
    const [originAirport, destAirport] = await Promise.all([
      resolveAirport(from, apiKey),
      resolveAirport(to, apiKey),
    ]);

    if (!originAirport) return res.status(400).json({ error: `Airport not found: ${from}` });
    if (!destAirport)   return res.status(400).json({ error: `Airport not found: ${to}` });

    const params = new URLSearchParams({
      originSkyId:          originAirport.skyId,
      destinationSkyId:     destAirport.skyId,
      originEntityId:       originAirport.entityId,
      destinationEntityId:  destAirport.entityId,
      date,
      adults:               String(adultCount),
      currency:             'USD',
      market:               'en-US',
      countryCode:          'US',
      sortBy:               'best',
    });
    if (returnDate) params.set('returnDate', returnDate);

    const skyRes = await fetch(`${RAPIDAPI_BASE}/searchFlights?${params.toString()}`, {
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': RAPIDAPI_HOST },
      signal: AbortSignal.timeout(15000),
    });

    if (!skyRes.ok) {
      console.error('[flights] Sky Scrapper error:', skyRes.status);
      return res.status(502).json({ error: 'Flight search failed' });
    }

    const data = await skyRes.json();
    const itineraries = data?.data?.itineraries || [];
    const tripcomCode = process.env.TRIPCOM_ALLIANCE_CODE || '';

    const flights = itineraries.slice(0, 10).map((it) => {
      const leg = it.legs?.[0];
      const segments = leg?.segments || [];
      const airlines = [...new Set(segments.map(s => s.marketingCarrier?.name).filter(Boolean))];
      const price = it.price?.raw ?? it.price?.formatted ?? null;

      const tcParams = new URLSearchParams({ from, to, date, adult: String(adultCount) });
      if (tripcomCode) tcParams.set('alliancecode', tripcomCode);

      // Deep link to Skyscanner for booking
      const skyLink = `https://www.skyscanner.com/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${date.replace(/-/g, '')}/`;

      return {
        id:          it.id || leg?.id,
        price:       typeof price === 'number' ? price : parseFloat(String(price).replace(/[^0-9.]/g, '')) || null,
        currency:    'USD',
        airlines,
        departure:   leg ? { iata: leg.origin?.displayCode, time: leg.departure } : null,
        arrival:     leg ? { iata: leg.destination?.displayCode, time: leg.arrival } : null,
        durationSec: leg?.durationInMinutes ? leg.durationInMinutes * 60 : null,
        stops:       leg?.stopCount ?? Math.max(0, segments.length - 1),
        bookingLink: skyLink,
        tripcomLink: `https://www.trip.com/flights/?${tcParams.toString()}`,
      };
    });

    return res.status(200).json({ flights });
  } catch (err) {
    console.error('[flights] error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
