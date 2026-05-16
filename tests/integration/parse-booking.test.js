import { describe, it, expect, vi, beforeEach } from 'vitest';

const makeReq = (body) => ({ method: 'POST', body, query: {}, headers: { origin: 'https://tripva.app' } });
const makeRes = () => {
  const r = { _status: 200, _body: null, _headers: {} };
  r.status = (s) => { r._status = s; return r; };
  r.json   = (b) => { r._body = b; return r; };
  r.setHeader = (k, v) => { r._headers[k] = v; };
  r.end = () => {};
  return r;
};

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() { this.messages = { create: mockCreate }; }
  },
}));

describe('api/parse-booking', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('returns 503 when ANTHROPIC_API_KEY not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { default: handler } = await import('../../api/parse-booking.js');
    const res = makeRes();
    await handler(makeReq({ text: 'flight confirmation text here' }), res);
    expect(res._status).toBe(503);
  });

  it('returns 405 for non-POST', async () => {
    const { default: handler } = await import('../../api/parse-booking.js');
    const res = makeRes();
    await handler({ method: 'GET', body: {}, query: {}, headers: { origin: 'https://tripva.app' } }, res);
    expect(res._status).toBe(405);
  });

  it('returns 400 when text is missing', async () => {
    const { default: handler } = await import('../../api/parse-booking.js');
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when text is too short (< 20 chars)', async () => {
    const { default: handler } = await import('../../api/parse-booking.js');
    const res = makeRes();
    await handler(makeReq({ text: 'short' }), res);
    expect(res._status).toBe(400);
  });

  it('returns empty anchors when model returns no JSON array', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ text: 'No booking found in this text.' }] });
    const { default: handler } = await import('../../api/parse-booking.js');
    const res = makeRes();
    await handler(makeReq({ text: 'This is not a booking confirmation at all.' }), res);
    expect(res._status).toBe(200);
    expect(res._body.anchors).toEqual([]);
  });

  it('returns parsed anchors on valid model response', async () => {
    const anchor = {
      type: 'flight', from: 'KUL', to: 'NRT',
      date: '2024-10-01', departureTime: '09:30', arrivalTime: '17:00',
      flightNumber: 'MH70', confirmationRef: 'ABC123',
      summary: 'MH70 KUL → NRT on 01 Oct at 09:30',
    };
    mockCreate.mockResolvedValueOnce({ content: [{ text: JSON.stringify([anchor]) }] });
    const { default: handler } = await import('../../api/parse-booking.js');
    const res = makeRes();
    await handler(makeReq({ text: 'Your Malaysia Airlines booking MH70 KUL to NRT on 1 Oct 2024.' }), res);
    expect(res._status).toBe(200);
    expect(res._body.anchors).toHaveLength(1);
    expect(res._body.anchors[0].type).toBe('flight');
    expect(res._body.anchors[0].from).toBe('KUL');
    expect(res._body.anchors[0].to).toBe('NRT');
  });

  it('returns empty anchors when model returns malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ text: '[{broken json' }] });
    const { default: handler } = await import('../../api/parse-booking.js');
    const res = makeRes();
    await handler(makeReq({ text: 'Booking confirmation with some flight details here.' }), res);
    expect(res._status).toBe(200);
    expect(res._body.anchors).toEqual([]);
  });

  it('sets X-RateLimit headers on every response', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ text: '[]' }] });
    const { default: handler } = await import('../../api/parse-booking.js');
    const res = makeRes();
    await handler(makeReq({ text: 'Booking confirmation with some flight details here.' }), res);
    expect(res._headers['X-RateLimit-Limit']).toBe('10');
    expect(res._headers).toHaveProperty('X-RateLimit-Remaining');
    expect(res._headers).toHaveProperty('X-RateLimit-Reset');
  });

  it('returns 500 on Anthropic API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network failure'));
    const { default: handler } = await import('../../api/parse-booking.js');
    const res = makeRes();
    await handler(makeReq({ text: 'Booking confirmation with some flight details here.' }), res);
    expect(res._status).toBe(500);
  });
});
