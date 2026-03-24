// api/ticket.js
// POST /api/ticket
// Body: { pdfText: string, state: object }
// Returns: { state: updatedState, parsed: parsedTicketData }

import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';
import { mergeTicketIntoState } from '../lib/ticket-merger.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) return res.status(429).json({ error: 'Rate limit exceeded' });

  const { pdfText, state } = req.body || {};
  if (!pdfText || typeof pdfText !== 'string') {
    return res.status(400).json({ error: 'pdfText is required' });
  }
  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: 'state is required' });
  }

  try {
    const result = mergeTicketIntoState(pdfText, state);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[/api/ticket] Error:', err);
    return res.status(500).json({ error: 'Failed to process ticket', message: err.message });
  }
}
