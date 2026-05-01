import { describe, it, expect, vi } from 'vitest'
import { makeReq } from '../helpers/make-req.js'

// Mock Supabase so tests run without real credentials
const mockSignInWithOtp = vi.fn()
const mockSignInWithOAuth = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      signInWithOAuth: mockSignInWithOAuth,
      getUser: mockGetUser,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  })),
}))

const { default: handler } = await import('../../api/user.js')
const req = makeReq(handler)

describe('POST /api/user/magic-link', () => {
  it('returns 400 when email is missing', async () => {
    const res = await req.post('/api/user/magic-link').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/email/)
  })

  it('returns 200 when Supabase accepts the OTP request', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ error: null })
    const res = await req.post('/api/user/magic-link').send({ email: 'user@example.com' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 400 when Supabase returns an error (e.g. invalid email)', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ error: { message: 'Email address is invalid' } })
    const res = await req.post('/api/user/magic-link').send({ email: 'bad-email' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid/i)
  })
})

describe('POST /api/user/oauth', () => {
  it('returns 400 for unknown provider', async () => {
    const res = await req.post('/api/user/oauth').send({ provider: 'facebook' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/provider/)
  })

  it('returns 400 when provider is missing', async () => {
    const res = await req.post('/api/user/oauth').send({})
    expect(res.status).toBe(400)
  })

  it('returns 200 with auth URL when provider is enabled', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { url: 'https://accounts.google.com/oauth/auth?...' },
      error: null,
    })
    // Stub the probe fetch to return a non-400 (provider is enabled)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 302 }))

    const res = await req
      .post('/api/user/oauth')
      .set('Origin', 'https://tripva.app')
      .send({ provider: 'google' })

    expect(res.status).toBe(200)
    expect(res.body.url).toContain('accounts.google.com')
    vi.unstubAllGlobals()
  })

  it('returns 503 when provider is not enabled in Supabase', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { url: 'https://supabase.co/auth/v1/authorize?...' },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 400,
      text: async () => 'validation_failed: provider not enabled',
    }))

    const res = await req
      .post('/api/user/oauth')
      .set('Origin', 'https://tripva.app')
      .send({ provider: 'google' })

    expect(res.status).toBe(503)
    expect(res.body.error).toBe('provider_not_enabled')
    vi.unstubAllGlobals()
  })
})

describe('GET /api/user/me', () => {
  it('returns 401 without an auth token', async () => {
    const res = await req.get('/api/user/me')
    expect(res.status).toBe(401)
  })

  it('returns 200 with user profile when token is valid', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-1', email: 'u@test.com' } } })
    const res = await req
      .get('/api/user/me')
      .set('Authorization', 'Bearer valid_token')
    expect(res.status).toBe(200)
    // /me returns { id, email } directly (not nested under .user)
    expect(res.body).toMatchObject({ id: 'user-1', email: 'u@test.com' })
  })

  it('returns 401 when token is invalid', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await req
      .get('/api/user/me')
      .set('Authorization', 'Bearer bad_token')
    expect(res.status).toBe(401)
  })
})
