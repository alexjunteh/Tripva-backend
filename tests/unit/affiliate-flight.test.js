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

describe('enrichWithAffiliateLinks — tickets', () => {
  it('adds Rail Ninja links to ticket items', async () => {
    const { enrichWithAffiliateLinks } = await import('../../lib/affiliate.js');
    const state = { rawPlan: {
      trip: { destination: 'Italy' },
      tickets: [
        { from: 'Rome', to: 'Florence', date: '2024-10-02' },
        { from: 'Florence', to: 'Venice', date: '2024-10-04', bookUrl: 'https://rail.ninja/?marker=529721' },
      ],
    }};
    const result = enrichWithAffiliateLinks(state, 2);
    expect(result.rawPlan.tickets[0].bookUrl).toContain('rail.ninja');
    expect(result.rawPlan.tickets[0].bookUrl).toContain('Rome');
    expect(result.rawPlan.tickets[1].bookUrl).toBe('https://rail.ninja/?marker=529721');
  });

  it('uses 12Go for Asia destinations', async () => {
    const { enrichWithAffiliateLinks } = await import('../../lib/affiliate.js');
    const state = { rawPlan: {
      trip: { destination: 'Thailand' },
      tickets: [{ from: 'Bangkok', to: 'Chiang Mai', date: '2024-11-01' }],
    }};
    const result = enrichWithAffiliateLinks(state, 2);
    expect(result.rawPlan.tickets[0].bookUrl).toContain('12go.asia');
    expect(result.rawPlan.tickets[0].bookUrl).toContain('Bangkok');
  });
});

describe('enrichWithAffiliateLinks — transport timeline', () => {
  it('adds train links to transport timeline items', async () => {
    const { enrichWithAffiliateLinks } = await import('../../lib/affiliate.js');
    const state = { rawPlan: {
      trip: { destination: 'France' },
      days: [{
        day: 1, date: '2024-10-01',
        timeline: [
          { type: 'transport', title: 'Train to Lyon', from: 'Paris', to: 'Lyon' },
          { type: 'activity', title: 'Louvre Museum' },
          { type: 'meal', title: 'Dinner' },
        ],
      }],
    }};
    const result = enrichWithAffiliateLinks(state, 2);
    const tl = result.rawPlan.days[0].timeline;
    expect(tl[0].bookUrl).toContain('rail.ninja');
    expect(tl[1].bookUrl).toContain('getyourguide.com');
    expect(tl[2].bookUrl).toBeUndefined();
  });

  it('does not overwrite existing bookUrl', async () => {
    const { enrichWithAffiliateLinks } = await import('../../lib/affiliate.js');
    const state = { rawPlan: {
      trip: { destination: 'Italy' },
      days: [{
        day: 1, date: '2024-10-01',
        timeline: [
          { type: 'transport', title: 'Train', bookUrl: 'https://custom.com/existing' },
        ],
      }],
    }};
    const result = enrichWithAffiliateLinks(state, 2);
    expect(result.rawPlan.days[0].timeline[0].bookUrl).toBe('https://custom.com/existing');
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
