/**
 * POST /api/save
 * Saves a trip plan as a GitHub Gist and returns the gist ID + share URL.
 */
import { applyCors } from '../lib/middleware.js';

const SHARE_BASE = 'https://futuriztaos.github.io/trip-planner/trip.html';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plan } = req.body || {};
  if (!plan) {
    return res.status(400).json({ error: 'Missing plan in request body' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
  }

  try {
    const gistRes = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Accept':        'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent':    'Roam-TripPlanner/1.0',
      },
      body: JSON.stringify({
        description: 'Roam trip plan',
        public: false,
        files: {
          'plan.json': {
            content: JSON.stringify(plan, null, 2),
          },
        },
      }),
    });

    if (!gistRes.ok) {
      const errText = await gistRes.text();
      console.error('GitHub Gist API error:', gistRes.status, errText);
      return res.status(502).json({ error: 'Failed to create gist', details: errText });
    }

    const gist = await gistRes.json();
    const id = gist.id;

    return res.status(200).json({
      id,
      url: `${SHARE_BASE}?id=${id}`,
    });

  } catch (err) {
    console.error('save endpoint error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
