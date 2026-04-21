import { applyCors, checkRateLimit, getClientIp } from '../lib/middleware.js';
import { planInputSchema, formatZodError } from '../lib/schema.js';
import { generatePlan, generatePlanStreamed, generatePlanProgressive } from '../lib/claude.js';
import { enrichWithAffiliateLinks } from '../lib/affiliate.js';
import { validateItinerary } from '../lib/itinerary-validator.js';
import { enrichPlan } from '../lib/places.js';

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

    // Keep-alive ping every 20s to prevent Cloudflare/CDN idle timeout (100s default)
    const keepAlive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch(e) { clearInterval(keepAlive); }
    }, 20000);

    sendEvent({ type: 'start', message: 'Planning your trip...' });

    // 90s total timeout — ensures done event is always sent
    let doneSent = false;
    const safeSend = (obj) => { sendEvent(obj); if (obj.type === 'done') doneSent = true; };
    const totalTimeout = setTimeout(() => {
      if (!doneSent) {
        console.warn('[plan] Progressive generation timed out after 90s');
        sendEvent({ type: 'done', data: { plan: null, saved: null } });
      }
    }, 90000);

    try {
      const rawPlan = await generatePlanProgressive(input, safeSend);
      const enrichedRaw = enrichPlan(rawPlan);
      const { plan: tripState, warnings, fixesApplied } = validateItinerary(enrichedRaw);
      if (fixesApplied.length) console.log('[validator] fixes:', fixesApplied.map(f => f.message));
      // Persist archetype + traveler context in trip so the frontend can
      // render correct stats without having to sniff text.
      try { persistArchetypeOnTrip(tripState, input); } catch(e) { console.warn('[plan] persistArchetype:', e.message); }
      // Save plan and include saved info in done event
      let savedInfo = null;
      try {
        const token = process.env.GITHUB_TOKEN;
        if (token) {
          const { randomUUID } = await import('crypto');
          const id = randomUUID().replace(/-/g, '').slice(0, 16);
          const path = `plans/${id}.json`;
          const ghRes = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Tripva/1.0' },
            body: JSON.stringify({ description: `Tripva trip — ${tripState?.trip?.name||'Untitled'}`, public: false, files: { 'plan.json': { content: JSON.stringify(tripState) } } }),
          });
          if (ghRes.ok) { const gist = await ghRes.json(); savedInfo = { id: gist.id, url: `https://tripva.app/trip?id=${gist.id}` }; }
        }
      } catch(e) { console.error('save error:', e.message); }
      clearTimeout(totalTimeout);
      sendEvent({ type: 'done', data: { plan: tripState, saved: savedInfo } });
    } catch (err) {
      clearTimeout(totalTimeout);
      sendEvent({ type: 'error', message: formatErrorMessage(err) });
    } finally {
      clearInterval(keepAlive);
      clearTimeout(totalTimeout);
      res.end();
    }

    return;
  }

  // ── Standard JSON response ─────────────────────────────────────────────────
  try {
    const rawPlanSync = await generatePlan(input);
    const affiliateEnriched = enrichWithAffiliateLinks(rawPlanSync, input.travelers || 2);
    const placesEnriched = enrichPlan(affiliateEnriched);
    const { plan: tripState, warnings, fixesApplied } = validateItinerary(placesEnriched);
    if (fixesApplied.length) console.log('[validator] fixes:', fixesApplied.map(f => f.message));
    try { persistArchetypeOnTrip(tripState, input); } catch(e) { console.warn('[plan] persistArchetype:', e.message); }
    return res.status(200).json({ ...tripState, _warnings: warnings });
  } catch (err) {
    return handleError(err, res);
  }
}

/**
 * Copy archetype + traveler context onto tripState.rawPlan.trip so the
 * frontend can render Days/People/Dates stats directly instead of sniffing
 * free-text budget notes.
 */
function persistArchetypeOnTrip(tripState, input) {
  const trip = tripState?.rawPlan?.trip;
  if (!trip) return;
  if (input.archetype) trip.archetype = input.archetype;
  if (input.travelers) { trip.travelers = input.travelers; trip.people = input.travelers; }
  if (Array.isArray(input.child_ages) && input.child_ages.length) trip.child_ages = input.child_ages;
  if (input.occasion) trip.occasion = input.occasion;
  if (input.pace) trip.pace = input.pace;
  if (Array.isArray(input.modifiers) && input.modifiers.length) trip.modifiers = input.modifiers;
  // Human-readable dates string for subtitle display
  if (trip.startDate && trip.endDate && !trip.dates) {
    const fmt = (ymd) => {
      const m = String(ymd).match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return '';
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[+m[2]-1]} ${+m[3]}`;
    };
    trip.dates = `${fmt(trip.startDate)} → ${fmt(trip.endDate)}`;
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
