import { createClient } from '@supabase/supabase-js';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isCostlyAuthRequired() {
  return TRUE_VALUES.has(String(process.env.REQUIRE_AUTH_FOR_COSTLY_ENDPOINTS || '').toLowerCase());
}

export function getBearerToken(req) {
  const header = req.headers?.authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function requireSupabaseUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, body: { error: 'Not authenticated' } };
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, status: 503, body: { error: 'Auth unavailable' } };
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user } = {}, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { ok: false, status: 401, body: { error: 'Invalid token' } };
  }

  return { ok: true, user };
}

export async function requireCostlyAuth(req) {
  if (!isCostlyAuthRequired()) return { ok: true, skipped: true };
  return requireSupabaseUser(req);
}

export function sendAuthFailure(res, authCheck) {
  return res.status(authCheck.status || 401).json(authCheck.body || { error: 'Unauthorized' });
}
