import { describe, it, expect, beforeEach } from 'vitest'
import { applyCors, checkRateLimit, getClientIp } from '../../lib/middleware.js'

// Minimal mock req/res for direct function testing
function makeRes() {
  const headers = {}
  return {
    headers,
    statusCode: null,
    setHeader(k, v) { headers[k.toLowerCase()] = v },
    writeHead(code) { this.statusCode = code; return this },
    end() {},
  }
}

function makeReq(method = 'GET', origin = null, ip = null) {
  return {
    method,
    headers: {
      ...(origin ? { origin } : {}),
      ...(ip ? { 'x-forwarded-for': ip } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
  }
}

// ── CORS ────────────────────────────────────────────────────────────────────
describe('applyCors', () => {
  it('allows https://tripva.app', () => {
    const res = makeRes()
    applyCors(makeReq('GET', 'https://tripva.app'), res)
    expect(res.headers['access-control-allow-origin']).toBe('https://tripva.app')
  })

  it('allows Vercel preview deployments', () => {
    const res = makeRes()
    applyCors(makeReq('GET', 'https://tripva-frontend-abc123-alexs-projects.vercel.app'), res)
    expect(res.headers['access-control-allow-origin'])
      .toBe('https://tripva-frontend-abc123-alexs-projects.vercel.app')
  })

  it('allows localhost for dev', () => {
    const res = makeRes()
    applyCors(makeReq('GET', 'http://localhost:3000'), res)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
  })

  it('does not set ACAO header for unknown origins', () => {
    const res = makeRes()
    applyCors(makeReq('GET', 'https://evil-tripva.app'), res)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('blocks CORS bypass via substring — evil-tripva.app gets no header', () => {
    const res = makeRes()
    applyCors(makeReq('GET', 'https://not-tripva.app'), res)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('sets * for requests with no origin (server-to-server)', () => {
    const res = makeRes()
    applyCors(makeReq('GET', null), res)
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })

  it('returns true and sends 204 for OPTIONS preflight', () => {
    const res = makeRes()
    const result = applyCors(makeReq('OPTIONS', 'https://tripva.app'), res)
    expect(result).toBe(true)
    expect(res.statusCode).toBe(204)
  })
})

// ── Rate limiting ────────────────────────────────────────────────────────────
describe('checkRateLimit', () => {
  // Each test gets a unique key to avoid sharing the in-memory window
  let seed = 9000
  const nextIp = () => `192.168.${seed++}.1`

  it('allows the first 10 requests', () => {
    const ip = nextIp()
    for (let i = 1; i <= 10; i++) {
      const result = checkRateLimit(ip)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(10 - i)
    }
  })

  it('blocks the 11th request', () => {
    const ip = nextIp()
    for (let i = 0; i < 10; i++) checkRateLimit(ip)
    const result = checkRateLimit(ip)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('returns a resetAt ISO timestamp', () => {
    const result = checkRateLimit(nextIp())
    expect(result.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ── IP extraction ─────────────────────────────────────────────────────────────
describe('getClientIp', () => {
  it('picks first IP from x-forwarded-for', () => {
    const req = makeReq('GET', null, '1.2.3.4, 5.6.7.8')
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('falls back to socket.remoteAddress', () => {
    const req = { headers: {}, socket: { remoteAddress: '9.9.9.9' } }
    expect(getClientIp(req)).toBe('9.9.9.9')
  })

  it('returns unknown when no IP is available', () => {
    const req = { headers: {}, socket: {} }
    expect(getClientIp(req)).toBe('unknown')
  })
})
