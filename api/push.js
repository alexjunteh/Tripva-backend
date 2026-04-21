// api/push.js — step 3: add full constants + factories, still minimal handler
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY      = process.env.SUPABASE_ANON_KEY;
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const pushReady = !!(VAPID_PUBLIC && VAPID_PRIVATE);

const serviceClient = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anonClient = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://tripva.app');
  return res.status(200).json({
    ok: true,
    step: 'constants+factories',
    hasUrl: !!SUPABASE_URL,
    hasService: !!SERVICE_KEY,
    hasAnon: !!ANON_KEY,
    pushReady,
    url: req.url
  });
}
