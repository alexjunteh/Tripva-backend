import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { destination, startDate, endDate, activities = [], tripStyle = 'mid-range', people = 2 } = req.body || {};
  if (!destination) return res.status(400).json({ error: 'destination required' });

  try {
    const actStr = Array.isArray(activities) ? activities.join(', ') : String(activities || 'general sightseeing');
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: 'You are a travel packing assistant. Return ONLY valid JSON, no markdown, no explanation.',
      messages: [{
        role: 'user',
        content: `Packing list for ${people} people going to ${destination} from ${startDate||'TBD'} to ${endDate||'TBD'}. Style: ${tripStyle}. Activities: ${actStr}. Return exactly: {"clothing":[],"documents":[],"electronics":[],"toiletries":[],"misc":[]}`
      }]
    });

    let parsed;
    try {
      parsed = JSON.parse(msg.content[0].text.trim());
    } catch {
      const match = msg.content[0].text.match(/\{[\s\S]+\}/);
      parsed = match ? JSON.parse(match[0]) : { clothing: [], documents: [], electronics: [], toiletries: [], misc: [] };
    }
    return res.json(parsed);
  } catch (err) {
    console.error('packing error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
