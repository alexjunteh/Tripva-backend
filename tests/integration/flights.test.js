import { describe, it, expect, vi, beforeEach } from 'vitest';

global.fetch = vi.fn();

const makeReq = (body) => ({ method: 'POST', body, query: {}, headers: { origin: 'https://tripva.app' } });
const makeRes = () => {
  const r = { _status: 200, _body: null, _headers: {} };
  r.status = (s) => { r._status = s; return r; };
  r.json   = (b) => { r._body = b; return r; };
  r.setHeader = (k, v) => { r._headers[k] = v; };
  r.end = () => {};
  return r;
};

describe('api/flights', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.KIWI_API_KEY = 'test-key';
  });

  it('returns 503 when KIWI_API_KEY not set', async () => {
    delete process.env.KIWI_API_KEY;
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01' }), res);
    expect(res._status).toBe(503);
  });

  it('returns 400 when from is missing', async () => {
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ to: 'NRT', date: '2024-10-01' }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/from/i);
  });

  it('returns 400 when to is missing', async () => {
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', date: '2024-10-01' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when date is missing', async () => {
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT' }), res);
    expect(res._status).toBe(400);
  });

  it('returns normalized flights array on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        currency: 'USD',
        data: [{
          id: 'f1',
          price: 320,
          booking_token: 'tok123',
          flyFrom: 'KUL',
          flyTo: 'NRT',
          route: [
            { flyFrom: 'KUL', flyTo: 'NRT', local_departure: '2024-10-01T08:00:00.000Z', local_arrival: '2024-10-01T16:00:00.000Z', airline: 'MH' }
          ],
          duration: { total: 28800 }
        }]
      }),
    });
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 2 }), res);
    expect(res._status).toBe(200);
    expect(res._body.flights).toHaveLength(1);
    const f = res._body.flights[0];
    expect(f.price).toBe(320);
    expect(f.airlines).toContain('MH');
    expect(f.departure.iata).toBe('KUL');
    expect(f.arrival.iata).toBe('NRT');
    expect(f.stops).toBe(0);
    expect(f.kiwiLink).toContain('kiwi.com/booking');
    expect(f.kiwiLink).toContain('tok123');
    expect(f.tripcomLink).toContain('trip.com');
  });

  it('returns empty flights array when Kiwi returns no data', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01' }), res);
    expect(res._status).toBe(200);
    expect(res._body.flights).toEqual([]);
  });

  it('converts date to DD/MM/YYYY format in Kiwi call', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    const { default: handler } = await import('../../api/flights.js');
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-15' }), makeRes());
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('date_from=15%2F10%2F2024');
  });

  it('returns 400 for wrong date format (DD/MM/YYYY)', async () => {
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '15/10/2024' }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/YYYY-MM-DD/);
  });

  it('clamps travelers: 0 falls back to 2, 99 clamps to 9', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    const { default: handler } = await import('../../api/flights.js');

    // travelers=0 is falsy → parseInt(0)||2 → default 2
    const res0 = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 0 }), res0);
    expect(global.fetch.mock.calls.at(-1)[0]).toContain('adults=2');

    // travelers=99 → clamped to 9
    const res99 = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 99 }), res99);
    expect(global.fetch.mock.calls.at(-1)[0]).toContain('adults=9');
  });

  it('uses adultCount (not raw travelers) in Trip.com link', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ currency: 'USD', data: [{ id: 'x', price: 100, booking_token: 't', route: [], duration: { total: 0 } }] }),
    });
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 99 }), res);
    expect(res._body.flights[0].tripcomLink).toContain('adult=9');
    expect(res._body.flights[0].tripcomLink).not.toContain('adult=99');
  });

  it('sets X-RateLimit headers on every response', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01' }), res);
    expect(res._headers['X-RateLimit-Limit']).toBe('10');
    expect(res._headers).toHaveProperty('X-RateLimit-Remaining');
    expect(res._headers).toHaveProperty('X-RateLimit-Reset');
  });
});
