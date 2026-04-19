/**
 * GET /api/trip?id=<gist_id>
 * Loads a trip plan by Gist ID.
 */
import { applyCors } from '../lib/middleware.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id parameter' });

  const token = process.env.GITHUB_TOKEN;

  try {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Tripva/1.0',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const ghRes = await fetch(`https://api.github.com/gists/${id}`, { headers });

    if (!ghRes.ok) {
      if (ghRes.status === 404) return res.status(404).json({ error: 'Trip not found' });
      return res.status(502).json({ error: 'Failed to load trip' });
    }

    const gist = await ghRes.json();
    const fileContent = gist.files?.['plan.json']?.content;
    if (!fileContent) return res.status(404).json({ error: 'Trip data not found in gist' });

    const plan = JSON.parse(fileContent);
    return res.status(200).json({ rawPlan: plan });

  } catch (err) {
    console.error('trip load error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
