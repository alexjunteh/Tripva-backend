/**
 * GET   /api/trip?id=<gist_id>  — load a trip plan
 * POST  /api/trip                — save a trip plan (was /api/save)
 * PATCH /api/trip                — apply natural-language instruction to trip (was /api/patch)
 */
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';
import { patchInputSchema, formatZodError } from '../lib/schema.js';
import { patchPlan } from '../lib/claude.js';

const SHARE_BASE = 'https://tripva.app/trip';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // ── POST — save trip plan as GitHub Gist ────────────────────────────────────
  if (req.method === 'POST') {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(ip);
    res.setHeader('X-RateLimit-Limit', '10');
    res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
    res.setHeader('X-RateLimit-Reset', rateCheck.resetAt);
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
          files: { 'plan.json': { content: JSON.stringify(plan) } },
        }),
      });

      if (!ghRes.ok) {
        const errText = await ghRes.text();
        console.error('GitHub Gist error:', ghRes.status, errText);
        return res.status(502).json({ error: 'Failed to save plan', details: errText });
      }

      const gist = await ghRes.json();
      return res.status(200).json({ id: gist.id, url: `${SHARE_BASE}?id=${gist.id}` });
    } catch (err) {
      console.error('save error:', err);
      return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }

  // ── PATCH /api/trip — apply natural-language instruction to trip ────────────
  if (req.method === 'PATCH') {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(ip);
    res.setHeader('X-RateLimit-Limit', '10');
    res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
    res.setHeader('X-RateLimit-Reset', rateCheck.resetAt);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'Too many requests', message: 'Rate limit: 10 requests per minute', resetAt: rateCheck.resetAt });
    }

    const parseResult = patchInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: formatZodError(parseResult.error) });
    }

    const { state, instruction } = parseResult.data;
    try {
      const patchedState = await patchPlan(state, instruction);
      return res.status(200).json(patchedState);
    } catch (err) {
      if (err?.status === 401) return res.status(500).json({ error: 'Configuration error', message: 'Invalid Anthropic API key' });
      if (err?.status === 429) return res.status(503).json({ error: 'Upstream rate limit', message: 'Anthropic API rate limit reached — please try again shortly' });
      if (err?.message?.startsWith('Failed after')) return res.status(422).json({ error: 'Patch failed', message: err.message });
      console.error('[/api/trip PATCH]', err);
      return res.status(500).json({ error: 'Internal server error', message: err?.message });
    }
  }

  // ── GET /api/trip?id=<gist_id> ────────────────────────────────────────────
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id parameter' });
  if (/[./\\]/.test(id) || id.length > 64) return res.status(400).json({ error: 'Invalid id format' });

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

    let plan;
    try { plan = JSON.parse(fileContent); } catch { return res.status(502).json({ error: 'Trip data corrupted' }); }
    return res.status(200).json({ rawPlan: plan });
  } catch (err) {
    console.error('trip load error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
