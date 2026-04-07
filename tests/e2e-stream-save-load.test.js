/**
 * e2e-stream-save-load.test.js
 * End-to-end: POST /api/plan?stream=true → auto-save → GET /api/trip?id=<id> → verify round-trip.
 *
 * Requires:
 *   - OPENAI_API_KEY (for generation)
 *   - GITHUB_TOKEN   (for save)
 *   - Server running at BASE_URL (default http://localhost:3001)
 *
 * Run: node tests/e2e-stream-save-load.test.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

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

/**
 * Parse SSE text into an array of event objects.
 */
function parseSSE(text) {
  const events = [];
  for (const block of text.split('\n\n')) {
    const line = block.trim();
    if (!line || line.startsWith(':')) continue; // skip pings
    const match = line.match(/^data:\s*(.+)$/m);
    if (match) {
      try { events.push(JSON.parse(match[1])); } catch { /* skip non-JSON */ }
    }
  }
  return events;
}

async function run() {
  console.log(`\nE2E: stream → save → load  (${BASE_URL})`);
  console.log('─'.repeat(50));

  // ── Step 1: Generate via streaming ──────────────────────────────────────
  console.log('\nStep 1: POST /api/plan?stream=true');
  const planInput = {
    destination: 'Paris',
    startDate: '2026-07-01',
    endDate: '2026-07-03',
    travelers: 2,
    budget: '€3000',
    style: 'balanced',
    interests: ['food', 'art'],
    homeCity: 'London',
  };

  let sseText;
  try {
    const planRes = await fetch(`${BASE_URL}/api/plan?stream=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(planInput),
    });
    assert(planRes.ok, `plan response status ${planRes.status}`);
    sseText = await planRes.text();
  } catch (err) {
    console.error(`  ❌ FAIL: Could not reach ${BASE_URL}/api/plan — is the server running?`);
    console.error(`  Error: ${err.message}`);
    process.exit(1);
  }

  const events = parseSSE(sseText);
  const types = events.map(e => e.type);
  console.log(`  Received ${events.length} SSE events: ${types.join(', ')}`);

  assert(types.includes('start'), 'has start event');
  assert(types.includes('done'), 'has done event');

  const doneEvent = events.find(e => e.type === 'done');
  assert(doneEvent?.data?.normalizedVersion === 2, 'done.data.normalizedVersion = 2');
  assert(doneEvent?.data?.rawPlan?.trip?.name, 'done.data has trip.name');
  assert(doneEvent?.data?.rawPlan?.days?.length >= 1, 'done.data has days');

  // Verify normalization — every day has a date
  const days = doneEvent?.data?.rawPlan?.days || [];
  const allDaysHaveDate = days.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date));
  assert(allDaysHaveDate, 'all days have YYYY-MM-DD date');

  // Budget items have both item and label
  const budget = doneEvent?.data?.rawPlan?.budget || [];
  if (budget.length > 0) {
    const allBudgetNormalized = budget.every(b => typeof b.item === 'string' && typeof b.label === 'string');
    assert(allBudgetNormalized, 'budget items have both item and label');
  }

  // ── Step 2: Verify auto-save result ─────────────────────────────────────
  console.log('\nStep 2: Verify auto-save');
  const saveResult = doneEvent?.saved;
  if (!saveResult) {
    console.log('  ⚠️  No auto-save result (GITHUB_TOKEN may not be configured)');
    if (doneEvent?.saveError) {
      console.log(`  Save error: ${doneEvent.saveError}`);
    }
    console.log('  Skipping load step — auto-save not available');
  } else {
    assert(typeof saveResult.id === 'string' && saveResult.id.length === 16, `saved.id = ${saveResult.id}`);
    assert(saveResult.url.includes(saveResult.id), `saved.url contains id`);
    console.log(`  Saved: ${saveResult.url}`);

    // ── Step 3: Load it back ────────────────────────────────────────────
    console.log('\nStep 3: GET /api/trip?id=' + saveResult.id);

    // Wait for GitHub CDN propagation
    await new Promise(r => setTimeout(r, 3000));

    const loadRes = await fetch(`${BASE_URL}/api/trip?id=${saveResult.id}`);
    assert(loadRes.ok, `trip response status ${loadRes.status}`);

    const loaded = await loadRes.json();
    assert(loaded.rawPlan?.trip?.name === doneEvent.data.rawPlan.trip.name, 'loaded trip.name matches');
    assert(loaded.rawPlan?.days?.length === doneEvent.data.rawPlan.days.length, 'loaded days count matches');

    console.log(`\n  🔗 Trip URL: ${saveResult.url}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('✅ All E2E tests pass');
    process.exit(0);
  } else {
    console.log('❌ Some E2E tests failed');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});
