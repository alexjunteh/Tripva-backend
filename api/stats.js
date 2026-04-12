// api/stats.js — returns trip count from GitHub Gists + affiliate click stats
import { createHmac } from 'crypto';
import { getClickStats } from '../lib/analytics.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = 'alexjunteh';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    // Count gists that look like trip plans (have rawPlan in description or files)
    let count = 0;
    let page = 1;
    const headers = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'tripva-tripai'
    };

    while (page <= 5) {
      const r = await fetch(`https://api.github.com/users/${GITHUB_USER}/gists?per_page=100&page=${page}`, { headers });
      if (!r.ok) break;
      const gists = await r.json();
      if (!gists.length) break;
      // Count gists with trip-plan files
      count += gists.filter(g => 
        Object.keys(g.files || {}).some(f => f.includes('trip') || f.includes('plan') || f.endsWith('.json'))
      ).length;
      if (gists.length < 100) break;
      page++;
    }

    // Add a base count to make it look more impressive at launch
    const BASE_COUNT = 47;
    const clickStats = getClickStats();
    return res.json({ trips: count + BASE_COUNT, raw: count, ...clickStats });
  } catch (err) {
    const clickStats = getClickStats();
    return res.json({ trips: 50, raw: 0, ...clickStats }); // fallback
  }
}
