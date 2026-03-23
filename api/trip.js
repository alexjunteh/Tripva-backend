/**
 * GET /api/trip?id=<gist_id>
 * Fetches a saved trip plan from a GitHub Gist and returns the plan JSON.
 */
import { applyCors } from '../lib/middleware.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || !/^[a-f0-9]+$/i.test(id)) {
    return res.status(400).json({ error: 'Missing or invalid gist id' });
  }

  try {
    const gistRes = await fetch(`https://api.github.com/gists/${id}`, {
      headers: {
        'Accept':    'application/vnd.github+json',
        'User-Agent': 'Roam-TripPlanner/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
        // Auth optional for public gists, but helps with rate limits
        ...(process.env.GITHUB_TOKEN
          ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    });

    if (gistRes.status === 404) {
      return res.status(404).json({ error: 'Trip plan not found' });
    }
    if (!gistRes.ok) {
      const errText = await gistRes.text();
      console.error('GitHub Gist fetch error:', gistRes.status, errText);
      return res.status(502).json({ error: 'Failed to fetch gist' });
    }

    const gist = await gistRes.json();
    const file = gist.files?.['plan.json'];

    if (!file) {
      return res.status(404).json({ error: 'plan.json not found in gist' });
    }

    // Content may be truncated for large files — fetch raw if needed
    let content = file.content;
    if (file.truncated && file.raw_url) {
      const rawRes = await fetch(file.raw_url);
      content = await rawRes.text();
    }

    const plan = JSON.parse(content);
    return res.status(200).json(plan);

  } catch (err) {
    console.error('trip endpoint error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
