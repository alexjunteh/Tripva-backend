// api/ticket.js
// POST /api/ticket
// Body: { pdfText: string, state: object }
// Returns: { state: updatedState, parsed: parsedData }
//
// Flow: pdfText → Claude (parseTicket) → mergeTicketIntoState → return updated state
// Fallback: if Claude unavailable, uses parseTicketFallback (regex)

import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';
import { parseTicket, parseTicketFallback } from '../lib/ticket-parser.js';
import { mergeTicketIntoState } from '../lib/ticket-merger.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Rate limit exceeded' });

  const { pdfText, state } = req.body || {};
  if (!pdfText || typeof pdfText !== 'string') {
    return res.status(400).json({ error: 'pdfText is required (raw text extracted from ticket PDF)' });
  }
  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: 'state is required (current rawPlan state)' });
  }

  let parsed;
  let usedFallback = false;

  try {
    // Try Claude first (handles any ticket format intelligently)
    parsed = await parseTicket(pdfText);
  } catch (aiErr) {
    console.warn('[/api/ticket] Claude parse failed, using fallback:', aiErr.message);
    // Graceful degradation — regex fallback
    parsed = parseTicketFallback(pdfText);
    usedFallback = true;
  }

  try {
    const result = mergeTicketIntoState(parsed, state);
    return res.status(200).json({
      ...result,
      _meta: { usedFallback, provider: parsed.provider, category: parsed.category }
    });
  } catch (err) {
    console.error('[/api/ticket] Merge error:', err);
    return res.status(500).json({ error: 'Failed to merge ticket into state', message: err.message });
  }
}
