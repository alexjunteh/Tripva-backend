/**
 * Flight search + Travelpayouts price intelligence (all merged to stay within Hobby 12-fn limit)
 *
 * POST /api/flights                  → SerpAPI real-time search
 * GET  /api/flights/cheap            → TP cheapest tickets
 * GET  /api/flights/calendar         → TP price calendar (cheapest per day)
 * GET  /api/flights/monthly          → TP monthly cheapest
 * GET  /api/flights/explore          → TP city directions (cheapest from origin)
 * GET  /api/flights/hotel-link       → Hotellook affiliate link builder
 * GET  /api/flights/activity-link    → GetYourGuide affiliate link builder
 *
 * Env: SERPAPI_KEY, TRAVELPAYOUTS_TOKEN, TRAVELPAYOUTS_MARKER
 */
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const SERPAPI_BASE = 'https://serpapi.com/search.json';
const TP_API       = 'https://api.travelpayouts.com';
const TP_TOKEN     = process.env.TRAVELPAYOUTS_TOKEN || '';
const TP_MARKER    = process.env.TRAVELPAYOUTS_MARKER || '';

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseIata(val) {
  if (!val || typeof val !== 'string') return null;
  const c = val.trim().toUpperCase();
  return /^[A-Z]{2,4}$/.test(c) ? c : null;
}

const airlineLogo = (code) =>
  code ? `https://pics.avs.io/40/40/${code.toUpperCase()}.png` : null;

function tpBookingLinks({ origin, destination, departDate, returnDate, adults = 1, currency = 'USD' }) {
  const m = TP_MARKER ? `&marker=${TP_MARKER}` : '';
  const d = (departDate || '').replace(/-/g, '');
  return {
    jetradar: destination
      ? `https://search.jetradar.com/?origin=${origin}&destination=${destination}&depart_date=${departDate}${returnDate ? `&return_date=${returnDate}` : ''}&adults=${adults}&currency=${currency}&lang=en${m}`
      : null,
    aviasales: destination && d.length === 8
      ? `https://www.aviasales.com/search/${origin}${d.slice(4, 8)}${destination}${m}`
      : null,
  };
}

function hotellookLink({ city, checkIn, checkOut, adults = 2 }) {
  const m = TP_MARKER ? `&marker=${TP_MARKER}` : '';
  return `https://www.hotellook.com/hotels?destination=${encodeURIComponent(city)}${checkIn ? `&checkIn=${checkIn}` : ''}${checkOut ? `&checkOut=${checkOut}` : ''}&adults=${adults}&rooms=1${m}`;
}

function gygLink({ destination }) {
  const m = TP_MARKER ? `&partner_id=${TP_MARKER}` : '';
  return `https://www.getyourguide.com/s/?q=${encodeURIComponent(destination)}${m}`;
}

// ── Router ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  res.setHeader('X-RateLimit-Reset', rateCheck.resetAt);
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Too many requests' });

  const rawUrl  = req.url || '';
  const action  = rawUrl.split('?')[0].replace(/^\/api\/flights\/?/, '') || '';

  try {
    // Travelpayouts GET sub-routes
    if (req.method === 'GET') {
      if (!TP_TOKEN) return res.status(503).json({ error: 'Price intelligence unavailable' });
      switch (action) {
        case 'cheap':         return await tpCheap(req, res);
        case 'calendar':      return await tpCalendar(req, res);
        case 'monthly':       return await tpMonthly(req, res);
        case 'explore':       return await tpExplore(req, res);
        case 'hotel-link':    return tpHotelLink(req, res);
        case 'activity-link': return tpActivityLink(req, res);
        default:              return res.status(404).json({ error: 'Unknown route' });
      }
    }

    // SerpAPI real-time POST search
    if (req.method === 'POST' && action === '') return await serpSearch(req, res);

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[flights]', action, err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}

// ── SerpAPI real-time search ─────────────────────────────────────────────────

async function serpSearch(req, res) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Flight search unavailable' });

  const { from, to, date, returnDate, travelers = 2 } = req.body || {};
  if (!from) return res.status(400).json({ error: 'from (IATA code) is required' });
  if (!to)   return res.status(400).json({ error: 'to (IATA code) is required' });
  if (!date) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  if (returnDate && !DATE_RE.test(returnDate)) return res.status(400).json({ error: 'returnDate must be YYYY-MM-DD' });

  const adultCount = Math.max(1, Math.min(9, parseInt(travelers) || 2));
  const fromU = from.toUpperCase(), toU = to.toUpperCase();

  const params = new URLSearchParams({
    engine: 'google_flights', departure_id: fromU, arrival_id: toU,
    outbound_date: date, adults: String(adultCount),
    currency: 'USD', hl: 'en', type: returnDate ? '1' : '2', api_key: apiKey,
  });
  if (returnDate) params.set('return_date', returnDate);

  const r = await fetch(`${SERPAPI_BASE}?${params}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) {
    console.error('[flights] SerpAPI error:', r.status);
    return res.status(502).json({ error: 'Flight search failed' });
  }

  const data = await r.json();
  const raw = [
    ...(Array.isArray(data.best_flights)  ? data.best_flights  : []),
    ...(Array.isArray(data.other_flights) ? data.other_flights : []),
  ].slice(0, 10);

  const flights = raw.map((it, idx) => {
    const segs  = Array.isArray(it.flights) ? it.flights : [];
    const first = segs[0] || {};
    const last  = segs[segs.length - 1] || first;
    const airlines = [...new Set(segs.map(s => s.airline).filter(Boolean))];
    const links = tpBookingLinks({ origin: fromU, destination: toU, departDate: date, returnDate, adults: adultCount });
    return {
      id:          `gf-${idx}`,
      price:       typeof it.price === 'number' ? it.price : null,
      currency:    'USD',
      airlines,
      airlineLogos: segs.map(s => s.airline_logo).filter(Boolean),
      departure:   first.departure_airport ? { iata: first.departure_airport.id, time: first.departure_airport.time } : null,
      arrival:     last.arrival_airport    ? { iata: last.arrival_airport.id,    time: last.arrival_airport.time    } : null,
      durationSec: it.total_duration ? it.total_duration * 60 : null,
      stops:       Math.max(0, segs.length - 1),
      bookingLink: links.jetradar || links.aviasales || `https://www.google.com/flights?hl=en#flt=${fromU}.${toU}.${date.replace(/-/g,'')}`,
      jetradarLink: links.jetradar,
      aviasalesLink: links.aviasales,
    };
  });

  return res.status(200).json({ flights });
}

// ── Travelpayouts: cheapest tickets ─────────────────────────────────────────

async function tpCheap(req, res) {
  const { origin, destination, currency = 'usd', one_way = 'true', month } = req.query;
  const org = parseIata(origin);
  if (!org) return res.status(400).json({ error: 'origin IATA required' });
  const dst = parseIata(destination);

  const p = new URLSearchParams({ origin: org, currency, token: TP_TOKEN, one_way });
  if (dst) p.set('destination', dst);
  if (month) { p.set('beginning_of_period', month.slice(0, 7) + '-01'); p.set('period_type', 'month'); }

  const r = await fetch(`${TP_API}/v1/prices/cheap?${p}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return res.status(502).json({ error: 'Upstream error', status: r.status });

  const raw = await r.json();
  if (!raw.success || !raw.data) return res.status(200).json({ success: true, tickets: [] });

  const tickets = [];
  for (const [dest, byStops] of Object.entries(raw.data)) {
    for (const t of Object.values(byStops)) {
      const links = tpBookingLinks({ origin: org, destination: dest, departDate: t.departure_at?.slice(0, 10), adults: 1, currency: currency.toUpperCase() });
      tickets.push({ origin: org, destination: dest, price: t.price, currency: (raw.currency || currency).toUpperCase(), airline: t.airline, airlineLogo: airlineLogo(t.airline), departureAt: t.departure_at, returnAt: t.return_at, transfers: t.transfers, duration: t.duration, flightNumber: t.flight_number, expiresAt: t.expires_at, bookingLinks: links });
    }
  }
  tickets.sort((a, b) => a.price - b.price);
  return res.status(200).json({ success: true, tickets, currency: (raw.currency || currency).toUpperCase() });
}

// ── Travelpayouts: price calendar ────────────────────────────────────────────

async function tpCalendar(req, res) {
  const { origin, destination, month, currency = 'usd', calendar_type = 'departure_date' } = req.query;
  const org = parseIata(origin), dst = parseIata(destination);
  if (!org) return res.status(400).json({ error: 'origin IATA required' });
  if (!dst) return res.status(400).json({ error: 'destination IATA required' });

  const monthStr = month ? (month.length === 7 ? month + '-01' : month) : null;
  const p = new URLSearchParams({ origin: org, destination: dst, currency, calendar_type, token: TP_TOKEN });
  if (monthStr) p.set('month', monthStr);

  const r = await fetch(`${TP_API}/v1/prices/calendar?${p}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return res.status(502).json({ error: 'Upstream error', status: r.status });

  const raw = await r.json();
  if (!raw.success || !raw.data) return res.status(200).json({ success: true, dates: [] });

  const dates = Object.entries(raw.data).map(([date, t]) => {
    const links = tpBookingLinks({ origin: org, destination: dst, departDate: date, adults: 1, currency: currency.toUpperCase() });
    return { date, price: t.price, airline: t.airline, airlineLogo: airlineLogo(t.airline), transfers: t.transfers, bookingLinks: links };
  }).sort((a, b) => a.date.localeCompare(b.date));

  return res.status(200).json({ success: true, origin: org, destination: dst, dates, currency: (raw.currency || currency).toUpperCase() });
}

// ── Travelpayouts: monthly cheapest ─────────────────────────────────────────

async function tpMonthly(req, res) {
  const { origin, destination, currency = 'usd' } = req.query;
  const org = parseIata(origin), dst = parseIata(destination);
  if (!org) return res.status(400).json({ error: 'origin IATA required' });
  if (!dst) return res.status(400).json({ error: 'destination IATA required' });

  const p = new URLSearchParams({ origin: org, destination: dst, currency, token: TP_TOKEN });
  const r = await fetch(`${TP_API}/v1/prices/monthly?${p}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return res.status(502).json({ error: 'Upstream error', status: r.status });

  const raw = await r.json();
  if (!raw.success || !raw.data) return res.status(200).json({ success: true, months: [] });

  const months = Object.entries(raw.data).map(([month, t]) => {
    const links = tpBookingLinks({ origin: org, destination: dst, departDate: t.departure_at?.slice(0, 10), adults: 1, currency: currency.toUpperCase() });
    return { month, price: t.price, airline: t.airline, airlineLogo: airlineLogo(t.airline), transfers: t.transfers, departureAt: t.departure_at, bookingLinks: links };
  }).sort((a, b) => a.month.localeCompare(b.month));

  return res.status(200).json({ success: true, origin: org, destination: dst, months, currency: (raw.currency || currency).toUpperCase() });
}

// ── Travelpayouts: city directions (explore) ─────────────────────────────────

async function tpExplore(req, res) {
  const { origin, currency = 'usd' } = req.query;
  const org = parseIata(origin);
  if (!org) return res.status(400).json({ error: 'origin IATA required' });

  const p = new URLSearchParams({ origin: org, currency, token: TP_TOKEN });
  const r = await fetch(`${TP_API}/v1/city-directions?${p}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return res.status(502).json({ error: 'Upstream error', status: r.status });

  const raw = await r.json();
  if (!raw.success || !raw.data) return res.status(200).json({ success: true, destinations: [] });

  const destinations = Object.entries(raw.data).map(([dest, t]) => {
    const links = tpBookingLinks({ origin: org, destination: dest, departDate: t.departure_at?.slice(0, 10), adults: 1, currency: currency.toUpperCase() });
    return { origin: org, destination: dest, price: t.price, airline: t.airline, airlineLogo: airlineLogo(t.airline), transfers: t.transfers, departureAt: t.departure_at, returnAt: t.return_at, bookingLinks: links };
  }).sort((a, b) => a.price - b.price);

  return res.status(200).json({ success: true, origin: org, destinations, currency: (raw.currency || currency).toUpperCase() });
}

// ── Affiliate link builders ──────────────────────────────────────────────────

function tpHotelLink(req, res) {
  const { city, checkIn, checkOut, adults = '2' } = req.query;
  if (!city) return res.status(400).json({ error: 'city required' });
  return res.status(200).json({ url: hotellookLink({ city, checkIn, checkOut, adults: parseInt(adults) || 2 }) });
}

function tpActivityLink(req, res) {
  const { destination } = req.query;
  if (!destination) return res.status(400).json({ error: 'destination required' });
  return res.status(200).json({ url: gygLink({ destination }) });
}
