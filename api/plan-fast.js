import Anthropic from '@anthropic-ai/sdk';
import { planInputSchema, formatZodError } from '../lib/schema.js';
import { enrichWithAffiliateLinks } from '../lib/affiliate.js';
import { validateItinerary } from '../lib/itinerary-validator.js';

const anthropic = new Anthropic();

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const parseResult = planInputSchema.safeParse(body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid input', details: formatZodError(parseResult.error) });
  }

  const input = parseResult.data;
  const useStream = req.query?.stream === 'true';

  if (useStream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const sendEvent = (data) => { res.write(`data: ${JSON.stringify(data)}\n\n`); };
    sendEvent({ type: 'start', message: 'Planning your trip...' });
    sendEvent({ type: 'progress', message: 'AI is designing your complete itinerary...' });

    try {
      const rawPlan = await generateFullPlan(input);
      
      // Send skeleton (days without timelines) for animation
      const skeletonDays = rawPlan.days.map(d => ({ ...d, timeline: [] }));
      sendEvent({ type: 'skeleton', data: { normalizedVersion: 2, rawPlan: { ...rawPlan, days: skeletonDays } } });

      // Send each day for progressive animation
      for (const day of rawPlan.days) {
        sendEvent({ type: 'day', data: day });
      }

      const affiliateEnriched = enrichWithAffiliateLinks({ normalizedVersion: 2, rawPlan }, input.travelers || 2);
      const { plan: tripState, warnings, fixesApplied } = validateItinerary(affiliateEnriched);
      if (fixesApplied.length) console.log('[plan-fast] validator fixes:', fixesApplied.map(f => f.message));
      sendEvent({ type: 'done', data: tripState, warnings });
    } catch (err) {
      console.error('[plan-fast] Error:', err?.message || err);
      sendEvent({ type: 'error', message: err?.status === 429 ? 'Rate limit — try again shortly' : (err?.message || 'Generation failed') });
    } finally {
      res.end();
    }
    return;
  }

  // Non-streaming
  try {
    const rawPlan = await generateFullPlan(input);
    const affiliateEnriched = enrichWithAffiliateLinks({ normalizedVersion: 2, rawPlan }, input.travelers || 2);
    const { plan: tripState, warnings } = validateItinerary(affiliateEnriched);
    return res.status(200).json({ ...tripState, _warnings: warnings });
  } catch (err) {
    console.error('[plan-fast] Error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Generation failed' });
  }
}

async function generateFullPlan(input) {
  const { destination, startDate, endDate, travelers, budget, style, interests, homeCity } = input;

  const systemPrompt = `You are Tripva, an expert AI travel planner. Generate a COMPLETE trip plan as a single JSON object.

RULES:
1. Every day MUST have "date" (YYYY-MM-DD), "day" (number), "title", "subtitle", "emoji", "heroSeed", "imageUrl" (""), "timeline", "highlights" (3), "localTips" (3-5), "photos" ([])
2. Every day MUST have 6-10 timeline items with realistic times
3. Timeline items: { "time": "HH:MM", "title": "...", "detail": "2-3 sentences", "type": "transport|hotel|activity|meal|food|logistics", "mapQuery": "Venue, City, Country" }
4. Hotels: { "city", "name", "price", "note", "checkin", "checkout", "nights", "stars" (1-5), "rating" (0-10), "address", "bookUrl": "" }
5. Budget: 8-10 items with { "item", "amount", "note", "status": "pending", "category": "transport|accommodation|food|activities|misc" }
6. Urgent: only REAL bookable actions { "label", "note", "url": "", "priority": 1|2 }
7. tickets: [] (always empty)
8. mapStops: key stops with lat/lng { "name", "lat", "lng", "emoji", "type": "stay|daytrip", "day", "nights" }
9. Do NOT include home city in mapStops
10. All prices realistic for destination and budget

Output ONLY valid JSON. No markdown wrapping. No explanation.`;

  const userPrompt = `Plan: ${destination}, ${startDate} to ${endDate}, ${travelers} people, budget ${budget}, style ${style}, interests: ${(interests||[]).join(', ')}, departing from ${homeCity}.

JSON structure:
{"trip":{"id":"trip-...","name":"...","startDate":"${startDate}","endDate":"${endDate}","timezone":"...","currency":"..."},"days":[...],"hotels":[...],"budget":[...],"urgent":[...],"tickets":[],"mapStops":[...],"mapRoute":[{"lat":N,"lng":N}]}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16000,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  });

  const text = response.content[0]?.text || '';
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(jsonStr);
}
// deployed 20260331203536
