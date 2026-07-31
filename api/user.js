/**
 * /api/user — unified auth + trips endpoint
 * Routes:
 *   POST /api/user/magic-link
 *   POST /api/user/verify
 *   GET  /api/user/me          — user profile + plan status
 *   GET  /api/user/plan        — Pro status, limits, usage, upgrade info
 *   GET  /api/user/trips
 *   POST /api/user/trips/save  — save limit: 1 free, unlimited Pro
 *   DELETE /api/user/trips/:id
 */
import { createClient } from '@supabase/supabase-js';
import { applyCors } from '../lib/middleware.js';
import { getUserPlan, getProLimits, serializeLimits, UPGRADE_INFO } from '../lib/pro.js';

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
  // POST /api/user/oauth — Google or Apple OAuth
  if (req.method === 'POST' && url.includes('oauth')) {
    const { provider, returnTo } = req.body || {};
    if (!provider || !['google', 'apple'].includes(provider)) {
      return res.status(400).json({ error: 'provider must be google or apple' });
    }
    const origin = req.headers.origin || 'https://tripva.app';
    // Let the client tell us where to land post-auth (trip.html?id=... vs mytrips)
    const redirect = returnTo && returnTo.startsWith(origin)
      ? returnTo
      : origin + '/mytrips.html';
    const { data, error } = await anonClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirect, skipBrowserRedirect: true }
    });
    if (error) return res.status(400).json({ error: error.message });
    // signInWithOAuth just builds the URL — it doesn't verify the provider is
    // enabled. Probe the authorize endpoint so we can return a CLEAN error if
    // the Supabase project hasn't enabled this provider yet. Avoids sending the
    // user to a raw Supabase 400 page.
    try {
      const probe = await fetch(data.url, { method: 'GET', redirect: 'manual' });
      if (probe.status === 400) {
        const body = await probe.text();
        if (body.includes('not enabled') || body.includes('validation_failed')) {
          return res.status(503).json({
            error: 'provider_not_enabled',
            message: `${provider} sign-in isn't enabled yet — please use magic link.`,
            provider
          });
        }
      }
    } catch (_) { /* non-fatal — fall through and return the URL */ }
    return res.status(200).json({ url: data.url });
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
    const userPlan = await getUserPlan(user.id);
    return res.status(200).json({
      id: user.id,
      email: user.email,
      plan: userPlan.plan,
      limits: serializeLimits(userPlan.limits),
    });
  }

  // GET /api/user/trips
  if (req.method === 'GET' && url.endsWith('/trips')) {
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { data, error } = await anonClient(token).from('trips')
      .select('id, title, destination, start_date, end_date, share_url, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  // GET /api/user/plan — Pro status, limits, usage
  if (req.method === 'GET' && url.endsWith('/plan')) {
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { data: { user }, error } = await anonClient(token).auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    const userPlan = await getUserPlan(user.id);
    const { count: savedCount } = await anonClient(token).from('trips')
      .select('id', { count: 'exact', head: true });

    return res.status(200).json({
      plan: userPlan.plan,
      limits: serializeLimits(userPlan.limits),
      usage: { savedTrips: savedCount || 0 },
      canUpgrade: userPlan.plan !== 'pro',
      hasStripeCustomer: !!userPlan.stripeCustomerId,
      upgrade: userPlan.plan !== 'pro' ? UPGRADE_INFO : null,
    });
  }

  // POST /api/user/trips/save
  if (req.method === 'POST' && url.includes('trips/save')) {
    const { plan, shareUrl } = req.body || {};
    if (!plan) return res.status(400).json({ error: 'Missing plan' });
    if (!token) return res.status(200).json({ saved: false, shareUrl });
    const { data: { user }, error: authErr } = await anonClient(token).auth.getUser(token);
    if (authErr || !user) return res.status(200).json({ saved: false, shareUrl });

    // Pro gate: free users can save 1 trip, Pro unlimited
    const userPlan = await getUserPlan(user.id);
    if (userPlan.plan !== 'pro') {
      const { count } = await anonClient(token).from('trips')
        .select('id', { count: 'exact', head: true });
      if ((count || 0) >= userPlan.limits.savedTrips) {
        return res.status(403).json({
          error: 'save_limit_reached',
          message: `Free plan allows ${userPlan.limits.savedTrips} saved trip. Upgrade to Pro for unlimited.`,
          limit: userPlan.limits.savedTrips,
          current: count,
          upgrade: UPGRADE_INFO,
        });
      }
    }

    const row = {
      user_id: user.id,
      title: plan.trip?.name || plan.destination || 'My Trip',
      destination: plan.destination || plan.trip?.destination || '',
      start_date: plan.trip?.startDate || plan.days?.[0]?.date || '',
      end_date: plan.trip?.endDate || plan.days?.[plan.days.length - 1]?.date || '',
      plan_data: plan,
      share_url: shareUrl || null,
      updated_at: new Date().toISOString()
    };
    let data, error;
    if (shareUrl) {
      const upd = await anonClient(token).from('trips')
        .update(row).eq('user_id', user.id).eq('share_url', shareUrl)
        .select('id').maybeSingle();
      if (upd.data) { data = upd.data; error = upd.error; }
      else {
        const ins = await anonClient(token).from('trips').insert(row).select('id').single();
        data = ins.data; error = ins.error;
      }
    } else {
      const ins = await anonClient(token).from('trips').insert(row).select('id').single();
      data = ins.data; error = ins.error;
    }
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
