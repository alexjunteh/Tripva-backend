import OpenAI from 'openai';
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';
import { packingInputSchema, formatZodError } from '../lib/schema.js';
import { buildPackingPrompt } from '../lib/packing-prompt.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 2048;

/**
 * POST /api/packing
 *
 * Generates an archetype-aware packing list for a trip. Returns
 * { categories: [ { icon, name, items: [{ title, note?, checked? }] } ] }.
 *
 * Input: { destination, startDate?, endDate?, travelers?, archetype?, child_ages? }
 */
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Too many requests', message: 'Rate limit: 10 requests per minute' });
  }

  const parseResult = packingInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid input', details: formatZodError(parseResult.error) });
  }
  const input = parseResult.data;
  const prompt = buildPackingPrompt(input);

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.5,
      messages: [
        { role: 'system', content: 'You are a seasoned travel-packing expert. Respond ONLY with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = completion?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Strip fences as a fallback
      const fenced = String(raw).match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      parsed = fenced ? JSON.parse(fenced[1]) : { categories: [] };
    }

    if (!parsed || !Array.isArray(parsed.categories)) {
      return res.status(200).json({ categories: [], _warning: 'Model returned unexpected shape' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[/api/packing] error:', err?.message || err);
    if (err?.status === 401) return res.status(500).json({ error: 'Configuration error', message: 'Invalid OpenAI API key' });
    if (err?.status === 429) return res.status(503).json({ error: 'Upstream rate limit', message: 'Try again shortly' });
    return res.status(500).json({ error: 'Packing generation failed', message: err?.message || 'Unknown error' });
  }
}
