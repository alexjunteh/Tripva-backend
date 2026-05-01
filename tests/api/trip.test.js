import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../api/trip.js'
import { makeReq } from '../helpers/make-req.js'

const req = makeReq(handler)

beforeEach(() => { vi.unstubAllGlobals() })
afterEach(() => { vi.restoreAllMocks() })

describe('GET /api/trip', () => {
  it('returns 400 when id is missing', async () => {
    const res = await req.get('/api/trip')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing id/)
  })

  it('returns 404 when gist not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }))
    const res = await req.get('/api/trip?id=nonexistent')
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })

  it('returns 404 when gist has no plan.json file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: {} }),
    }))
    const res = await req.get('/api/trip?id=abc')
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })

  it('returns 200 with rawPlan for a valid gist', async () => {
    const plan = { trip: { name: 'Bali', destination: 'Indonesia' }, days: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: { 'plan.json': { content: JSON.stringify(plan) } }
      }),
    }))
    const res = await req.get('/api/trip?id=valid_gist_id')
    expect(res.status).toBe(200)
    expect(res.body.rawPlan).toMatchObject({ trip: { name: 'Bali' } })
  })

  it('returns 502 on GitHub non-404 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }))
    const res = await req.get('/api/trip?id=abc')
    expect(res.status).toBe(502)
  })

  it('rejects non-GET', async () => {
    const res = await req.post('/api/trip')
    expect(res.status).toBe(405)
  })
})
