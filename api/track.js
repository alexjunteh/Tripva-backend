// api/track.js — POST /api/track — records affiliate link clicks
import { trackClick } from "../lib/analytics.js";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { partner, destination, tripId } = req.body || {};

  if (!partner) return res.status(400).json({ error: 'partner required' });

  trackClick({ partner, destination, tripId });
  return res.json({ ok: true });
}
