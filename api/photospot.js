import OpenAI from 'openai';
import { applyCors, checkRateLimitCostly, getClientIp } from '../lib/middleware.js';
import { requireCostlyAuth, sendAuthFailure } from '../lib/auth.js';

let client;
const MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 2048;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// Module-level cache keyed by destination.toLowerCase().trim()
const spotCache = new Map();
const selectorCache = new Map();
const heroCache = new Map();

/**
 * GET /api/photospot?destination=<city>          — photo spots for trip dashboard
 * GET /api/photospot?destination=<city>&selector=1 — 8 iconic spots with wikiSlugs for spot selector UI
 * GET /api/spots?destination=<city>              — alias for selector=1 (via vercel.json rewrite)
 */
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method === 'GET' && req.query.type === 'heroes') {
    return handleHeroes(req, res);
  }

  if (req.method === 'GET' && req.query._img) {
    return handleImgProxy(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const rateCheck = await checkRateLimitCostly(ip);
  res.setHeader('X-RateLimit-Limit', '3');
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  res.setHeader('X-RateLimit-Reset', rateCheck.resetAt);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Too many requests', message: 'Rate limit: 3 requests per minute', resetAt: rateCheck.resetAt });
  }

  const authCheck = await requireCostlyAuth(req);
  if (!authCheck.ok) return sendAuthFailure(res, authCheck);

  const destination = req.query.destination;
  if (!destination || typeof destination !== 'string' || destination.trim() === '') {
    return res.status(400).json({ error: 'destination query param required' });
  }
  if (destination.length > 200) {
    return res.status(400).json({ error: 'destination too long (max 200 chars)' });
  }

  const isSelector = req.query.selector === '1' || req.url?.includes('/api/spots');

  if (isSelector) {
    return handleSelector(req, res, destination.trim());
  }

  const openai = getClient();
  if (!openai) {
    return res.status(503).json({ error: 'Photo spot generation unavailable', message: 'OPENAI_API_KEY is not configured' });
  }

  const key = destination.toLowerCase().trim();

  if (spotCache.has(key)) {
    return res.status(200).json(spotCache.get(key));
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'You are a travel photography expert. Respond ONLY with valid JSON.' },
        { role: 'user', content: `List 5-8 top photo spots for ${destination}. Return JSON: {"spots":[{"name":"...","description":"...","bestTime":"...","tags":["golden hour","architecture"],"lat":0.0,"lng":0.0,"tip":"..."}]}` },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = completion?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = { spots: [] };
    }

    if (!parsed || !Array.isArray(parsed.spots)) {
      return res.status(200).json({ spots: [], _warning: 'Model returned unexpected shape' });
    }

    const enriched = await Promise.all(
      parsed.spots.map(async (s) => {
        const photoUrl = await fetchPexelsPhoto(`${s.name} ${destination}`);
        return photoUrl ? { ...s, photoUrl } : s;
      })
    );

    const proxied = enriched.map(s => s.photoUrl ? { ...s, photoUrl: proxyUrl(s.photoUrl) } : s);
    const result = { ...parsed, spots: proxied };
    spotCache.set(key, result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[/api/photospot] error:', err?.message || err);
    if (err?.status === 401) return res.status(500).json({ error: 'Configuration error' });
    if (err?.status === 429) return res.status(503).json({ error: 'Upstream rate limit', message: 'Try again shortly' });
    return res.status(500).json({ error: 'Photo spot generation failed' });
  }
}

async function fetchWikiImage(wikiSlug) {
  if (!wikiSlug) return null;
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiSlug)}&prop=pageimages&format=json&pithumbsize=800&origin=*`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Tripva/1.0 (tripva.live)' }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    const pages = d?.query?.pages || {};
    const page = Object.values(pages)[0];
    return page?.thumbnail?.source || null;
  } catch { return null; }
}

async function fetchPexelsPhoto(query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d.photos?.[0]?.src?.large || null;
  } catch { return null; }
}

async function handleSelector(req, res, destination) {
  const cacheKey = destination.toLowerCase().trim();
  const cached = selectorCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < (cached.ttl || 3600000)) {
    return res.status(200).json({ spots: cached.spots, grouped: cached.grouped || false, regions: cached.regions || [] });
  }

  const openai = getClient();
  if (!openai) {
    return res.status(503).json({ error: 'Spot selector unavailable', message: 'OPENAI_API_KEY is not configured' });
  }

  const prompt = `You are given a travel destination: "${destination}"

First determine the scope:
A) COUNTRY or large region (e.g. "New Zealand", "Japan", "California", "Southeast Asia") → return 12–16 spots grouped by sub-region
B) CITY or small area (e.g. "Venice", "Kyoto", "Manhattan") → return exactly 8 spots

Rules:
- Be specific (name the actual place, not "the waterfront" or "old town")
- Vary the types: mix landmarks, nature, culture, food scenes, viewpoints
- Descriptions must be a single concrete fact or sensory detail — NOT generic travel copy. Bad: "explore the vibrant chaos". Good: "free-fall glass slide on the 69th floor" or "1000-year-old banyan tree shades the courtyard"
- For scope A: distribute spots evenly across 2–4 sub-regions. Each sub-region should have 3–5 spots.

Return JSON:
{
  "scope": "country" or "city",
  "spots": [...]
}

Each spot object must have:
- name: well-known English name
- description: one specific, concrete sentence under 90 characters (no adjectives like "vibrant", "stunning", "rich tapestry")
- category: one of landmark | museum | culture | nature | view | beach | market | temple | park | street | adventure | food
- region: sub-region name (e.g. "South Island", "North Island" for New Zealand; for cities just use the city name)
- wikiSlug: exact Wikipedia article title with underscores (e.g. "Colosseum") — must be a real Wikipedia page`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'You are a world-class travel expert. Respond ONLY with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = completion?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const fenced = String(raw).match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      parsed = fenced ? JSON.parse(fenced[1]) : {};
    }

    // Handle any wrapping key (spots, places, locations, highlights, etc.)
    const spots = Array.isArray(parsed)
      ? parsed
      : Object.values(parsed).find(v => Array.isArray(v)) || [];

    const scope = parsed.scope || (spots.length > 8 ? 'country' : 'city');
    const maxSpots = scope === 'country' ? 16 : 8;

    const enriched = await Promise.all(
      spots.slice(0, maxSpots).map(async (s) => {
        const photoUrl = (await fetchPexelsPhoto(`${s.name} ${destination}`)) || (await fetchWikiImage(s.wikiSlug));
        return photoUrl ? { ...s, photoUrl } : s;
      })
    );

    const proxied = enriched.map(s => s.photoUrl ? { ...s, photoUrl: proxyUrl(s.photoUrl) } : s);
    const hasPhotos = proxied.filter(s => s.photoUrl).length;
    const cacheTtl = hasPhotos >= enriched.length / 2 ? 3600000 : 60000;

    const grouped = scope === 'country';
    const regions = grouped ? [...new Set(proxied.map(s => s.region).filter(Boolean))] : [];
    selectorCache.set(cacheKey, { spots: proxied, grouped, regions, ts: Date.now(), ttl: cacheTtl });
    return res.status(200).json({ spots: proxied, grouped, regions });
  } catch (err) {
    console.error('[/api/spots] error:', err?.message || err);
    if (err?.status === 401) return res.status(500).json({ error: 'Configuration error' });
    if (err?.status === 429) return res.status(503).json({ error: 'Upstream rate limit' });
    return res.status(500).json({ error: 'Failed to generate spots' });
  }
}

const ALLOWED_IMG_HOSTS = ['images.pexels.com', 'upload.wikimedia.org'];

function proxyUrl(externalUrl) {
  if (!externalUrl) return null;
  try {
    const host = new URL(externalUrl).hostname;
    if (!ALLOWED_IMG_HOSTS.includes(host)) return externalUrl;
  } catch { return externalUrl; }
  return '/api/img?_img=' + encodeURIComponent(externalUrl);
}

async function handleImgProxy(req, res) {
  const raw = req.query._img;
  if (!raw) return res.status(400).end();
  let url;
  try { url = new URL(raw); } catch { return res.status(400).end(); }
  if (!ALLOWED_IMG_HOSTS.includes(url.hostname)) return res.status(403).end();
  try {
    const upstream = await fetch(raw, {
      headers: { 'User-Agent': 'Tripva/1.0' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!upstream.ok) return res.status(upstream.status).end();
    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).send(buf);
  } catch {
    return res.status(502).end();
  }
}

async function handleHeroes(req, res) {
  const destinations = (req.query.destinations || '').split(',').map(d => d.trim()).filter(Boolean).slice(0, 20);
  if (!destinations.length) {
    return res.status(400).json({ error: 'destinations query param required (comma-separated)' });
  }

  const results = {};
  await Promise.all(destinations.map(async d => {
    const key = d.toLowerCase();
    if (heroCache.has(key)) {
      results[d] = heroCache.get(key);
      return;
    }
    const url = await fetchPexelsPhoto(d + ' travel destination');
    if (url) {
      heroCache.set(key, url);
      results[d] = url;
    }
  }));

  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.status(200).json({ heroes: results });
}
