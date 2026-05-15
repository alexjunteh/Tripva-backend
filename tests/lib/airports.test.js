import { describe, it, expect } from 'vitest';
import { cityToIata, iataToCity } from '../../lib/airports.js';

describe('cityToIata', () => {
  it('returns IATA for exact city name', () => {
    expect(cityToIata('Tokyo')).toBe('TYO');
  });
  it('is case-insensitive', () => {
    expect(cityToIata('tokyo')).toBe('TYO');
    expect(cityToIata('KUALA LUMPUR')).toBe('KUL');
  });
  it('returns null for unknown city', () => {
    expect(cityToIata('Nonexistentville')).toBeNull();
  });
  it('handles common aliases', () => {
    expect(cityToIata('New York')).toBe('JFK');
    expect(cityToIata('London')).toBe('LON');
  });
});

describe('iataToCity', () => {
  it('returns city name for known code', () => {
    expect(iataToCity('KUL')).toBe('Kuala Lumpur');
  });
  it('returns null for unknown code', () => {
    expect(iataToCity('ZZZ')).toBeNull();
  });
});
