// api/push.js — reliable shape: hardcoded CORS (dynamic origin reproducibly
// crashes this endpoint on Vercel — deep investigation in commit history).
// Production Tripva origin is fixed; we don't need per-request origin reflection.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL   = process.env.SUPABASE_URL;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY       = process.env.SUPABASE_ANON_KEY;
const VAPID_PUBLIC   = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE  = process.env.VAPID_PRIVATE_KEY || '';
const CRON_TOKEN     = process.env.PUSH_CRON_TOKEN || '';
const VAPID_SUBJECT  = process.env.VAPID_SUBJECT || 'mailto:hello@tripva.app';
const pushReady = !!(VAPID_PUBLIC && VAPID_PRIVATE);

const serviceClient = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anonClient = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

let _wp = null;
async function getWebPush() {
  if (_wp) return _wp;
  const mod = await import('web-push');
  _wp = mod.default || mod;
  if (pushReady && _wp && _wp.setVapidDetails) {
    _wp.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  }
  return _wp;
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://tripva.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';

  // GET /api/push/public-key
  if (req.method === 'GET' && url.includes('public-key')) {
    if (!pushReady) return res.status(503).json({ error: 'push_not_configured' });
    return res.status(200).json({ publicKey: VAPID_PUBLIC });
  }

  // POST /api/push/subscribe
  if (req.method === 'POST' && url.includes('subscribe') && !url.includes('unsubscribe')) {
    if (!pushReady) return res.status(503).json({ error: 'push_not_configured' });
    return doSubscribe(req, res).catch(err => {
      console.error('[push/subscribe] error:', err);
      res.status(500).json({ error: err && err.message ? err.message : 'Unknown error' });
    });
  }

  // POST /api/push/unsubscribe
  if (req.method === 'POST' && url.includes('unsubscribe')) {
    return doUnsubscribe(req, res).catch(err => {
      console.error('[push/unsubscribe] error:', err);
      res.status(500).json({ error: err && err.message ? err.message : 'Unknown error' });
    });
  }

  // POST/GET /api/push/send-daily — Vercel Cron OR x-cron-token
  if ((req.method === 'POST' || req.method === 'GET') && url.includes('send-daily')) {
    if (!pushReady) return res.status(503).json({ error: 'push_not_configured' });
    const vercelCron = !!req.headers['x-vercel-cron'];
    const tokenOK = CRON_TOKEN && req.headers['x-cron-token'] === CRON_TOKEN;
    if (!vercelCron && !tokenOK) return res.status(401).json({ error: 'Unauthorized' });
    return sendDailyBriefings()
      .then(r => res.status(200).json(r))
      .catch(err => {
        console.error('[push/send-daily] error:', err);
        res.status(500).json({ error: err && err.message ? err.message : 'Unknown error' });
      });
  }

  return res.status(404).json({ error: 'Not found', url });
}

async function doSubscribe(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const { data: { user } } = await anonClient().auth.getUser(token);
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

async function doUnsubscribe(req, res) {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  await serviceClient().from('push_subscriptions').delete().eq('endpoint', endpoint);
  return res.status(200).json({ ok: true });
}

async function sendDailyBriefings() {
  const sb = serviceClient();
  const today = new Date();
  const ymd   = today.toISOString().slice(0, 10);
  const plus7 = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const [upcomingRes, inProgressRes] = await Promise.all([
    sb.from('trips')
      .select('user_id, title, destination, start_date, end_date, gist_id, plan_data')
      .gte('start_date', ymd).lte('start_date', plus7),
    sb.from('trips')
      .select('user_id, title, destination, start_date, end_date, gist_id, plan_data')
      .lte('start_date', ymd).gte('end_date', ymd)
  ]);

  const jobs = [];
  for (const t of upcomingRes.data || []) {
    const p = buildPreTripPush(t, today);
    if (p) jobs.push(p);
  }
  for (const t of inProgressRes.data || []) {
    const p = buildOnTripPush(t, today, ymd);
    if (p) jobs.push(p);
  }
  if (!jobs.length) return { sent: 0, reason: 'no eligible trips' };

  const userIds = Array.from(new Set(jobs.map(j => j.userId)));
  const { data: subs } = await sb.from('push_subscriptions').select('*').in('user_id', userIds);

  const wp = await getWebPush();
  let sent = 0, failed = 0;
  for (const note of jobs) {
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
        if (err.statusCode === 404 || err.statusCode === 410) {
          await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    }
  }
  return { sent, failed, notified_trips: jobs.length };
}

function daysUntil(dateStr, now) {
  const target = new Date(dateStr + 'T00:00:00Z').getTime();
  const today  = new Date(now.toISOString().slice(0,10) + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86400000);
}

function buildPreTripPush(trip, now) {
  const days = daysUntil(trip.start_date, now);
  if (days !== 7 && days !== 3 && days !== 1) return null;
  const d = trip.destination || trip.title || 'your trip';
  const label = days === 1 ? 'tomorrow' : ('in ' + days + ' days');
  return {
    userId: trip.user_id,
    payload: {
      title: '⏰ ' + d + ' ' + label,
      body: days === 1 ? 'Packed? Check your packing list + tickets.' : 'Make sure your bookings are confirmed.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: trip.gist_id ? ('https://tripva.app/trip?id=' + trip.gist_id) : 'https://tripva.app/mytrips.html',
      tag: 'pretrip-' + (trip.gist_id || trip.user_id) + '-' + days,
    }
  };
}

function buildOnTripPush(trip, now, ymd) {
  const plan = trip.plan_data;
  if (!plan || !plan.days) return null;
  const today = plan.days.find(function(d){ return d.date === ymd; });
  if (!today) return null;
  const tl = today.timeline || [];
  const first = tl[0];
  const d = trip.destination || 'your trip';
  return {
    userId: trip.user_id,
    payload: {
      title: '📍 Day ' + (today.day || '') + ' — ' + d,
      body: first && first.title ? ('First up: ' + first.title + ' · ' + (first.time || '')) : 'Open your plan to see today.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: trip.gist_id ? ('https://tripva.app/trip?id=' + trip.gist_id) : 'https://tripva.app/mytrips.html',
      tag: 'ontrip-' + (trip.gist_id || trip.user_id) + '-' + ymd,
    }
  };
}
