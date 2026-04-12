/**
 * POST /api/save
 * Saves a trip plan as a JSON file in the tripva-frontend GitHub repo.
 * Uses repo scope (existing token) — no gist scope needed.
 * Plans stored at: FuturiztaOS/trip-planner/plans/<uuid>.json
 * Readable via: https://raw.githubusercontent.com/FuturiztaOS/trip-planner/main/plans/<uuid>.json
 */
import { applyCors } from '../lib/middleware.js';
import { randomUUID } from 'crypto';

const REPO      = 'FuturiztaOS/trip-planner';
const BRANCH    = 'main';
const SHARE_BASE = 'https://tripva.app/trip.html';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'Missing plan in request body' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const id      = randomUUID().replace(/-/g, '').slice(0, 16);
  const path    = `plans/${id}.json`;
  const content = Buffer.from(JSON.stringify(plan)).toString('base64');

  try {
    const ghRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization':        `Bearer ${token}`,
        'Content-Type':         'application/json',
        'Accept':               'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent':           'Tripva-TripPlanner/1.0',
      },
      body: JSON.stringify({
        message: `Add trip plan ${id}`,
        content,
        branch: BRANCH,
      }),
    });

    if (!ghRes.ok) {
      const errText = await ghRes.text();
      console.error('GitHub API error:', ghRes.status, errText);
      return res.status(502).json({ error: 'Failed to save plan', details: errText });
    }

    return res.status(200).json({
      id,
      url: `${SHARE_BASE}?id=${id}`,
    });

  } catch (err) {
    console.error('save error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
