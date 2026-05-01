import { describe, it, expect, vi, beforeAll } from 'vitest'
import Stripe from 'stripe'
import { makeRawReq } from '../helpers/make-req.js'

// Supabase mock — webhook handler calls serviceClient().from(...).update(...)
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }),
  })),
}))

// ── Not-configured path ─────────────────────────────────────────────────────
describe('stripe — not configured (missing env vars)', () => {
  let req

  beforeAll(async () => {
    vi.resetModules()
    vi.unstubAllEnvs()
    // Ensure no Stripe keys are set
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    vi.stubEnv('STRIPE_PRICE_PRO', '')
    const { default: h } = await import('../../api/stripe.js')
    req = makeRawReq(h)
  })

  it('POST /stripe/checkout → 503', async () => {
    const res = await req.post('/api/stripe/checkout').send('{}')
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/stripe_not_configured/)
  })

  it('POST /stripe/webhook → 503', async () => {
    const res = await req.post('/api/stripe/webhook').send('{}')
    expect(res.status).toBe(503)
  })
})

// ── Configured path ─────────────────────────────────────────────────────────
const TEST_SK = 'sk_test_vitest_1234567890'
const TEST_WHSEC = 'whsec_vitestwebhooksecret12345678901234'

describe('stripe webhook — configured', () => {
  let req, stripe

  beforeAll(async () => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv('STRIPE_SECRET_KEY', TEST_SK)
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', TEST_WHSEC)
    vi.stubEnv('STRIPE_PRICE_PRO', 'price_test_pro')
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test_service_key')
    const { default: h } = await import('../../api/stripe.js')
    req = makeRawReq(h)
    stripe = new Stripe(TEST_SK, { apiVersion: '2024-06-20' })
  })

  it('rejects a missing signature → 400', async () => {
    const res = await req
      .post('/api/stripe/webhook')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ type: 'checkout.session.completed' }))
    expect(res.status).toBe(400)
  })

  it('rejects a bad signature → 400', async () => {
    const res = await req
      .post('/api/stripe/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', 'v1=badhash,t=12345')
      .send(JSON.stringify({ type: 'checkout.session.completed' }))
    expect(res.status).toBe(400)
  })

  it('accepts checkout.session.completed with valid signature → 200', async () => {
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-uuid-123',
          customer: 'cus_test',
          subscription: 'sub_test',
        },
      },
    })
    const sig = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WHSEC,
    })
    const res = await req
      .post('/api/stripe/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload)
    expect(res.status).toBe(200)
    expect(res.body.received).toBe(true)
  })

  it('accepts customer.subscription.deleted with valid signature → 200', async () => {
    const payload = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test',
          status: 'canceled',
          metadata: { supabase_user_id: 'user-uuid-123' },
        },
      },
    })
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_WHSEC })
    const res = await req
      .post('/api/stripe/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload)
    expect(res.status).toBe(200)
  })

  it('OPTIONS preflight → 200', async () => {
    const res = await req
      .options('/api/stripe/checkout')
      .set('Origin', 'https://tripva.app')
    expect(res.status).toBe(200)
  })
})
