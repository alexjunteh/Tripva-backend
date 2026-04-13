/**
 * /api/user — unified auth + trips endpoint
 * Routes:
 *   POST /api/user/magic-link
 *   POST /api/user/verify
 *   GET  /api/user/me
 *   GET  /api/user/trips
 *   POST /api/user/trips/save
 *   DELETE /api/user/trips/:id
 */
import { createClient } from '@supabase/supabase-js';
import { applyCors } from '../lib/middleware.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const anonClient = (token) => createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
  global: token ? { headers: { Authorization: `Bearer ${token}` } } : {}
});
const serviceClient = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const getToken = (req) => req.headers.authorization?.replace('Bearer ', '') || null;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const url = req.url?.split('?')[0] || '';
  const token = getToken(req);

  // POST /api/user/magic-link
  if (req.method === 'POST' && url.includes('magic-link')) {
    const { email, redirectTo } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const { error } = await anonClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }  // OTP code only — avoids email scanner burning the link
    });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // POST /api/user/verify
  if (req.method === 'POST' && url.includes('verify')) {
    const { token: otp, type, email } = req.body || {};
    const { data, error } = await anonClient().auth.verifyOtp({ email, token: otp, type: type || 'magiclink' });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true, access_token: data.session?.access_token, user: { id: data.user?.id, email: data.user?.email } });
  }

  // GET /api/user/me
  if (req.method === 'GET' && url.endsWith('/me')) {
    if (!token) return res.status(401).json({ error: 'No token' });
    const { data: { user }, error } = await anonClient(token).auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    return res.status(200).json({ id: user.id, email: user.email });
  }

  // GET /api/user/trips
  if (req.method === 'GET' && url.endsWith('/trips')) {
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { data, error } = await anonClient(token).from('trips')
      .select('id, title, destination, start_date, end_date, share_url, created_at')
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST /api/user/trips/save
  if (req.method === 'POST' && url.includes('trips/save')) {
    const { plan, shareUrl } = req.body || {};
    if (!plan) return res.status(400).json({ error: 'Missing plan' });
    if (!token) return res.status(200).json({ saved: false, shareUrl });
    const { data: { user }, error: authErr } = await anonClient(token).auth.getUser(token);
    if (authErr || !user) return res.status(200).json({ saved: false, shareUrl });
    const { data, error } = await anonClient(token).from('trips').insert({
      user_id: user.id,
      title: plan.trip?.name || plan.destination || 'My Trip',
      destination: plan.destination || plan.trip?.destination || '',
      start_date: plan.trip?.startDate || plan.days?.[0]?.date || '',
      end_date: plan.trip?.endDate || plan.days?.[plan.days.length - 1]?.date || '',
      plan_data: plan,
      share_url: shareUrl || null,
      updated_at: new Date().toISOString()
    }).select('id').single();
    if (error) return res.status(400).json({ error: error.message });
    await serviceClient().rpc('increment_trips', { user_id_input: user.id }).catch(() => {});
    return res.status(200).json({ id: data.id, saved: true, shareUrl });
  }

  // DELETE /api/user/trips/:id
  const delMatch = url.match(/\/trips\/([a-f0-9-]{36})$/);
  if (req.method === 'DELETE' && delMatch) {
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { error } = await anonClient(token).from('trips').delete().eq('id', delMatch[1]);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: 'Not found', url });
}
