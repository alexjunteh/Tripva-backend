// api/admin.js — admin-only analytics dashboard data.
// Auth: x-admin-token header must equal process.env.ADMIN_TOKEN.
// Solo-admin pattern — Alex is the only user. Not multi-tenant.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN || '';

const serviceClient = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function setCors(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin.includes('tripva.app') ? origin : 'https://tripva.app');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.headers['x-admin-token'] || req.headers['x-admin-token'.toLowerCase()];
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: 'ADMIN_TOKEN env var not configured' });
  }
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = req.url || '';

  // GET /api/admin/analytics
  if (req.method === 'GET' && url.includes('analytics')) {
    try {
      const sb = serviceClient();
      const now = new Date();
      const d7  = new Date(now.getTime() - 7  * 86400000).toISOString();
      const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();

      // Run all queries in parallel
      const [profilesAll, profiles7d, profiles30d, tripsAll, trips7d, tripsRecent, destAgg] = await Promise.all([
        sb.from('profiles').select('id', { count: 'exact', head: true }),
        sb.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', d7),
        sb.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', d30),
        sb.from('trips').select('id', { count: 'exact', head: true }),
        sb.from('trips').select('id', { count: 'exact', head: true }).gte('created_at', d7),
        sb.from('trips')
          .select('id, title, destination, start_date, end_date, gist_id, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
        sb.from('trips').select('destination'),
      ]);

      // Destination popularity (group on client side — Postgres GROUP BY via Supabase
      // requires RPC or rest aggregation, keep simple here).
      const destCounts = {};
      (destAgg.data || []).forEach(r => {
        const d = (r.destination || 'Unknown').trim();
        if (!d) return;
        destCounts[d] = (destCounts[d] || 0) + 1;
      });
      const topDestinations = Object.entries(destCounts)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 10)
        .map(([destination, count]) => ({ destination, count }));

      // Archetype breakdown — plan_data.trip.archetype stored as JSONB column.
      // Count via a separate selective query (limited to avoid loading huge blobs).
      const { data: archetypeRows } = await sb
        .from('trips')
        .select('plan_data->trip->archetype')
        .limit(5000);
      const archetypeCounts = {};
      (archetypeRows || []).forEach(r => {
        const a = r.archetype || 'unknown';
        archetypeCounts[a] = (archetypeCounts[a] || 0) + 1;
      });

      return res.status(200).json({
        ok: true,
        generated_at: now.toISOString(),
        counts: {
          total_users:   profilesAll.count  ?? 0,
          users_last_7:  profiles7d.count   ?? 0,
          users_last_30: profiles30d.count  ?? 0,
          total_saves:   tripsAll.count     ?? 0,
          saves_last_7:  trips7d.count      ?? 0,
        },
        top_destinations: topDestinations,
        archetype_breakdown: archetypeCounts,
        recent_saves: tripsRecent.data || [],
      });
    } catch (err) {
      console.error('[admin/analytics] error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'Unknown error' });
    }
  }

  return res.status(404).json({ error: 'Not found', url });
}
