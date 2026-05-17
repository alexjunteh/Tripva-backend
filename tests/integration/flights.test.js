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

const serpApiResponse = (flights = []) => ({
  ok: true,
  json: async () => ({ best_flights: flights, other_flights: [] }),
});

const makeSerpFlight = ({ price = 320, from = 'KUL', to = 'NRT', airline = 'MH' } = {}) => ({
  price,
  total_duration: 480,
  flights: [{
    departure_airport: { id: from, time: '2024-10-01 08:00' },
    arrival_airport:   { id: to,   time: '2024-10-01 16:00' },
    airline,
    airline_logo: `https://www.gstatic.com/flights/airline_logos/70px/${airline}.png`,
  }],
});

describe('api/flights', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SERPAPI_KEY = 'test-key';
  });

  it('returns 503 when SERPAPI_KEY not set', async () => {
    delete process.env.SERPAPI_KEY;
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
    global.fetch.mockResolvedValueOnce(serpApiResponse([makeSerpFlight()]));
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
    expect(f.bookingLink).toBeTruthy();
  });

  it('returns empty flights array when SerpAPI returns no data', async () => {
    global.fetch.mockResolvedValueOnce(serpApiResponse([]));
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01' }), res);
    expect(res._status).toBe(200);
    expect(res._body.flights).toEqual([]);
  });

  it('passes date in YYYY-MM-DD format to SerpAPI', async () => {
    global.fetch.mockResolvedValueOnce(serpApiResponse([]));
    const { default: handler } = await import('../../api/flights.js');
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-15' }), makeRes());
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('outbound_date=2024-10-15');
  });

  it('returns 400 for wrong date format (DD/MM/YYYY)', async () => {
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '15/10/2024' }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/YYYY-MM-DD/);
  });

  it('clamps travelers: 0 falls back to 2, 99 clamps to 9', async () => {
    global.fetch.mockResolvedValue(serpApiResponse([]));
    const { default: handler } = await import('../../api/flights.js');

    const res0 = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 0 }), res0);
    expect(global.fetch.mock.calls.at(-1)[0]).toContain('adults=2');

    const res99 = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 99 }), res99);
    expect(global.fetch.mock.calls.at(-1)[0]).toContain('adults=9');
  });

  it('booking link present and uses clamped adult count', async () => {
    global.fetch.mockResolvedValueOnce(serpApiResponse([makeSerpFlight()]));
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 99 }), res);
    expect(res._body.flights[0].bookingLink).toBeTruthy();
    expect(res._body.flights[0].bookingLink).not.toContain('99');
  });

  it('sets X-RateLimit headers on every response', async () => {
    global.fetch.mockResolvedValueOnce(serpApiResponse([]));
    const { default: handler } = await import('../../api/flights.js');
    const res = makeRes();
    await handler(makeReq({ from: 'KUL', to: 'NRT', date: '2024-10-01' }), res);
    expect(res._headers['X-RateLimit-Limit']).toBe('10');
    expect(res._headers).toHaveProperty('X-RateLimit-Remaining');
    expect(res._headers).toHaveProperty('X-RateLimit-Reset');
  });
});
