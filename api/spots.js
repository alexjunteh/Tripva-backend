import OpenAI from 'openai';
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o-mini';

/**
 * GET /api/spots?destination=Italy
 *
 * Returns 8 iconic, visually-striking highlights for any destination.
 * Used by the spot selector screen before trip generation.
 * Each spot includes a Wikipedia slug so the frontend can load a real photo.
 */
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const destination = (req.query.destination || '').trim();
  if (!destination) {
    return res.status(400).json({ error: 'destination query param is required' });
  }

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const prompt = `List exactly 8 of the most iconic, visually stunning places to visit in "${destination}".
Choose places that are:
- Specific (not generic like "the city" or "old town")
- Photogenic — travellers would want to photograph them
- Varied in type (mix landmarks, nature, culture, food scenes, viewpoints)

For each place return:
- name: well-known English name
- description: ONE vivid sentence under 85 characters that makes a traveller want to go there
- category: one of landmark | museum | culture | nature | view | beach | market | temple | park | street | adventure | food
- wikiSlug: exact Wikipedia article title with underscores (e.g. "Colosseum" or "Trevi_Fountain") — must be a real Wikipedia page

Return ONLY a JSON array of 8 objects, no extra text.`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 900,
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

    // Model may return { spots: [...] } or [...] directly
    const spots = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.spots) ? parsed.spots : []);

    return res.status(200).json({ spots: spots.slice(0, 8) });
  } catch (err) {
    console.error('[/api/spots] error:', err?.message || err);
    if (err?.status === 401) return res.status(500).json({ error: 'Configuration error' });
    if (err?.status === 429) return res.status(503).json({ error: 'Upstream rate limit' });
    return res.status(500).json({ error: 'Failed to generate spots' });
  }
}
