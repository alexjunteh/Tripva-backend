import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeReq } from '../helpers/make-req.js'

// Holds the current spy — reassigned in beforeEach so the class constructor
// always calls the latest version via the closure below.
let mockCreate = vi.fn()

vi.mock('openai', () => {
  // The constructor stores a reference to a wrapper that always delegates to
  // the current `mockCreate` value.  This survives vi.resetModules() because
  // the mock factory is only evaluated once; the wrapper closure is what keeps
  // things in sync across beforeEach resets.
  const createWrapper = (...args) => mockCreate(...args)

  class MockOpenAI {
    constructor() {
      this.chat = { completions: { create: createWrapper } }
    }
  }
  return { default: MockOpenAI }
})

let ipSeed = 200
const nextIp = () => `10.1.0.${ipSeed++}`

describe('GET /api/photospot', () => {
  let req

  beforeEach(async () => {
    // Reset modules so the module-level spotCache Map starts empty each test
    vi.resetModules()

    mockCreate = vi.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            spots: [{
              name: 'Eiffel Tower',
              description: 'Iconic landmark',
              bestTime: 'Golden hour',
              tags: ['golden hour'],
              lat: 48.8584,
              lng: 2.2945,
              tip: 'Arrive early',
            }],
          }),
        },
      }],
    })

    const { default: handler } = await import('../../api/photospot.js')
    req = makeReq(handler)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 400 when destination is missing', async () => {
    const res = await req
      .get('/api/photospot')
      .set('x-forwarded-for', nextIp())
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('destination query param required')
  })

  it('returns 200 with spots array for valid destination', async () => {
    const res = await req
      .get('/api/photospot?destination=Paris')
      .set('x-forwarded-for', nextIp())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.spots)).toBe(true)
    expect(res.body.spots.length).toBeGreaterThan(0)
    expect(res.body.spots[0].name).toBe('Eiffel Tower')
  })

  it('cache hit — OpenAI called only once for same destination', async () => {
    const ip = nextIp()
    await req
      .get('/api/photospot?destination=Tokyo')
      .set('x-forwarded-for', ip)
    await req
      .get('/api/photospot?destination=Tokyo')
      .set('x-forwarded-for', ip)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('returns 405 for non-GET methods', async () => {
    const res = await req
      .post('/api/photospot')
      .set('x-forwarded-for', nextIp())
      .send({})
    expect(res.status).toBe(405)
  })
})
