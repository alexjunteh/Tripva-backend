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

describe('activityLinkForDestination', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.KLOOK_AID;
    delete process.env.GYG_PARTNER_ID;
  });

  it('uses Klook for supported Asia destinations when KLOOK_AID is configured', async () => {
    process.env.KLOOK_AID = 'klook123';
    const { activityLinkForDestination } = await import('../../lib/affiliate.js');
    const url = activityLinkForDestination({
      destination: 'Phuket, Thailand',
      activityName: 'Phi Phi Island tour',
    });
    expect(url).toContain('klook.com');
    expect(url).toContain('aid=klook123');
    expect(url).toContain('Phi+Phi+Island+tour');
  });

  it('falls back to GetYourGuide when Klook is not configured', async () => {
    process.env.GYG_PARTNER_ID = 'gyg123';
    const { activityLinkForDestination } = await import('../../lib/affiliate.js');
    const url = activityLinkForDestination({
      destination: 'Paris, France',
      activityName: 'Louvre Museum',
    });
    expect(url).toContain('getyourguide.com');
    expect(url).toContain('partner_id=gyg123');
    expect(url).toContain('Louvre+Museum');
  });
});
