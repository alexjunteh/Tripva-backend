// api/push.js — step 2 of isolation: add imports but no module-level work
import { createClient } from '@supabase/supabase-js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://tripva.app');
  return res.status(200).json({ ok: true, step: 'import-only', url: req.url });
}
