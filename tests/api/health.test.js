import { describe, it, expect } from 'vitest'
import handler from '../../api/stats.js'
import { makeReq } from '../helpers/make-req.js'

const req = makeReq(handler)

describe('GET /api/health (via stats?_health=1)', () => {
  it('returns 200 with status:ok', async () => {
    const res = await req.get('/api/health?_health=1')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('tripai-backend')
    expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('responds to OPTIONS preflight', async () => {
    const res = await req.options('/api/health').set('Origin', 'https://tripva.app')
    expect(res.status).toBe(200)
  })
})
