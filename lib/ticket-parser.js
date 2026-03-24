// lib/ticket-parser.js
// AI-powered ticket parser — sends PDF text to Claude and extracts structured data.
// Handles ANY ticket format: Klook, Viator, Trenitalia, SBB, airline, hotel, museum, concert, etc.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a precise ticket data extractor. Given raw text extracted from a booking confirmation, voucher, or e-ticket PDF, extract structured data.

Return ONLY a valid JSON object — no markdown, no explanation, just JSON.

Required fields (use null for anything not found):
{
  "title": "concise event/attraction/transport name (e.g. 'Doge\\'s Palace Fast Track', 'I Musici Veneziani — Vivaldi Four Seasons', 'Venice → Florence Frecciarossa 9413')",
  "date": "visit/travel date as 'Mon DD, YYYY' (e.g. 'Mar 25, 2026')",
  "time": "start time as HH:MM 24h (e.g. '09:30', '20:30')",
  "venue": "venue name and/or full address",
  "refId": "primary booking/order/confirmation reference ID",
  "codes": ["individual ticket codes or barcodes, one per ticket"],
  "travelers": ["Full Name 1", "Full Name 2"],
  "pricePerPerson": "price per person with currency (e.g. '€30.00', 'CHF 45')",
  "totalPrice": "total amount paid with currency (e.g. '€60.00')",
  "provider": "booking platform (e.g. 'Klook', 'Viator', 'Tiqets', 'Trenitalia', 'SBB', 'Booking.com')",
  "category": "one of: train | flight | museum | concert | tour | hotel | attraction | other",
  "importantInfo": "critical instructions: which entrance to use, what to show, dress code, arrival time, etc.",
  "seats": [{"traveler": "Full Name", "detail": "seat/row/coach/code detail string"}]
}

For train tickets: extract each passenger's coach + seat number into seats[].detail.
For event tickets: extract ticket code per person into seats[].detail.
If travelers list has 2 names and 2 codes, pair them up in seats[].`;

/**
 * Parse raw PDF text using Claude — handles any ticket format.
 * @param {string} pdfText - raw text extracted from a PDF
 * @returns {Promise<object>} structured ticket data
 */
export async function parseTicket(pdfText) {
  const message = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Extract ticket data from this PDF text:\n\n${pdfText.slice(0, 4000)}`
    }]
  });

  const raw = (message.content[0]?.text || '').trim();

  // Claude sometimes wraps JSON in markdown — strip it
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Claude returned no JSON. Response: ${raw.slice(0, 300)}`);
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Fallback regex parser — used when Claude is unavailable or for tests.
 * Less accurate but always works offline.
 */
export function parseTicketFallback(pdfText) {
  const text = pdfText || '';

  const refMatch   = text.match(/(?:Reference ID|Booking ref|Ref\.?|Order)[:\s#.]+([A-Z0-9]{6,20})/i);
  const dateMatch  = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4}/i)
                  || text.match(/\d{4}-\d{2}-\d{2}/);
  const timeMatch  = text.match(/\b(\d{1,2}:\d{2})\s*(?:PM|AM)?\b/i);
  const codes      = [...(text.matchAll(/\b([A-Z0-9]{8,12})\b(?=\s+\d\/\d)/g))].map(m => m[1]);
  const travMatch  = text.match(/(?:Ordered by|Travellers?|Name)[:\s]+([A-Za-z ]+?)(?=\s*[•\n]|\s*\d+\s*adult)/i);
  const priceMatch = text.match(/(?:€|EUR|CHF)\s*[\d,\.]+/i);

  const provider = /klook/i.test(text) ? 'Klook'
    : /viator/i.test(text) ? 'Viator'
    : /tiqets/i.test(text) ? 'Tiqets'
    : /trenitalia/i.test(text) ? 'Trenitalia'
    : /\bsbb\b/i.test(text) ? 'SBB'
    : 'Unknown';

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 8);

  return {
    title:          lines[0] || 'Unknown Ticket',
    date:           dateMatch ? dateMatch[0] : null,
    time:           timeMatch ? timeMatch[1] : null,
    venue:          null,
    refId:          refMatch ? refMatch[1] : null,
    codes,
    travelers:      travMatch ? [travMatch[1].trim()] : [],
    pricePerPerson: null,
    totalPrice:     priceMatch ? priceMatch[0] : null,
    provider,
    category:       'other',
    importantInfo:  null,
    seats:          [],
  };
}
