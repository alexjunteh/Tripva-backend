import { describe, it, expect, vi } from 'vitest'
import { makeReq } from '../helpers/make-req.js'

// Prevent real file I/O from analytics.js
vi.mock('../../lib/analytics.js', () => ({
  trackClick: vi.fn(),
  getClickStats: vi.fn().mockReturnValue({}),
}))

const { default: handler } = await import('../../api/track.js')
const req = makeReq(handler)

describe('POST /api/track', () => {
  it('returns 400 when partner is missing', async () => {
    const res = await req.post('/api/track').send({ destination: 'Bali' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/partner/)
  })

  it('returns 200 for valid click event', async () => {
    const res = await req
      .post('/api/track')
      .send({ partner: 'booking', destination: 'Bali', tripId: 'abc123' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('still returns 200 even if trackClick throws (fire-and-forget)', async () => {
    const { trackClick } = await import('../../lib/analytics.js')
    trackClick.mockImplementationOnce(() => { throw new Error('disk full') })
    const res = await req.post('/api/track').send({ partner: 'booking' })
    expect(res.status).toBe(200)
  })

  it('rejects non-POST methods', async () => {
    const res = await req.get('/api/track')
    expect(res.status).toBe(405)
  })
})
