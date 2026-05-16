import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('flightLink', () => {
  beforeEach(() => { vi.resetModules(); });

  it('returns Kiwi search URL with required params', async () => {
    process.env.KIWI_AFFILIATE_ID = 'myaffilid';
    const { flightLink } = await import('../../lib/affiliate.js');
    const url = flightLink({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 2 });
    expect(url).toContain('kiwi.com');
    expect(url).toContain('KUL');
    expect(url).toContain('NRT');
    expect(url).toContain('myaffilid');
    expect(url).toContain('shmarker=myaffilid');
  });

  it('works without affiliate ID', async () => {
    delete process.env.KIWI_AFFILIATE_ID;
    const { flightLink } = await import('../../lib/affiliate.js');
    const url = flightLink({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 1 });
    expect(url).toContain('kiwi.com');
    expect(() => new URL(url)).not.toThrow();
  });

  it('includes return date when provided', async () => {
    const { flightLink } = await import('../../lib/affiliate.js');
    const url = flightLink({ from: 'KUL', to: 'NRT', date: '2024-10-01', returnDate: '2024-10-08', travelers: 2 });
    expect(url).toContain('2024-10-08');
  });
});

describe('tripcomFlightLink', () => {
  beforeEach(() => { vi.resetModules(); });

  it('returns trip.com URL with from/to/date params', async () => {
    const { tripcomFlightLink } = await import('../../lib/affiliate.js');
    const url = tripcomFlightLink({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 2 });
    expect(url).toContain('trip.com');
    expect(url).toContain('KUL');
    expect(url).toContain('NRT');
  });

  it('includes alliance code when env var set', async () => {
    process.env.TRIPCOM_ALLIANCE_CODE = 'tc123';
    const { tripcomFlightLink } = await import('../../lib/affiliate.js');
    const url = tripcomFlightLink({ from: 'KUL', to: 'NRT', date: '2024-10-01', travelers: 2 });
    expect(url).toContain('tc123');
  });
});
