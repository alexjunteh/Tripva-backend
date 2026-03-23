/**
 * GET /api/trip?id=<plan_id>
 * Loads a trip plan by ID from GitHub raw content.
 * Plans stored at FuturiztaOS/trip-planner/plans/<id>.json
 */
import { applyCors } from '../lib/middleware.js';

const RAW_BASE = 'https://raw.githubusercontent.com/FuturiztaOS/trip-planner/main/plans';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = req.query?.id;
  if (!id || !/^[a-f0-9]{16}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid plan ID' });
  }

  try {
    const raw = await fetch(`${RAW_BASE}/${id}.json`, {
      headers: { 'User-Agent': 'Roam-TripPlanner/1.0' },
    });

    if (raw.status === 404) return res.status(404).json({ error: 'Plan not found' });
    if (!raw.ok) return res.status(502).json({ error: 'Failed to load plan' });

    const plan = await raw.json();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(plan);

  } catch (err) {
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
