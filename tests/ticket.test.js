// tests/ticket.test.js
// Tests ticket-merger.js with pre-parsed data (no Claude API calls needed)
import assert from 'assert';
import { mergeTicketIntoState } from '../lib/ticket-merger.js';
import { parseTicketFallback } from '../lib/ticket-parser.js';

// Pre-parsed data (as Claude would return)
const PARSED_DOGE = {
  title: "Doge's Palace Fast Track",
  date: "Mar 25, 2026",
  time: "09:30",
  venue: "Doge's Palace, Piazza San Marco, Venice",
  refId: "301329494",
  codes: ["5V60JDUZ2V", "5V632KUF6A"],
  travelers: ["Teh Jia Jun", "Wong Khai Yee"],
  pricePerPerson: "€30",
  totalPrice: "€60",
  provider: "Klook",
  category: "attraction",
  importantInfo: "Go to 'pre-paid ticket entrance'. Arrive 10 minutes before.",
  seats: [
    { traveler: "Teh Jia Jun",    detail: "Code: 5V60JDUZ2V | Ref: 301329494" },
    { traveler: "Wong Khai Yee",  detail: "Code: 5V632KUF6A | Ref: 301329494" }
  ]
};

const PARSED_CONCERT = {
  title: "I Musici Veneziani — Vivaldi Four Seasons",
  date: "Mar 25, 2026",
  time: "20:30",
  venue: "Scuola Grande di San Teodoro, Venice",
  refId: "1376679255",
  codes: [],
  travelers: ["Jia Jun Teh", "Wong Khai Yee"],
  pricePerPerson: "€32.50",
  totalPrice: "€65",
  provider: "Viator",
  category: "concert",
  importantInfo: "Smart casual dress code. Collect tickets at box office from 19:30.",
  seats: [
    { traveler: "Jia Jun Teh",    detail: "Category B — rows 13–22 | Ref: 1376679255" },
    { traveler: "Wong Khai Yee",  detail: "Category B — rows 13–22 | Ref: 1376679255" }
  ]
};

const MOCK_STATE = {
  days: [{
    day: 8, title: 'Venice Full Day', city: 'Venice',
    timeline: [
      { time: '09:30', title: "🏛️ Doge's Palace",       type: 'activity', ticketRequired: true,  ticketState: 'pending', detail: 'timed entry' },
      { time: '20:30', title: '🎻 I Musici Veneziani',  type: 'activity', ticketRequired: true,  ticketState: 'pending', detail: 'concert' },
      { time: '12:00', title: '🥗 Lunch',               type: 'food',     ticketRequired: false, detail: 'free lunch' },
    ]
  }],
  tickets: [],
  budget: [],
};

// ── Tests ────────────────────────────────────────────────────────────────────

// Test 1: mergeTicketIntoState adds ticket
const r1 = mergeTicketIntoState(PARSED_DOGE, JSON.parse(JSON.stringify(MOCK_STATE)));
assert.strictEqual(r1.state.tickets.length, 1, 'Should add 1 ticket');
console.log('✅ Test 1: adds ticket to tickets[]');

// Test 2: flips ticketState to booked
const dogeItem = r1.state.days[0].timeline.find(t => /doge/i.test(t.title));
assert.strictEqual(dogeItem?.ticketState, 'booked', "Doge's should be booked");
console.log("✅ Test 2: flips Doge's ticketState to booked");

// Test 3: does NOT flip non-ticketRequired items
const lunchItem = r1.state.days[0].timeline.find(t => /lunch/i.test(t.title));
assert.notStrictEqual(lunchItem?.ticketState, 'booked', 'Lunch should not be booked');
console.log('✅ Test 3: does not touch non-ticketRequired items');

// Test 4: seats from parsed.seats
assert.strictEqual(r1.state.tickets[0].seats[0].traveler, 'Teh Jia Jun', 'First seat traveler');
assert.ok(r1.state.tickets[0].seats[0].detail.includes('5V60JDUZ2V'), 'Seat detail has code');
console.log('✅ Test 4: seats populated from parsed.seats');

// Test 5: budget entry added with RM conversion
assert.strictEqual(r1.state.budget.length, 1, 'Should have 1 budget entry');
assert.ok(r1.state.budget[0].amount.includes('RM'), `Budget should include RM: ${r1.state.budget[0].amount}`);
console.log('✅ Test 5: budget added with RM conversion');

// Test 6: budget note has refId
assert.ok(r1.state.budget[0].note.includes('301329494'), 'Budget note should include refId');
console.log('✅ Test 6: budget note includes refId');

// Test 7: concert ticket added
const r2 = mergeTicketIntoState(PARSED_CONCERT, r1.state);
assert.strictEqual(r2.state.tickets.length, 2, '2 tickets total');
console.log('✅ Test 7: concert ticket added');

// Test 8: concert ticketState flipped
const concertItem = r2.state.days[0].timeline.find(t => /musici/i.test(t.title));
assert.strictEqual(concertItem?.ticketState, 'booked', 'Concert should be booked');
console.log('✅ Test 8: concert ticketState flipped to booked');

// Test 9: ticket IDs are unique
const ids = r2.state.tickets.map(t => t.id);
assert.strictEqual(new Set(ids).size, ids.length, 'Ticket IDs must be unique');
console.log('✅ Test 9: ticket IDs are unique');

// Test 10: fallback parser still extracts refId from Doge PDF text
const DOGE_PDF = `Doge's Palace: Fast Track Ticket\nOrdered by Jia Jun Teh\nReference ID 301329494\nVisit date Mar 25, 2026\n5V60JDUZ2V 1/2\n5V632KUF6A 2/2\nPowered by Tiqets`;
const fallback = parseTicketFallback(DOGE_PDF);
assert.strictEqual(fallback.refId, '301329494', `Fallback refId: ${fallback.refId}`);
assert.strictEqual(fallback.provider, 'Tiqets', `Fallback provider: ${fallback.provider}`);
console.log('✅ Test 10: fallback parser extracts refId + provider');

console.log('\n✅ All 10 tests passed!');
