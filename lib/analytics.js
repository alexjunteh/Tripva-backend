import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

function getClient() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export async function trackClick({ partner, destination, tripId }) {
  const sb = getClient();
  if (!sb) return;
  try {
    await sb.from('affiliate_clicks').insert({
      partner,
      destination: destination || '',
      trip_id: tripId || 'local',
      clicked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[analytics] trackClick error:', err?.message);
  }
}

export async function getClickStats() {
  const sb = getClient();
  if (!sb) return { clicks: {}, totalClicks: 0 };
  try {
    const { data, error } = await sb
      .from('affiliate_clicks')
      .select('partner');
    if (error) throw error;
    const clicks = {};
    for (const row of data || []) {
      const p = row.partner || 'unknown';
      clicks[p] = (clicks[p] || 0) + 1;
    }
    const totalClicks = Object.values(clicks).reduce((a, b) => a + b, 0);
    return { clicks, totalClicks };
  } catch (err) {
    console.error('[analytics] getClickStats error:', err?.message);
    return { clicks: {}, totalClicks: 0 };
  }
}
