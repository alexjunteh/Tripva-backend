/**
 * GET /api/trip?id=<plan_id>
 * Loads a trip plan by ID from GitHub raw content.
 * Plans stored at alexjunteh/tripva-frontend/plans/<id>.json
 */
import { applyCors } from '../lib/middleware.js';

const RAW_BASE = 'https://raw.githubusercontent.com/alexjunteh/tripva-frontend/main/plans';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = req.query?.id;
  if (!id || !/^[a-f0-9]{16}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid plan ID' });
  }

  try {
    const raw = await fetch(`${RAW_BASE}/${id}.json`, {
      headers: { 'User-Agent': 'Tripva-TripPlanner/1.0' },
    });

    if (raw.status === 404) return res.status(404).json({ error: 'Plan not found' });
    if (!raw.ok) return res.status(502).json({ error: 'Failed to load plan' });

    const plan = await raw.json();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Normalise: if plan already has rawPlan key it's the full state; otherwise wrap it
    const response = plan.rawPlan ? plan : { rawPlan: plan };
    return res.status(200).json(response);

  } catch (err) {
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
