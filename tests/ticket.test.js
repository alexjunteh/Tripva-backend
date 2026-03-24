// tests/ticket.test.js
import assert from 'assert';
import { parseTicket } from '../lib/ticket-parser.js';
import { mergeTicketIntoState } from '../lib/ticket-merger.js';

// Sample PDF texts (simplified)
const DOGE_PDF = `Doge's Palace: Fast Track Ticket
Ordered by Jia Jun Teh
Sale date Mar 24, 2026
Reference ID 301329494
Ticket type Adult
Visit date Mar 25, 2026
Time 09:30
5V60JDUZ2V 1/2
5V632KUF6A 2/2
Starting point : Doge's Palace, Piazza San Marco, Venice
To use the fast-track line, you must go to "pre-paid ticket entrance"
Powered by Tiqets`;

const CONCERT_PDF = `I Musici Veneziani Concert: Vivaldi Four Seasons
Category B - 13th to 22nd row
Date & time Wed, Mar 25, 2026 • 08:30 PM
Travellers Jia Jun Teh • 2 adults
Booking ref. 1376679255
Address: Campo S. Salvador, 4810, 30124 Venezia VE
Dress code is smart casual
Viator`;

const MOCK_STATE = {
  days: [{
    day: 8, title: 'Venice Full Day', city: 'Venice',
    timeline: [
      { time: '09:30', title: "🏛️ Doge's Palace", type: 'activity', ticketRequired: true, ticketState: 'pending', detail: 'timed entry' },
      { time: '20:30', title: '🎻 I Musici Veneziani', type: 'activity', ticketRequired: true, ticketState: 'pending', detail: 'concert' },
    ],
  }],
  tickets: [],
  budget: [],
};

// Test 1: parseTicket extracts refId from Doge's
const doge = parseTicket(DOGE_PDF);
assert(doge.refId === '301329494', `Expected refId 301329494, got ${doge.refId}`);
console.log('✅ Test 1: parseTicket extracts refId from Doge PDF');

// Test 2: parseTicket extracts codes from Doge's
assert(doge.codes.includes('5V60JDUZ2V') || doge.codes.includes('5V632KUF6A'), 'Should extract ticket codes');
console.log('✅ Test 2: parseTicket extracts codes from Doge PDF');

// Test 3: parseTicket extracts date
assert(doge.date.includes('2026'), `Date should include 2026, got: ${doge.date}`);
console.log('✅ Test 3: parseTicket extracts date');

// Test 4: detectProvider Klook/Tiqets
assert(doge.provider === 'Tiqets', `Expected Tiqets, got ${doge.provider}`);
console.log('✅ Test 4: detectProvider identifies Tiqets');

// Test 5: parseTicket concert ref
const concert = parseTicket(CONCERT_PDF);
assert(concert.refId === '1376679255', `Concert refId, got: ${concert.refId}`);
console.log('✅ Test 5: parseTicket concert refId');

// Test 6: mergeTicketIntoState adds ticket
const stateAfterDoge = mergeTicketIntoState(DOGE_PDF, JSON.parse(JSON.stringify(MOCK_STATE))).state;
assert(stateAfterDoge.tickets.length === 1, 'Should add 1 ticket');
console.log('✅ Test 6: mergeTicketIntoState adds ticket to tickets[]');

// Test 7: mergeTicketIntoState flips ticketState
const dogeActivity = stateAfterDoge.days[0].timeline.find(t => /doge/i.test(t.title));
assert(dogeActivity && dogeActivity.ticketState === 'booked', 'Doge activity should be booked');
console.log("✅ Test 7: mergeTicketIntoState flips Doge's ticketState to booked");

// Test 8: mergeTicketIntoState adds budget entry
assert(stateAfterDoge.budget.length === 1, 'Should add 1 budget entry');
assert(stateAfterDoge.budget[0].note.includes('301329494'), 'Budget note should include refId');
console.log('✅ Test 8: mergeTicketIntoState adds budget entry');

// Test 9: mergeTicketIntoState for concert
const stateAfterConcert = mergeTicketIntoState(CONCERT_PDF, stateAfterDoge).state;
const concertActivity = stateAfterConcert.days[0].timeline.find(t => /musici/i.test(t.title));
assert(concertActivity && concertActivity.ticketState === 'booked', 'Concert activity should be booked');
console.log('✅ Test 9: mergeTicketIntoState flips concert ticketState to booked');

// Test 10: two tickets in state after both merges
assert(stateAfterConcert.tickets.length === 2, 'Should have 2 tickets total');
console.log('✅ Test 10: state has 2 tickets after 2 merges');

console.log('\n✅ All 10 tests passed!');
