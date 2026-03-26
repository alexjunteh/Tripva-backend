// api/packing.js — POST /api/packing — AI packing list generator
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { destination, startDate, endDate, activities, tripStyle, people } = req.body || {};

  if (!destination) return res.status(400).json({ error: 'destination required' });

  const userPrompt = `Packing list for ${people || 1} people going to ${destination} ${startDate || ''} to ${endDate || ''}, style: ${tripStyle || 'mid-range'}, activities: ${activities || 'sightseeing, dining'}. Return: {"clothing":[],"documents":[],"electronics":[],"toiletries":[],"misc":[]}`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: 'You are a travel packing assistant. Return ONLY valid JSON, no markdown.',
      messages: [{ role: 'user', content: userPrompt }]
    });

    const raw = message.content?.[0]?.text || '{}';
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid JSON from AI', raw: cleaned.slice(0, 200) });
    }

    return res.json(data);
  } catch (e) {
    console.error('packing error:', e);
    return res.status(500).json({ error: e.message || 'AI error' });
  }
}
