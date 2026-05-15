/**
 * POST /api/flights
 * Proxy to Kiwi Tequila v2 flight search.
 * Body: { from: "KUL", to: "NRT", date: "YYYY-MM-DD", returnDate?: "YYYY-MM-DD", travelers?: 2 }
 * Returns: { flights: [...] }
 */
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const KIWI_BASE = 'https://api.tequila.kiwi.com/v2/search';

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

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD format' });
  if (returnDate && !DATE_RE.test(returnDate)) return res.status(400).json({ error: 'returnDate must be YYYY-MM-DD format' });

  // Kiwi expects DD/MM/YYYY
  const toKiwiDate = (ymd) => {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  };

  const adultCount = Math.max(1, Math.min(9, parseInt(travelers) || 2));
  const params = new URLSearchParams({
    fly_from: from,
    fly_to:   to,
    date_from: toKiwiDate(date),
    date_to:   toKiwiDate(date),
    adults:    String(adultCount),
    curr:      'USD',
    limit:     '10',
    sort:      'price',
    one_for_city: '1',
  });

  if (returnDate) {
    params.set('return_from', toKiwiDate(returnDate));
    params.set('return_to',   toKiwiDate(returnDate));
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

    const kiwiAffiliateId = process.env.KIWI_AFFILIATE_ID || '';
    const tripcomCode = process.env.TRIPCOM_ALLIANCE_CODE || '';

    const flights = raw.map((f) => {
      const dep = f.route?.[0];
      const arr = f.route?.[f.route.length - 1];
      const airlines = [...new Set((f.route || []).map(s => s.airline).filter(Boolean))];

      const kiwiParams = new URLSearchParams({ token: f.booking_token || '' });
      if (kiwiAffiliateId) kiwiParams.set('affilid', kiwiAffiliateId);
      const kiwiLink = `https://www.kiwi.com/booking?${kiwiParams.toString()}`;

      const tcParams = new URLSearchParams({ from, to, date, adult: String(travelers) });
      if (tripcomCode) tcParams.set('alliancecode', tripcomCode);
      const tripcomLink = `https://www.trip.com/flights/?${tcParams.toString()}`;

      return {
        id:          f.id,
        price:       f.price,
        currency:    data.currency || 'USD',
        airlines,
        departure:   dep ? { iata: dep.flyFrom, time: dep.local_departure } : null,
        arrival:     arr ? { iata: arr.flyTo,   time: arr.local_arrival   } : null,
        durationSec: f.duration?.total ?? null,
        stops:       Math.max(0, (f.route?.length ?? 1) - 1),
        kiwiLink,
        tripcomLink,
      };
    });

    return res.status(200).json({ flights });
  } catch (err) {
    console.error('[flights] error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
