import Anthropic from '@anthropic-ai/sdk';
import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PARSE_SYSTEM = `You are a travel booking extractor. Given raw text from a booking confirmation (flight, hotel, or train), extract structured anchors.

Return ONLY a valid JSON array — no markdown, no explanation, just the array.

Each element has this shape (use null for unknown fields):
{
  "type": "flight" | "hotel" | "train",
  "from": "departure city or airport code (flight/train only)",
  "to": "arrival city or airport code (flight/train only)",
  "city": "hotel city (hotel only)",
  "date": "YYYY-MM-DD",
  "departureTime": "HH:MM 24h or null",
  "arrivalTime": "HH:MM 24h or null",
  "checkinDate": "YYYY-MM-DD (hotel only)",
  "checkoutDate": "YYYY-MM-DD (hotel only)",
  "hotelName": "hotel name (hotel only)",
  "flightNumber": "e.g. MH370 (flight only)",
  "confirmationRef": "booking reference / PNR / order ID",
  "summary": "one-line human-readable e.g. 'MH370 KUL → NRT on 10 Jun at 09:30'"
}

If the text has multiple segments (outbound + return flight, or multi-city stops), return one element per segment.
Omit any anchor where a date cannot be determined.
Return [] if no recognisable travel booking is found.`;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Extraction unavailable' });

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  res.setHeader('X-RateLimit-Reset', rateCheck.resetAt);
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Rate limit reached' });

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return res.status(400).json({ error: 'text is required (min 20 chars)' });
  }

  try {
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: PARSE_SYSTEM,
      messages: [{ role: 'user', content: 'Extract booking anchors from this text:\n\n' + text.slice(0, 6000) }],
    });

    const raw = (msg.content[0]?.text || '').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return res.status(200).json({ anchors: [] });

    let anchors;
    try { anchors = JSON.parse(match[0]); } catch { return res.status(200).json({ anchors: [] }); }
    if (!Array.isArray(anchors)) return res.status(200).json({ anchors: [] });

    return res.status(200).json({ anchors });
  } catch (err) {
    console.error('[parse-booking]', err.message);
    return res.status(500).json({ error: 'Extraction failed', message: err.message });
  }
}
