import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeReq } from '../helpers/make-req.js'

// Each test uses a unique IP to avoid sharing the in-memory rate-limit window
let ipSeed = 1
const nextIp = () => `10.0.0.${ipSeed++}`

describe('POST /api/save', () => {
  let req

  beforeEach(async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test_token')
    // Reset modules so the rate-limit Map starts clean each describe block
    vi.resetModules()
    const { default: handler } = await import('../../api/save.js')
    req = makeReq(handler)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns 400 when plan is missing', async () => {
    const res = await req
      .post('/api/save')
      .set('x-forwarded-for', nextIp())
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing plan/)
  })

  it('returns 500 when GITHUB_TOKEN is not set', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('GITHUB_TOKEN', '')
    vi.resetModules()
    const { default: h } = await import('../../api/save.js')
    const r = makeReq(h)
    const res = await r
      .post('/api/save')
      .set('x-forwarded-for', nextIp())
      .send({ plan: { trip: { name: 'Bali trip' } } })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/GITHUB_TOKEN/)
  })

  it('returns 200 with id and url on GitHub success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'gist_abc123' }),
    }))

    const res = await req
      .post('/api/save')
      .set('x-forwarded-for', nextIp())
      .send({ plan: { trip: { name: 'Paris honeymoon' } } })

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('gist_abc123')
    expect(res.body.url).toContain('gist_abc123')
  })

  it('returns 502 when GitHub API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Validation failed',
    }))

    const res = await req
      .post('/api/save')
      .set('x-forwarded-for', nextIp())
      .send({ plan: { trip: { name: 'Test' } } })

    expect(res.status).toBe(502)
  })

  it('sets X-RateLimit headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'x' }),
    }))

    const ip = nextIp()
    const res = await req
      .post('/api/save')
      .set('x-forwarded-for', ip)
      .send({ plan: {} })

    expect(res.headers['x-ratelimit-limit']).toBe('10')
    expect(Number(res.headers['x-ratelimit-remaining'])).toBeLessThan(10)
  })

  it('returns 429 after 10 requests from same IP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'x' }),
    }))

    const ip = nextIp()
    const payload = () =>
      req.post('/api/save').set('x-forwarded-for', ip).send({ plan: {} })

    for (let i = 0; i < 10; i++) await payload()
    const res = await payload()
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/Too many requests/)
  })

  it('rejects non-POST', async () => {
    const res = await req.get('/api/save')
    expect(res.status).toBe(405)
  })
})
