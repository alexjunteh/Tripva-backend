// api/push.js — Web Push subscription + daily briefing sender.
//
// Routes (proxied via vercel.json rewrites):
//   POST /api/push/subscribe   — persist a user's PushSubscription
//   POST /api/push/unsubscribe — remove a subscription
//   POST /api/push/send-daily  — cron endpoint (token-gated) that iterates
//                                 saved trips + sends pre-trip countdowns and
//                                 travel-day next-item reminders.
//
// Env vars required to activate:
//   VAPID_PUBLIC_KEY   — base64url-encoded
//   VAPID_PRIVATE_KEY  — base64url-encoded
//   VAPID_SUBJECT      — 'mailto:...' (Web Push spec requires this)
//   PUSH_CRON_TOKEN    — shared secret for POST /send-daily
// Generate VAPID keys once with:
//   npx web-push generate-vapid-keys
// When any are missing the endpoint returns 503 with a clear message and the
// frontend falls back to "notifications not ready yet" — same graceful pattern
// as Stripe + OAuth.

import { createClient } from '@supabase/supabase-js';

// Lazy-load web-push only when actually sending pushes — at module top-level
// under Vercel's Node runtime the CJS default-import pattern crashes. Keep
// the module-load surface tiny so GET /api/push/public-key returns its 503
// or the VAPID key without ever touching web-push.
let _webpush = null;
async function getWebPush() {
  if (_webpush) return _webpush;
  const mod = await import('web-push');
  _webpush = mod.default || mod;
  if (pushReady && _webpush.setVapidDetails) {
    _webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  }
  return _webpush;
}

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@tripva.app';
const CRON_TOKEN    = process.env.PUSH_CRON_TOKEN || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://tripva.app';

const pushReady = !!(VAPID_PUBLIC && VAPID_PRIVATE);
// VAPID details are set inside getWebPush() the first time a send is
// attempted — keeps the cold-start surface tiny.

const serviceClient = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anonClient = (token) => createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

function setCors(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin.includes('tripva.app') ? origin : ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-token');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';

  // GET /api/push/public-key — frontend needs this to subscribe
  if (req.method === 'GET' && url.includes('public-key')) {
    if (!pushReady) return res.status(503).json({ error: 'push_not_configured' });
    return res.status(200).json({ publicKey: VAPID_PUBLIC });
  }

  // POST /api/push/subscribe
  if (req.method === 'POST' && url.includes('subscribe') && !url.includes('unsubscribe')) {
    if (!pushReady) return res.status(503).json({ error: 'push_not_configured' });
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { data: { user } } = await anonClient(token).auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Missing subscription' });

    const { error } = await serviceClient().from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      user_agent: req.headers['user-agent'] || '',
      updated_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // POST /api/push/unsubscribe
  if (req.method === 'POST' && url.includes('unsubscribe')) {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    await serviceClient().from('push_subscriptions').delete().eq('endpoint', endpoint);
    return res.status(200).json({ ok: true });
  }

  // POST /api/push/send-daily — invoked by a daily cron (e.g., Vercel Cron)
  // Header: x-cron-token must match PUSH_CRON_TOKEN env var.
  if ((req.method === 'POST' || req.method === 'GET') && url.includes('send-daily')) {
    if (!pushReady) return res.status(503).json({ error: 'push_not_configured' });
    const vercelCron = !!req.headers['x-vercel-cron'];
    const tokenOK = CRON_TOKEN && req.headers['x-cron-token'] === CRON_TOKEN;
    if (!vercelCron && !tokenOK) return res.status(401).json({ error: 'Unauthorized' });
    const results = await sendDailyBriefings();
    return res.status(200).json(results);
  }

  return res.status(404).json({ error: 'Not found', url });
}

// ── Daily briefing logic ────────────────────────────────────────────────────
// Iterates every trip saved in Supabase, computes "is it within 7 days of
// start?" or "is today a trip day?" and sends the appropriate push to each
// user's subscriptions.
async function sendDailyBriefings() {
  const sb = serviceClient();
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);
  const plus7 = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  // Trips whose start_date is today+0..7
  const { data: upcoming } = await sb.from('trips')
    .select('user_id, title, destination, start_date, end_date, gist_id, plan_data')
    .gte('start_date', ymd)
    .lte('start_date', plus7);

  // Trips currently in-progress (start <= today <= end)
  const { data: inProgress } = await sb.from('trips')
    .select('user_id, title, destination, start_date, end_date, gist_id, plan_data')
    .lte('start_date', ymd)
    .gte('end_date', ymd);

  const jobs = [];
  for (const t of upcoming || []) jobs.push(buildPreTripPush(t, today));
  for (const t of inProgress || []) jobs.push(buildOnTripPush(t, today, ymd));
  const notifications = jobs.filter(Boolean);
  if (!notifications.length) return { sent: 0, reason: 'no eligible trips' };

  // Fetch subs for all involved user_ids
  const userIds = [...new Set(notifications.map(n => n.userId))];
  const { data: subs } = await sb.from('push_subscriptions').select('*').in('user_id', userIds);

  const wp = await getWebPush();
  let sent = 0, failed = 0;
  for (const note of notifications) {
    const userSubs = (subs || []).filter(s => s.user_id === note.userId);
    for (const sub of userSubs) {
      try {
        await wp.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(note.payload)
        );
        sent++;
      } catch (err) {
        failed++;
        // Gone / unsubscribed — prune on 404 or 410
        if (err.statusCode === 404 || err.statusCode === 410) {
          await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    }
  }
  return { sent, failed, notified_trips: notifications.length };
}

function daysUntil(dateStr, now) {
  const target = new Date(dateStr + 'T00:00:00Z').getTime();
  const today = new Date(now.toISOString().slice(0,10) + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86400000);
}

function buildPreTripPush(trip, now) {
  const days = daysUntil(trip.start_date, now);
  // Send only on specific milestones to avoid spam
  if (![7, 3, 1].includes(days)) return null;
  const d = trip.destination || trip.title || 'your trip';
  const label = days === 1 ? 'tomorrow' : `in ${days} days`;
  return {
    userId: trip.user_id,
    payload: {
      title: `⏰ ${d} ${label}`,
      body: days === 1 ? 'Packed? Check your packing list + tickets.' : 'Make sure your bookings are confirmed.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: trip.gist_id ? `https://tripva.app/trip?id=${trip.gist_id}` : 'https://tripva.app/mytrips.html',
      tag: `pretrip-${trip.gist_id || trip.user_id}-${days}`,
    }
  };
}

function buildOnTripPush(trip, now, ymd) {
  // Find today's day in the plan
  const plan = trip.plan_data;
  if (!plan || !plan.days) return null;
  const today = plan.days.find(d => d.date === ymd);
  if (!today) return null;
  const tl = today.timeline || [];
  const first = tl[0];
  const d = trip.destination || 'your trip';
  return {
    userId: trip.user_id,
    payload: {
      title: `📍 Day ${today.day || ''} — ${d}`,
      body: first && first.title ? `First up: ${first.title} · ${first.time || ''}` : 'Open your plan to see today.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: trip.gist_id ? `https://tripva.app/trip?id=${trip.gist_id}` : 'https://tripva.app/mytrips.html',
      tag: `ontrip-${trip.gist_id || trip.user_id}-${ymd}`,
    }
  };
}
