import { createClient } from '@supabase/supabase-js';

const FREE_LIMITS = {
  savedTrips: 1,
  dailyTrips: 10,
  editsPerTrip: 2,
  canShare: false,
  canExport: false,
};

const PRO_LIMITS = {
  savedTrips: Infinity,
  dailyTrips: Infinity,
  editsPerTrip: Infinity,
  canShare: true,
  canExport: true,
};

export function getProLimits(plan) {
  return plan === 'pro' ? PRO_LIMITS : FREE_LIMITS;
}

export async function getUserPlan(userId) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return { plan: 'free', limits: FREE_LIMITS };

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await sb
    .from('profiles')
    .select('plan, stripe_customer_id, plan_updated_at')
    .eq('id', userId)
    .maybeSingle();

  const plan = data?.plan || 'free';
  return {
    plan,
    stripeCustomerId: data?.stripe_customer_id || null,
    planUpdatedAt: data?.plan_updated_at || null,
    limits: getProLimits(plan),
  };
}

export function serializeLimits(limits) {
  return {
    ...limits,
    savedTrips: limits.savedTrips === Infinity ? -1 : limits.savedTrips,
    dailyTrips: limits.dailyTrips === Infinity ? -1 : limits.dailyTrips,
    editsPerTrip: limits.editsPerTrip === Infinity ? -1 : limits.editsPerTrip,
  };
}

export const UPGRADE_INFO = {
  price: '$24.99/year',
  monthlyPrice: '$2.99/month',
  benefits: [
    'Unlimited trip generation',
    'Unlimited saved trips',
    'Share & export trips',
    'Priority generation speed',
  ],
};
