/**
 * POST /api/save
 * Saves a trip plan as a JSON file in the trip-planner GitHub repo.
 * Delegates to shared lib/save-github.js.
 */
import { applyCors } from '../lib/middleware.js';
import { savePlanToGitHub } from '../lib/save-github.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'Missing plan in request body' });

  try {
    const result = await savePlanToGitHub(plan);
    return res.status(200).json(result);
  } catch (err) {
    console.error('save error:', err);
    if (err.message === 'GITHUB_TOKEN not configured') {
      return res.status(500).json({ error: err.message });
    }
    return res.status(502).json({ error: 'Failed to save plan', message: err.message });
  }
}
