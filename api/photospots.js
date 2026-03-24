/**
 * GET /api/photospots?city=venice&limit=10&minScore=8
 * Returns curated photo spots with GPS, reference photo, XHS tips
 */
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';
import { getPhotoSpots } from '../lib/photospots.js';

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Too many requests' });

  const city    = (req.query.city || '').toLowerCase().trim();
  const limit   = Math.min(parseInt(req.query.limit || '10'), 20);
  const minScore = parseFloat(req.query.minScore || '0');

  if (!city) return res.status(400).json({ error: 'city param required' });

  const spots = getPhotoSpots(city, { limit, minScore });

  if (!spots.length) {
    return res.status(404).json({ error: `No photo spots found for city: ${city}` });
  }

  return res.status(200).json({
    city,
    count: spots.length,
    spots,
    sources: ['photohound', 'xiaohongshu', 'wikipedia-commons'],
  });
}
