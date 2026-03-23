import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';
import { planInputSchema, formatZodError } from '../lib/schema.js';
import { generatePlan, generatePlanStreamed, generatePlanProgressive } from '../lib/claude.js';
import { enrichWithAffiliateLinks } from '../lib/affiliate.js';

/**
 * POST /api/plan
 *
 * Generates a complete trip plan from destination/date/preference inputs.
 * Supports SSE streaming via ?stream=true query param.
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
  const parseResult = planInputSchema.safeParse(body);

  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid input',
      details: formatZodError(parseResult.error),
    });
  }

  const input = parseResult.data;
  const useStream = req.query?.stream === 'true' || req.query?.stream === '1';

  // ── SSE streaming mode ─────────────────────────────────────────────────────
  if (useStream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent({ type: 'start', message: 'Planning your trip...' });

    try {
      const tripState = await generatePlanProgressive(input, sendEvent);
      sendEvent({ type: 'done', data: tripState });
    } catch (err) {
      sendEvent({ type: 'error', message: formatErrorMessage(err) });
    } finally {
      res.end();
    }

    return;
  }

  // ── Standard JSON response ─────────────────────────────────────────────────
  try {
    const rawState = await generatePlan(input);
    const tripState = enrichWithAffiliateLinks(rawState, input.travelers || 2);
    return res.status(200).json(tripState);
  } catch (err) {
    return handleError(err, res);
  }
}

function formatErrorMessage(err) {
  if (err?.status === 401 || err?.constructor?.name === 'AuthenticationError') {
    return 'Invalid Anthropic API key';
  }
  if (err?.status === 429 || err?.constructor?.name === 'RateLimitError') {
    return 'Anthropic API rate limit reached — please try again shortly';
  }
  return err?.message || 'An unexpected error occurred';
}

function handleError(err, res) {
  const message = formatErrorMessage(err);

  if (err?.status === 401) return res.status(500).json({ error: 'Configuration error', message });
  if (err?.status === 429) return res.status(503).json({ error: 'Upstream rate limit', message });
  if (err?.message?.startsWith('Failed after')) {
    return res.status(422).json({ error: 'Generation failed', message });
  }

  console.error('[/api/plan] Unexpected error:', err);
  return res.status(500).json({ error: 'Internal server error', message });
}
