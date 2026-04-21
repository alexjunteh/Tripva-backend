// api/push.js — step 7: route dispatch inline, NO setCors function
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

export default function handler(req, res) {
  // Inline CORS rather than calling a top-level setCors — having another
  // function declaration at module scope alongside the default export
  // reproducibly 500s this endpoint under Vercel. Stuffing logic inline avoids.
  const origin = (req && req.headers && req.headers.origin) || '';
  const allow = (typeof origin === 'string' && origin.indexOf('tripva.app') !== -1) ? origin : ALLOWED_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  const url = req.url || '';
  if (req.method === 'GET' && url.includes('public-key')) {
    if (!pushReady) return res.status(503).json({ error: 'push_not_configured' });
    return res.status(200).json({ publicKey: VAPID_PUBLIC });
  }
  return res.status(200).json({ step: 'route-dispatch-inline-cors', method: req.method, url });
}
