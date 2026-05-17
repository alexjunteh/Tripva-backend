import OpenAI from 'openai';
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 2048;

// Module-level cache keyed by destination.toLowerCase().trim()
const spotCache = new Map();

/**
 * GET /api/photospot?destination=<city>          — photo spots for trip dashboard
 * GET /api/photospot?destination=<city>&selector=1 — 8 iconic spots with wikiSlugs for spot selector UI
 * GET /api/spots?destination=<city>              — alias for selector=1 (via vercel.json rewrite)
 */
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Too many requests', message: 'Rate limit: 10 requests per minute' });
  }

  const destination = req.query.destination;
  if (!destination || typeof destination !== 'string' || destination.trim() === '') {
    return res.status(400).json({ error: 'destination query param required' });
  }

  const isSelector = req.query.selector === '1' || req.url?.includes('/api/spots');

  if (isSelector) {
    return handleSelector(req, res, destination.trim());
  }

  const key = destination.toLowerCase().trim();

  if (spotCache.has(key)) {
    return res.status(200).json(spotCache.get(key));
  }

  try {
    const completion = await client.chat.completions.create({
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

    const result = { ...parsed, spots: enriched };
    spotCache.set(key, result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[/api/photospot] error:', err?.message || err);
    if (err?.status === 401) return res.status(500).json({ error: 'Configuration error', message: 'Invalid OpenAI API key' });
    if (err?.status === 429) return res.status(503).json({ error: 'Upstream rate limit', message: 'Try again shortly' });
    return res.status(500).json({ error: 'Photo spot generation failed', message: err?.message || 'Unknown error' });
  }
}

async function fetchWikiImage(wikiSlug) {
  if (!wikiSlug) return null;
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiSlug)}&prop=pageimages&format=json&pithumbsize=800&origin=*`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Tripva/1.0 (tripva.live)' } });
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
      { headers: { Authorization: key } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d.photos?.[0]?.src?.large || null;
  } catch { return null; }
}

async function handleSelector(req, res, destination) {
  const prompt = `List exactly 8 iconic, photogenic places to visit in "${destination}".

Rules:
- Be specific (name the actual place, not "the waterfront" or "old town")
- Vary the types: mix landmarks, nature, culture, food scenes, viewpoints
- Descriptions must be a single concrete fact or sensory detail — NOT generic travel copy. Bad: "explore the vibrant chaos". Good: "free-fall glass slide on the 69th floor" or "1000-year-old banyan tree shades the courtyard"

Return JSON with a "spots" array of exactly 8 objects, each with:
- name: well-known English name
- description: one specific, concrete sentence under 90 characters (no adjectives like "vibrant", "stunning", "rich tapestry")
- category: one of landmark | museum | culture | nature | view | beach | market | temple | park | street | adventure | food
- wikiSlug: exact Wikipedia article title with underscores (e.g. "Colosseum") — must be a real Wikipedia page`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1200,
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

    // Prefer Wikipedia image (specific, no watermark), fall back to Pexels
    const enriched = await Promise.all(
      spots.slice(0, 8).map(async (s) => {
        const photoUrl = (await fetchWikiImage(s.wikiSlug)) || (await fetchPexelsPhoto(`${s.name} ${destination}`));
        return photoUrl ? { ...s, photoUrl } : s;
      })
    );

    return res.status(200).json({ spots: enriched });
  } catch (err) {
    console.error('[/api/spots] error:', err?.message || err);
    if (err?.status === 401) return res.status(500).json({ error: 'Configuration error' });
    if (err?.status === 429) return res.status(503).json({ error: 'Upstream rate limit' });
    return res.status(500).json({ error: 'Failed to generate spots' });
  }
}
