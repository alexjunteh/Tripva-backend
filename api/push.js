// api/push.js — step 5: full routes WITHOUT web-push or send-daily logic
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL   = process.env.SUPABASE_URL;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY       = process.env.SUPABASE_ANON_KEY;
const VAPID_PUBLIC   = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE  = process.env.VAPID_PRIVATE_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://tripva.app';
const pushReady = !!(VAPID_PUBLIC && VAPID_PRIVATE);

const serviceClient = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anonClient = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

function setCors(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin.includes('tripva.app') ? origin : ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-token');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  try {
    if (req.method === 'GET' && url.includes('public-key')) {
      if (!pushReady) return res.status(503).json({ error: 'push_not_configured' });
      return res.status(200).json({ publicKey: VAPID_PUBLIC });
    }

    if (req.method === 'POST' && url.includes('subscribe') && !url.includes('unsubscribe')) {
      if (!pushReady) return res.status(503).json({ error: 'push_not_configured' });
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

    if (req.method === 'POST' && url.includes('unsubscribe')) {
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
      await serviceClient().from('push_subscriptions').delete().eq('endpoint', endpoint);
      return res.status(200).json({ ok: true });
    }

    if ((req.method === 'POST' || req.method === 'GET') && url.includes('send-daily')) {
      return res.status(503).json({ error: 'push_not_configured', note: 'send-daily temporarily disabled' });
    }
  } catch (err) {
    console.error('[push] handler error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }

  return res.status(404).json({ error: 'Not found', url });
}
