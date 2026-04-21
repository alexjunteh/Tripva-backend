import OpenAI from 'openai';
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';
import { packingInputSchema, formatZodError } from '../lib/schema.js';

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

  // Compute nights if dates given
  let nights = '';
  if (input.startDate && input.endDate) {
    try {
      const d1 = new Date(input.startDate);
      const d2 = new Date(input.endDate);
      const n = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
      nights = ` ${n} days`;
    } catch(e) {}
  }

  const archetype = input.archetype || 'generic';
  const travelers = input.travelers || 1;
  const childAges = Array.isArray(input.child_ages) && input.child_ages.length
    ? ` — children ages ${input.child_ages.join(', ')}`
    : '';

  const archetypeHint = {
    solo:      'Solo traveler. Minimize weight. Include basic safety (whistle, small first-aid kit).',
    couple:    'Couple. Include romantic-dinner attire. Skip kid items.',
    family:    `Family with ${childAges ? childAges.trim() : 'kids'}. Include kid essentials: snacks, entertainment, basic meds, spare clothes, sun protection. Stroller if relevant.`,
    friends:   `Group of ${travelers} friends. Include shared items (speaker, cards, group first-aid kit).`,
    adventure: 'Adventure/outdoor trip. Heavy on gear: sturdy boots, layers, waterproof, first-aid, water purification, power bank, headlamp.',
    nomad:     'Slow-travel / nomad. Work-from-anywhere essentials: laptop, universal adapter, noise-cancelling headphones, small-apartment toiletries.',
    generic:   'Standard trip essentials.',
  }[archetype];

  const prompt = `Generate a comprehensive, archetype-aware packing list for this trip:

Destination: ${input.destination}${nights}
Travelers: ${travelers}
Archetype: ${archetype}${childAges}

Context: ${archetypeHint}

Return ONLY JSON in this schema:
{
  "categories": [
    {
      "icon": "👕",
      "name": "Clothing",
      "items": [
        { "title": "3× T-shirts", "note": "Mix colors" },
        { "title": "1× light jacket", "note": "Evenings can be cool" }
      ]
    }
  ]
}

REQUIREMENTS:
- 5-8 categories (Documents, Clothing, Toiletries, Electronics, Health & Safety, Destination-specific, etc.)
- 4-10 items per category
- Each item has "title" (count + item) and optional "note" (why or when)
- Include items specific to the destination (e.g., water shoes for beach, thermal layer for cold, sim card advice)
- Include items specific to the archetype (kid snacks for family, business casual for nomad, etc.)
- Skip obvious universal items (phone charger is fine; don't list "phone", "wallet")
- Note weather/climate-appropriate items explicitly

Return ONLY the JSON object. No markdown fences, no prose.`;

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
