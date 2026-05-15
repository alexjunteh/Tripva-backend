import { describe, it, expect } from 'vitest';
import { deriveConstraintLines } from '../../lib/prompt.js';

describe('deriveConstraintLines', () => {
  it('generates arrival block for inbound flight', () => {
    const anchor = {
      type: 'flight',
      from: 'KUL',
      to: 'NRT',
      date: '2024-10-01',
      arrivalTime: '15:30',
    };
    const result = deriveConstraintLines([anchor]);
    expect(result).toContain('2024-10-01');
    expect(result).toMatch(/ARRIVAL DAY/i);
    expect(result).toMatch(/17:00/); // 15:30 + 90 min
  });

  it('generates departure block for outbound flight', () => {
    const anchor = {
      type: 'flight',
      from: 'NRT',
      to: 'KUL',
      date: '2024-10-07',
      departureTime: '09:30',
    };
    const result = deriveConstraintLines([anchor]);
    expect(result).toContain('2024-10-07');
    expect(result).toMatch(/DEPARTURE DAY/i);
    expect(result).toMatch(/07:30/); // 09:30 - 120 min
  });

  it('returns empty string for hotel-only anchors', () => {
    const anchor = {
      type: 'hotel',
      city: 'Tokyo',
      checkinDate: '2024-10-01',
      checkoutDate: '2024-10-05',
    };
    expect(deriveConstraintLines([anchor])).toBe('');
  });

  it('handles missing times gracefully without throwing', () => {
    const anchor = { type: 'flight', from: 'KUL', to: 'NRT', date: '2024-10-01' };
    expect(() => deriveConstraintLines([anchor])).not.toThrow();
  });

  it('returns empty string for empty array', () => {
    expect(deriveConstraintLines([])).toBe('');
  });
});
