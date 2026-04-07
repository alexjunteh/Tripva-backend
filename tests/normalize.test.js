/**
 * normalize.test.js
 * Tests for normalizeTripState() in lib/schema.js
 * Run with: node tests/normalize.test.js
 */

import { normalizeTripState } from '../lib/schema.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// ─── TEST 1: Null / missing input → passthrough ────────────────────────────
{
  console.log('\nTEST 1: Null / missing input → passthrough');
  assert(normalizeTripState(null) === null, 'null returns null');
  assert(normalizeTripState(undefined) === undefined, 'undefined returns undefined');
  assert(normalizeTripState({}) === undefined || normalizeTripState({}).rawPlan === undefined,
    'no rawPlan returns as-is');
}

// ─── TEST 2: Day dates computed from trip.startDate ─────────────────────────
{
  console.log('\nTEST 2: Day dates computed from trip.startDate');
  const state = {
    rawPlan: {
      trip: { name: 'Test', startDate: '2026-06-10', endDate: '2026-06-13' },
      days: [
        { day: 1, title: 'Day 1', timeline: [] },
        { day: 2, title: 'Day 2', timeline: [] },
        { day: 3, title: 'Day 3', timeline: [] },
        { day: 4, title: 'Day 4', timeline: [] },
      ],
    },
  };
  const result = normalizeTripState(state);
  assert(result.rawPlan.days[0].date === '2026-06-10', 'Day 1 → 2026-06-10');
  assert(result.rawPlan.days[1].date === '2026-06-11', 'Day 2 → 2026-06-11');
  assert(result.rawPlan.days[2].date === '2026-06-12', 'Day 3 → 2026-06-12');
  assert(result.rawPlan.days[3].date === '2026-06-13', 'Day 4 → 2026-06-13');
}

// ─── TEST 3: Budget item normalization (item ↔ label, defaults) ────────────
{
  console.log('\nTEST 3: Budget item normalization');
  const state = {
    rawPlan: {
      trip: { name: 'Test', startDate: '2026-01-01' },
      days: [{ day: 1, title: 'Day 1', timeline: [] }],
      budget: [
        { item: 'Flights', amount: '€500' },
        { label: 'Hotels', amount: '€1200' },
        { amount: '€300' },
      ],
    },
  };
  const result = normalizeTripState(state);
  const b = result.rawPlan.budget;

  assert(b[0].item === 'Flights' && b[0].label === 'Flights', 'item→label synced');
  assert(b[1].item === 'Hotels' && b[1].label === 'Hotels', 'label→item synced');
  assert(b[2].item === '' && b[2].label === '', 'missing both → empty strings');
  assert(b[0].status === 'pending', 'default status = pending');
  assert(b[0].category === 'misc', 'default category = misc');
}

// ─── TEST 4: Hotel defaults ────────────────────────────────────────────────
{
  console.log('\nTEST 4: Hotel defaults');
  const state = {
    rawPlan: {
      trip: { name: 'Test', startDate: '2026-01-01' },
      days: [{ day: 1, title: 'Day 1', timeline: [] }],
      hotels: [
        { city: 'Rome', name: 'Hotel Roma' },
        { city: 'Milan', name: 'Hotel Milano', stars: 5, rating: 9.2 },
      ],
    },
  };
  const result = normalizeTripState(state);
  const h = result.rawPlan.hotels;

  assert(h[0].stars === 3, 'missing stars → default 3');
  assert(h[0].rating === 7.0, 'missing rating → default 7.0');
  assert(h[0].nights === 1, 'missing nights → default 1');
  assert(h[1].stars === 5, 'existing stars preserved');
  assert(h[1].rating === 9.2, 'existing rating preserved');
}

// ─── TEST 5: Timeline item defaults ────────────────────────────────────────
{
  console.log('\nTEST 5: Timeline item defaults');
  const state = {
    rawPlan: {
      trip: { name: 'Test', startDate: '2026-01-01' },
      days: [{
        day: 1,
        title: 'Day 1',
        timeline: [
          { title: 'Something' },
          { time: '09:00', title: 'Museum', type: 'activity', detail: 'Visit museum' },
        ],
      }],
    },
  };
  const result = normalizeTripState(state);
  const tl = result.rawPlan.days[0].timeline;

  assert(tl[0].time === '', 'missing time → empty string');
  assert(tl[0].type === 'activity', 'missing type → activity');
  assert(tl[0].detail === '', 'missing detail → empty string');
  assert(tl[1].type === 'activity', 'existing type preserved');
  assert(tl[1].detail === 'Visit museum', 'existing detail preserved');
}

// ─── TEST 6: normalizedVersion + planVersion set ───────────────────────────
{
  console.log('\nTEST 6: normalizedVersion + planVersion set');
  const state = {
    rawPlan: {
      trip: { name: 'Test', startDate: '2026-01-01' },
      days: [{ day: 1, title: 'Day 1', timeline: [] }],
    },
  };
  const result = normalizeTripState(state);
  assert(result.normalizedVersion === 2, 'normalizedVersion = 2');
  assert(typeof result.planVersion === 'string' && result.planVersion.length > 0, 'planVersion is set');
}

// ─── TEST 7: Idempotent — normalizing twice produces same result ───────────
{
  console.log('\nTEST 7: Idempotent');
  const state = {
    normalizedVersion: 2,
    planVersion: '2026-01-01T00:00:00.000Z',
    rawPlan: {
      trip: { id: 'trip-001', name: 'Test', startDate: '2026-06-10', endDate: '2026-06-12', timezone: 'UTC', currency: 'EUR' },
      days: [
        { day: 1, date: '2026-06-10', title: 'Day 1', emoji: '🏛️', heroSeed: 'rome', imageUrl: '', timeline: [{ time: '09:00', title: 'Walk', detail: 'Walk around', type: 'activity' }], highlights: [], localTips: [], photos: [] },
      ],
      hotels: [{ city: 'Rome', name: 'Hotel', stars: 4, rating: 8.5, nights: 2, checkin: '2026-06-10', checkout: '2026-06-12', bookUrl: '', address: '123 St' }],
      budget: [{ item: 'Flights', label: 'Flights', amount: '€500', status: 'pending', category: 'transport', note: '' }],
      urgent: [],
      tickets: [],
      mapStops: [{ name: 'Rome', lat: 41.9, lng: 12.5, emoji: '🏛️', type: 'stay', day: 1, nights: 2 }],
      mapRoute: [{ lat: 41.9, lng: 12.5 }],
    },
  };
  const once = normalizeTripState(state);
  const twice = normalizeTripState(once);
  assert(JSON.stringify(once) === JSON.stringify(twice), 'double-normalize is identical');
}

// ─── TEST 8: mapStop type normalization ────────────────────────────────────
{
  console.log('\nTEST 8: mapStop type normalization');
  const state = {
    rawPlan: {
      trip: { name: 'Test', startDate: '2026-01-01' },
      days: [{ day: 1, title: 'Day 1', timeline: [] }],
      mapStops: [
        { name: 'A', lat: 0, lng: 0, type: 'visit' },
        { name: 'B', lat: 0, lng: 0, type: 'day_trip' },
        { name: 'C', lat: 0, lng: 0, type: 'stay' },
        { name: 'D', lat: 0, lng: 0 },
      ],
    },
  };
  const result = normalizeTripState(state);
  const s = result.rawPlan.mapStops;
  assert(s[0].type === 'daytrip', 'visit → daytrip');
  assert(s[1].type === 'daytrip', 'day_trip → daytrip');
  assert(s[2].type === 'stay', 'stay → stay');
  assert(s[3].type === 'stay', 'undefined → stay');
}

// ─── TEST 9: Missing arrays default to [] ──────────────────────────────────
{
  console.log('\nTEST 9: Missing arrays default to []');
  const state = {
    rawPlan: {
      trip: { name: 'Test', startDate: '2026-01-01' },
      days: [{ day: 1, title: 'Day 1' }],
    },
  };
  const result = normalizeTripState(state);
  assert(Array.isArray(result.rawPlan.budget) && result.rawPlan.budget.length === 0, 'budget defaults to []');
  assert(Array.isArray(result.rawPlan.hotels) && result.rawPlan.hotels.length === 0, 'hotels defaults to []');
  assert(Array.isArray(result.rawPlan.urgent) && result.rawPlan.urgent.length === 0, 'urgent defaults to []');
  assert(Array.isArray(result.rawPlan.tickets) && result.rawPlan.tickets.length === 0, 'tickets defaults to []');
  assert(Array.isArray(result.rawPlan.mapStops) && result.rawPlan.mapStops.length === 0, 'mapStops defaults to []');
  assert(Array.isArray(result.rawPlan.mapRoute) && result.rawPlan.mapRoute.length === 0, 'mapRoute defaults to []');
  assert(Array.isArray(result.rawPlan.days[0].timeline) && result.rawPlan.days[0].timeline.length === 0, 'day.timeline defaults to []');
}

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All tests pass');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
