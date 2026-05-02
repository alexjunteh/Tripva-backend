import OpenAI from 'openai';
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 2048;

// Module-level cache keyed by destination.toLowerCase().trim()
const spotCache = new Map();

/**
 * GET /api/photospot?destination=<city>
 *
 * Returns 5-8 top photo spots for the given destination.
 * Shape: { spots: [{ name, description, bestTime, tags, lat, lng, tip }] }
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

    spotCache.set(key, parsed);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[/api/photospot] error:', err?.message || err);
    if (err?.status === 401) return res.status(500).json({ error: 'Configuration error', message: 'Invalid OpenAI API key' });
    if (err?.status === 429) return res.status(503).json({ error: 'Upstream rate limit', message: 'Try again shortly' });
    return res.status(500).json({ error: 'Photo spot generation failed', message: err?.message || 'Unknown error' });
  }
}
