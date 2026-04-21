// tests/packing.test.js — unit tests for /api/packing schema + prompt builder
import assert from 'assert';
import { packingInputSchema } from '../lib/schema.js';
import { buildPackingPrompt, computeNights, ARCHETYPE_HINTS } from '../lib/packing-prompt.js';

// ── Fixture set (one canonical input per archetype) ──────────────────────────
const FIXTURES = {
  solo: {
    destination: 'Lisbon',
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    travelers: 1,
    archetype: 'solo',
  },
  couple: {
    destination: 'Kyoto',
    startDate: '2026-10-10',
    endDate: '2026-10-17',
    travelers: 2,
    archetype: 'couple',
  },
  family: {
    destination: 'Orlando',
    startDate: '2026-07-15',
    endDate: '2026-07-22',
    travelers: 4,
    archetype: 'family',
    child_ages: [5, 8],
  },
  friends: {
    destination: 'Barcelona',
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    travelers: 4,
    archetype: 'friends',
  },
  adventure: {
    destination: 'Patagonia',
    startDate: '2026-11-01',
    endDate: '2026-11-12',
    travelers: 2,
    archetype: 'adventure',
  },
  nomad: {
    destination: 'Chiang Mai',
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    travelers: 1,
    archetype: 'nomad',
  },
};

// ── Test 1: all archetype fixtures pass schema validation ────────────────────
for (const [name, fx] of Object.entries(FIXTURES)) {
  const r = packingInputSchema.safeParse(fx);
  assert(r.success, `${name} fixture should validate: ${r.error?.issues?.[0]?.message}`);
}
console.log('✅ Test 1: all 6 archetype fixtures validate');

// ── Test 2: schema rejects missing destination ───────────────────────────────
const bad1 = packingInputSchema.safeParse({ travelers: 1 });
assert(!bad1.success, 'should reject missing destination');
console.log('✅ Test 2: rejects missing destination');

// ── Test 3: schema rejects bad date format ───────────────────────────────────
const bad2 = packingInputSchema.safeParse({
  destination: 'Rome', startDate: '06/01/2026', endDate: '2026-06-07',
});
assert(!bad2.success, 'should reject non-YYYY-MM-DD dates');
console.log('✅ Test 3: rejects bad date format');

// ── Test 4: schema rejects invalid archetype ─────────────────────────────────
const bad3 = packingInputSchema.safeParse({
  destination: 'Rome', archetype: 'business',
});
assert(!bad3.success, 'should reject unknown archetype');
console.log('✅ Test 4: rejects invalid archetype');

// ── Test 5: schema rejects out-of-range child_ages ───────────────────────────
const bad4 = packingInputSchema.safeParse({
  destination: 'Rome', archetype: 'family', child_ages: [18],
});
assert(!bad4.success, 'should reject child age > 17');
console.log('✅ Test 5: rejects out-of-range child age');

// ── Test 6: computeNights inclusive day count ────────────────────────────────
assert(computeNights('2026-06-01', '2026-06-07') === ' 7 days', '1→7 June = 7 days');
assert(computeNights('2026-06-01', '2026-06-01') === ' 1 days', 'same day = 1 day min');
assert(computeNights(null, '2026-06-07') === '', 'missing start → empty');
assert(computeNights('bogus', '2026-06-07') === '', 'bad date → empty');
console.log('✅ Test 6: computeNights');

// ── Test 7: buildPackingPrompt contains all required labels ──────────────────
const soloPrompt = buildPackingPrompt(FIXTURES.solo);
assert(soloPrompt.includes('Destination: Lisbon'), 'prompt should include destination');
assert(soloPrompt.includes('Travelers: 1'), 'prompt should include travelers');
assert(soloPrompt.includes('Archetype: solo'), 'prompt should include archetype');
assert(soloPrompt.includes('7 days'), 'prompt should include nights');
assert(soloPrompt.includes(ARCHETYPE_HINTS.solo), 'prompt should include archetype hint');
assert(soloPrompt.includes('Return ONLY JSON'), 'prompt should request JSON');
console.log('✅ Test 7: solo prompt shape');

// ── Test 8: family prompt interpolates child ages ────────────────────────────
const famPrompt = buildPackingPrompt(FIXTURES.family);
assert(famPrompt.includes('children ages 5, 8'), 'family prompt should list child ages');
assert(famPrompt.includes('Family with'), 'family prompt should use family hint template');
console.log('✅ Test 8: family prompt interpolates child ages');

// ── Test 9: friends prompt includes group count ──────────────────────────────
const friPrompt = buildPackingPrompt(FIXTURES.friends);
assert(friPrompt.includes('Group of 4 friends'), 'friends prompt should include count');
console.log('✅ Test 9: friends prompt group count');

// ── Test 10: adventure + nomad use their specific hints ──────────────────────
const advPrompt = buildPackingPrompt(FIXTURES.adventure);
assert(advPrompt.includes('Adventure/outdoor'), 'adventure hint');
assert(advPrompt.includes('waterproof'), 'adventure should emphasize gear');
const nomPrompt = buildPackingPrompt(FIXTURES.nomad);
assert(nomPrompt.includes('nomad'), 'nomad hint');
assert(nomPrompt.includes('Work-from-anywhere'), 'nomad should emphasize work gear');
console.log('✅ Test 10: adventure + nomad hints present');

// ── Test 11: missing archetype falls back to generic ─────────────────────────
const genericPrompt = buildPackingPrompt({ destination: 'Rome', travelers: 2 });
assert(genericPrompt.includes('Archetype: generic'), 'absent archetype → generic');
assert(genericPrompt.includes(ARCHETYPE_HINTS.generic), 'generic hint present');
console.log('✅ Test 11: generic fallback');

console.log('\n✅ All 11 packing tests passed');
