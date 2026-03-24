/**
 * itinerary-validator.test.js
 * Run with: node --experimental-vm-modules tests/itinerary-validator.test.js
 * (or: node tests/itinerary-validator.test.js — works with ESM + Node 18+)
 */

import { validateItinerary } from '../lib/itinerary-validator.js';

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

// ─── Helper to build a minimal plan ──────────────────────────────────────────

function makePlan(days, { segments = [], bookNow = {} } = {}) {
  return {
    rawPlan: { days },
    segments,
    bookNow,
  };
}

function makeDay(dayNum, timeline) {
  return { day: dayNum, title: `Day ${dayNum}`, timeline };
}

// ─── TEST 1: Duplicate time → auto-fixed ─────────────────────────────────────
{
  console.log('\nTEST 1: Duplicate time → auto-fix to +15min');
  const plan = makePlan([
    makeDay(1, [
      { type: 'activity', time: '10:00', title: 'Museum A' },
      { type: 'activity', time: '10:00', title: 'Museum B' },
    ]),
  ]);

  const { plan: result, fixesApplied } = validateItinerary(plan);
  const tl = result.rawPlan.days[0].timeline;

  assert(tl[0].time === '10:00', 'First item keeps 10:00');
  assert(tl[1].time === '10:15', 'Duplicate item shifted to 10:15');
  assert(fixesApplied.some(f => f.fix === 'duplicate-time'), 'Fix logged as duplicate-time');
}

// ─── TEST 2: Out-of-order timeline → sorted ───────────────────────────────────
{
  console.log('\nTEST 2: Out-of-order timeline → sorted');
  const plan = makePlan([
    makeDay(2, [
      { type: 'activity', time: '14:00', title: 'Afternoon thing' },
      { type: 'food',     time: '08:00', title: 'Breakfast' },
      { type: 'activity', time: '11:00', title: 'Morning tour' },
    ]),
  ]);

  const { plan: result, fixesApplied } = validateItinerary(plan);
  const tl = result.rawPlan.days[0].timeline;

  assert(tl[0].time === '08:00', 'Breakfast first at 08:00');
  assert(tl[1].time === '11:00', 'Morning tour second at 11:00');
  assert(tl[2].time === '14:00', 'Afternoon thing third at 14:00');
  assert(fixesApplied.some(f => f.fix === 'timeline-sorted'), 'Fix logged as timeline-sorted');
}

// ─── TEST 3: Cicchetti bar at 20:00 → warning generated ──────────────────────
{
  console.log('\nTEST 3: Cicchetti bar at 20:00 → dinner-venue warning');
  const plan = makePlan([
    makeDay(3, [
      { type: 'food', time: '20:00', title: 'Cicchetti at All\'Arco', detail: 'Great cicchetti bar near Rialto' },
    ]),
  ]);

  const { warnings } = validateItinerary(plan);
  assert(warnings.some(w => w.check === 'dinner-venue'), 'dinner-venue warning generated');
  assert(warnings.some(w => w.day === 3), 'Warning contains correct day number');
}

// ─── TEST 4: ticketRequired pending → added to urgent ────────────────────────
{
  console.log('\nTEST 4: ticketRequired but pending → added to bookNow.urgent');
  const plan = makePlan([
    makeDay(4, [
      { type: 'activity', time: '09:00', title: 'Colosseum', ticketRequired: true, ticketState: 'pending' },
    ]),
  ]);

  const { plan: result, warnings, fixesApplied } = validateItinerary(plan);

  assert(warnings.some(w => w.check === 'ticket-pending'), 'ticket-pending warning generated');
  assert(result.bookNow.urgent?.some(u => u.title === 'Colosseum'), 'Colosseum added to urgent list');
  assert(fixesApplied.some(f => f.fix === 'ticket-to-urgent'), 'Fix logged as ticket-to-urgent');
}

// ─── TEST 5: Already booked ticket → NOT added to urgent ─────────────────────
{
  console.log('\nTEST 5: ticketRequired + ticketState:booked → no warning');
  const plan = makePlan([
    makeDay(5, [
      { type: 'activity', time: '09:00', title: 'Uffizi Gallery', ticketRequired: true, ticketState: 'booked' },
    ]),
  ]);

  const { warnings } = validateItinerary(plan);
  assert(!warnings.some(w => w.check === 'ticket-pending'), 'No ticket-pending warning for booked ticket');
}

// ─── TEST 6: Segment drift → ⏳ replaced with ✅ ─────────────────────────────
{
  console.log('\nTEST 6: Segment booked but ⏳ in detail → drift fixed');
  const plan = makePlan(
    [makeDay(6, [
      { type: 'transport', time: '09:00', title: 'Train to Venice', segmentId: 'seg-1', detail: '⏳ Book train to Venice' },
    ])],
    { segments: [{ id: 'seg-1', bookingState: 'booked' }] }
  );

  const { plan: result, fixesApplied } = validateItinerary(plan);
  const item = result.rawPlan.days[0].timeline[0];

  assert(!item.detail.includes('⏳'), '⏳ removed from detail');
  assert(item.detail.includes('✅'), '✅ added to detail');
  assert(fixesApplied.some(f => f.fix === 'segment-drift'), 'Fix logged as segment-drift');
}

// ─── TEST 7: Hotel check-in 15min after transport → pushed to +45min ─────────
{
  console.log('\nTEST 7: Impossible check-in buffer → pushed to transport+45min');
  const plan = makePlan([
    makeDay(7, [
      { type: 'transport', time: '14:00', title: 'Arrive Venice' },
      { type: 'hotel',     time: '14:15', title: 'Check in hotel' },
    ]),
  ]);

  const { plan: result, fixesApplied } = validateItinerary(plan);
  const hotel = result.rawPlan.days[0].timeline[1];

  assert(hotel.time === '14:45', `Hotel pushed to 14:45 (got ${hotel.time})`);
  assert(fixesApplied.some(f => f.fix === 'checkin-buffer'), 'Fix logged as checkin-buffer');
}

// ─── TEST 8: No plan/no days → returns safely ────────────────────────────────
{
  console.log('\nTEST 8: Null/empty plan → no crash');
  const { plan: r1 } = validateItinerary(null);
  assert(r1 === null, 'Null plan returned as-is');

  const { plan: r2 } = validateItinerary({ rawPlan: { days: [] } });
  assert(Array.isArray(r2.rawPlan.days), 'Empty days array returned');
}

// ─── TEST 9: Consecutive-day venue → warning ─────────────────────────────────
{
  console.log('\nTEST 9: Same venue on consecutive days → warning');
  const plan = makePlan([
    makeDay(1, [{ type: 'food', time: '12:00', title: 'Trattoria da Mario' }]),
    makeDay(2, [{ type: 'food', time: '12:00', title: 'Trattoria da Mario' }]),
  ]);

  const { warnings } = validateItinerary(plan);
  assert(warnings.some(w => w.check === 'consecutive-venue'), 'consecutive-venue warning generated');
}

// ─── TEST 10: Advance booking with ref → no warning ──────────────────────────
{
  console.log('\nTEST 10: Advance booking WITH ref → no unbooked-prereq warning');
  const plan = makePlan([
    makeDay(1, [
      { type: 'food', time: '20:00', title: 'Osteria X', detail: 'Book 4 weeks ahead. ✅ BOOKED ref 12345' },
    ]),
  ]);

  const { warnings } = validateItinerary(plan);
  assert(!warnings.some(w => w.check === 'unbooked-prereq'), 'No warning when booking ref present');
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All tests pass');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
