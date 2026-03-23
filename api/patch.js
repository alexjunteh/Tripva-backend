import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';
import { patchInputSchema, formatZodError } from '../lib/schema.js';
import { patchPlan } from '../lib/claude.js';

/**
 * POST /api/patch
 *
 * Applies a natural-language instruction to an existing trip state.
 * Preserves all existing data and only modifies what was asked.
 */
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);

  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
  res.setHeader('X-RateLimit-Reset', rateCheck.resetAt);

  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit: 10 requests per minute',
      resetAt: rateCheck.resetAt,
    });
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const body = req.body;
  const parseResult = patchInputSchema.safeParse(body);

  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid input',
      details: formatZodError(parseResult.error),
    });
  }

  const { state, instruction } = parseResult.data;

  // ── Generate patch ─────────────────────────────────────────────────────────
  try {
    const patchedState = await patchPlan(state, instruction);
    return res.status(200).json(patchedState);
  } catch (err) {
    return handleError(err, res);
  }
}

function handleError(err, res) {
  if (err?.status === 401) {
    return res.status(500).json({ error: 'Configuration error', message: 'Invalid Anthropic API key' });
  }
  if (err?.status === 429) {
    return res.status(503).json({ error: 'Upstream rate limit', message: 'Anthropic API rate limit reached — please try again shortly' });
  }
  if (err?.message?.startsWith('Failed after')) {
    return res.status(422).json({ error: 'Patch failed', message: err.message });
  }

  console.error('[/api/patch] Unexpected error:', err);
  return res.status(500).json({ error: 'Internal server error', message: err?.message || 'An unexpected error occurred' });
}
