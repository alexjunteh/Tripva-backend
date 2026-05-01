// api/track.js — affiliate click tracking
import { applyCors } from '../lib/middleware.js';
import { trackClick } from '../lib/analytics.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { partner, destination, tripId } = req.body || {};
  if (!partner) return res.status(400).json({ error: 'partner required' });

  try {
    trackClick({ partner, destination: destination || '', tripId: tripId || 'local' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[track] error:', err?.message);
    return res.status(200).json({ ok: true }); // fire-and-forget — never fail callers
  }
}
