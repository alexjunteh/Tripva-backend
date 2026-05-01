/**
 * POST /api/save
 * Saves a trip plan as a GitHub Gist (secret).
 * Returns { id, url } where id is the Gist ID.
 */
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const SHARE_BASE = 'https://tripva.app/trip';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Too many requests', message: 'Rate limit: 10 requests per minute' });
  }

  const { plan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'Missing plan in request body' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    const ghRes = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Tripva/1.0',
      },
      body: JSON.stringify({
        description: `Tripva trip plan — ${plan?.trip?.name || 'Untitled'}`,
        public: false,
        files: {
          'plan.json': { content: JSON.stringify(plan) }
        }
      }),
    });

    if (!ghRes.ok) {
      const errText = await ghRes.text();
      console.error('GitHub Gist error:', ghRes.status, errText);
      return res.status(502).json({ error: 'Failed to save plan', details: errText });
    }

    const gist = await ghRes.json();
    return res.status(200).json({
      id: gist.id,
      url: `${SHARE_BASE}?id=${gist.id}`,
    });

  } catch (err) {
    console.error('save error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
