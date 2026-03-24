// tests/places.test.js
import assert from 'assert';
import { enrichActivity, getCityPhotospots, enrichPlan } from '../lib/places.js';

// ── Test 1: enrichActivity matches known place ────────────────────────────────
const uffizi = enrichActivity('Uffizi Gallery visit', 'florence');
assert(uffizi !== null, 'enrichActivity should match Uffizi');
assert(uffizi.history && uffizi.history.includes('1560'), 'Uffizi history should mention 1560');
console.log('✅ Test 1: enrichActivity Uffizi');

// ── Test 2: enrichActivity matches by keyword (emoji prefix) ─────────────────
const colosseum = enrichActivity('🏟️ Colosseum — 8am first slot', 'rome');
assert(colosseum !== null, 'enrichActivity should match Colosseum');
assert(colosseum.history && colosseum.history.includes('50,000'), 'Colosseum history should mention 50,000');
console.log('✅ Test 2: enrichActivity Colosseum');

// ── Test 3: enrichActivity returns null for unknown place ─────────────────────
const unknown = enrichActivity('Random local cafe', 'rome');
assert(unknown === null, 'enrichActivity should return null for unknown place');
console.log('✅ Test 3: enrichActivity null for unknown');

// ── Test 4: getCityPhotospots returns spots for venice ────────────────────────
const veniceSpots = getCityPhotospots('venice');
assert(Array.isArray(veniceSpots) && veniceSpots.length > 0, 'Venice should have photospots');
assert(veniceSpots.every(s => s.lat && s.lng && s.photoUrl), 'All spots should have lat/lng/photoUrl');
console.log('✅ Test 4: getCityPhotospots venice');

// ── Test 5: getCityPhotospots returns [] for unknown city ─────────────────────
const unknownSpots = getCityPhotospots('atlantis');
assert(Array.isArray(unknownSpots) && unknownSpots.length === 0, 'Unknown city should return []');
console.log('✅ Test 5: getCityPhotospots unknown city');

// ── Test 6: getCityPhotospots rome contains Trevi ─────────────────────────────
const romeSpots = getCityPhotospots('rome');
assert(romeSpots.length > 0, 'Rome should have photospots');
const hasTrevi = romeSpots.some(s => s.name && s.name.toLowerCase().includes('trevi'));
assert(hasTrevi, 'Rome spots should include Trevi Fountain');
console.log('✅ Test 6: getCityPhotospots rome includes Trevi');

// ── Test 7: enrichPlan enriches activities in a mock plan ─────────────────────
const mockPlan = {
  days: [{
    day: 12,
    title: "Rome Day 1",
    city: "Rome",
    timeline: [
      { time: "08:00", title: "Colosseum visit", type: "activity", detail: "Book 8am slot" },
      { time: "15:00", title: "Trevi Fountain", type: "activity", detail: "Coin toss" },
    ],
  }],
};
const enriched = enrichPlan(mockPlan);
const colItem = enriched.days[0].timeline.find(t => t.title.toLowerCase().includes('colosseum'));
assert(colItem && colItem.history, 'Colosseum should have history after enrichPlan');
const treviItem = enriched.days[0].timeline.find(t => t.type === 'activity' && t.title.toLowerCase().includes('trevi'));
assert(treviItem && treviItem.history, 'Trevi activity should have history after enrichPlan');
console.log('✅ Test 7: enrichPlan enriches activities');

// ── Test 8: enrichPlan adds photospots to days ────────────────────────────────
const hasPhotospot = enriched.days[0].timeline.some(t => t.type === 'photospot');
assert(hasPhotospot, 'enrichPlan should add photospots to Rome day');
console.log('✅ Test 8: enrichPlan adds photospots');

console.log('\n✅ All 8 tests passed!');
