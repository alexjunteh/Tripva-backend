// api/stripe.js — Stripe subscription scaffold for the Pro plan.
//
// Routes (all under /api/stripe/*, proxied via vercel.json rewrites):
//   POST /api/stripe/checkout  — create a Stripe Checkout session for Pro
//   POST /api/stripe/portal    — open the billing portal for an existing sub
//   POST /api/stripe/webhook   — Stripe event handler (updates profiles.plan)
//
// Env vars required to activate:
//   STRIPE_SECRET_KEY     — sk_test_... in test mode / sk_live_... in prod
//   STRIPE_WEBHOOK_SECRET — whsec_... from the Stripe webhook endpoint
//   STRIPE_PRICE_PRO      — price_... for the Pro plan
// Without these, checkout and webhook return 503 with a clear message
// instead of 500 — frontend can show a friendly "billing not ready" toast.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const SECRET_KEY    = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PRICE_PRO     = process.env.STRIPE_PRICE_PRO || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://tripva.app';

const stripe = SECRET_KEY ? new Stripe(SECRET_KEY, { apiVersion: '2024-06-20' }) : null;
const serviceClient = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anonClient = (token) => {
  const c = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  if (token) c.auth.setSession && c.auth.setSession({ access_token: token, refresh_token: 'none' });
  return c;
};

function setCors(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin.includes('tripva.app') ? origin : ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature');
}

function isConfigured() {
  return !!(stripe && PRICE_PRO);
}

// Read raw body for Stripe webhook signature verification. Vercel Node
// functions parse JSON by default; we need raw bytes for HMAC check.
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';

  // ── POST /api/stripe/checkout ────────────────────────────────────────────
  if (req.method === 'POST' && url.includes('checkout')) {
    if (!isConfigured()) {
      return res.status(503).json({
        error: 'stripe_not_configured',
        message: 'Billing not enabled yet — STRIPE_SECRET_KEY + STRIPE_PRICE_PRO required in Vercel env.'
      });
    }
    const body = await readJsonBody(req);
    const { token, successUrl, cancelUrl } = body || {};
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    // Look up user via Supabase
    const { data: { user }, error: authErr } = await anonClient(token).auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    try {
      const origin = req.headers.origin || ALLOWED_ORIGIN;
      // Re-use existing customer if the profile already has one
      const { data: profile } = await serviceClient()
        .from('profiles').select('stripe_customer_id, email').eq('id', user.id).maybeSingle();

      let customerId = profile?.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { supabase_user_id: user.id }
        });
        customerId = customer.id;
        await serviceClient().from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: PRICE_PRO, quantity: 1 }],
        success_url: (successUrl || (origin + '/mytrips.html?upgraded=1')) + '&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: cancelUrl || (origin + '/?checkout=cancelled'),
        allow_promotion_codes: true,
        client_reference_id: user.id,
        subscription_data: { metadata: { supabase_user_id: user.id } }
      });

      return res.status(200).json({ url: session.url, sessionId: session.id });
    } catch (err) {
      console.error('[stripe/checkout] error:', err?.message);
      return res.status(500).json({ error: err?.message || 'Checkout failed' });
    }
  }

  // ── POST /api/stripe/portal ──────────────────────────────────────────────
  if (req.method === 'POST' && url.includes('portal')) {
    if (!isConfigured()) return res.status(503).json({ error: 'stripe_not_configured' });
    const body = await readJsonBody(req);
    const { token, returnUrl } = body || {};
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { data: { user } } = await anonClient(token).auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    const { data: profile } = await serviceClient()
      .from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle();
    if (!profile?.stripe_customer_id) return res.status(400).json({ error: 'No billing record' });
    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: returnUrl || (req.headers.origin || ALLOWED_ORIGIN) + '/mytrips.html'
      });
      return res.status(200).json({ url: portal.url });
    } catch (err) {
      console.error('[stripe/portal] error:', err?.message);
      return res.status(500).json({ error: err?.message });
    }
  }

  // ── POST /api/stripe/webhook ─────────────────────────────────────────────
  // Stripe POSTs events here. We verify via HMAC using STRIPE_WEBHOOK_SECRET
  // then flip profiles.plan between 'free' and 'pro' based on subscription
  // status. Raw body needed for signature check, hence bodyParser:false above.
  if (req.method === 'POST' && url.includes('webhook')) {
    if (!stripe || !WEBHOOK_SECRET) {
      return res.status(503).json({ error: 'stripe_not_configured' });
    }
    const raw = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
    } catch (err) {
      console.error('[stripe/webhook] bad signature:', err?.message);
      return res.status(400).send('Bad signature');
    }

    try {
      const sb = serviceClient();
      switch (event.type) {
        case 'checkout.session.completed': {
          const s = event.data.object;
          const userId = s.client_reference_id || s.metadata?.supabase_user_id;
          if (userId) {
            await sb.from('profiles').update({
              plan: 'pro',
              stripe_customer_id: s.customer,
              stripe_subscription_id: s.subscription,
              plan_updated_at: new Date().toISOString()
            }).eq('id', userId);
          }
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const userId = sub.metadata?.supabase_user_id;
          const active = sub.status === 'active' || sub.status === 'trialing';
          if (userId) {
            await sb.from('profiles').update({
              plan: active ? 'pro' : 'free',
              stripe_subscription_id: sub.id,
              plan_updated_at: new Date().toISOString()
            }).eq('id', userId);
          }
          break;
        }
      }
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('[stripe/webhook] handler error:', err?.message);
      return res.status(500).json({ error: err?.message });
    }
  }

  return res.status(404).json({ error: 'Not found', url });
}

// Helper: parse JSON body manually since we set bodyParser:false
async function readJsonBody(req) {
  const buf = await readRawBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch (_) { return {}; }
}
