import { describe, it, expect } from 'vitest';
import { checkDailyQuota, getDailyLimit } from '../../lib/quota.js';

describe('getDailyLimit', () => {
  it('returns 3 for anonymous', () => {
    expect(getDailyLimit('anonymous')).toBe(3);
  });

  it('returns 10 for free', () => {
    expect(getDailyLimit('free')).toBe(10);
  });

  it('returns Infinity for paid', () => {
    expect(getDailyLimit('paid')).toBe(Infinity);
  });

  it('defaults to anonymous for unknown tier', () => {
    expect(getDailyLimit('bogus')).toBe(3);
  });
});

describe('checkDailyQuota (in-memory)', () => {
  let seed = 0;
  const nextId = () => `test-quota-${seed++}-${Date.now()}`;

  it('allows first 3 anonymous requests', async () => {
    const id = nextId();
    for (let i = 1; i <= 3; i++) {
      const result = await checkDailyQuota(id, 'anonymous');
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(i);
      expect(result.remaining).toBe(3 - i);
    }
  });

  it('blocks the 4th anonymous request', async () => {
    const id = nextId();
    for (let i = 0; i < 3; i++) await checkDailyQuota(id, 'anonymous');
    const result = await checkDailyQuota(id, 'anonymous');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('allows 10 free-tier requests', async () => {
    const id = nextId();
    for (let i = 1; i <= 10; i++) {
      const result = await checkDailyQuota(id, 'free');
      expect(result.allowed).toBe(true);
    }
    const result = await checkDailyQuota(id, 'free');
    expect(result.allowed).toBe(false);
  });

  it('always allows paid tier', async () => {
    const result = await checkDailyQuota(nextId(), 'paid');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(-1);
  });

  it('tracks different identifiers independently', async () => {
    const a = nextId();
    const b = nextId();
    for (let i = 0; i < 3; i++) await checkDailyQuota(a, 'anonymous');
    const resultA = await checkDailyQuota(a, 'anonymous');
    const resultB = await checkDailyQuota(b, 'anonymous');
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });
});
