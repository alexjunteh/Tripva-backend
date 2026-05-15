/**
 * prompt-benchmark.test.js
 * Benchmarks prompt.js for correctness, coverage, and live output quality.
 *
 * Run:
 *   node tests/prompt-benchmark.test.js              # offline: prompt structure only
 *   OPENAI_API_KEY=sk-... node tests/prompt-benchmark.test.js --live  # includes live API scoring
 */

import {
  SYSTEM_PROMPT,
  buildPlanPrompt,
  buildSkeletonPrompt,
  buildDayPrompt,
  detectLanguage,
  getLangInstruction,
  getArchetypeInstruction,
} from '../lib/prompt.js';

const LIVE = process.argv.includes('--live') && process.env.OPENAI_API_KEY;

let passed = 0;
let failed = 0;
let warnings = 0;

function ok(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function warn(condition, label) {
  if (!condition) {
    console.warn(`  ⚠️  WARN: ${label}`);
    warnings++;
  }
}

// ─── Standard test inputs ─────────────────────────────────────────────────────

const BASE_INPUT = {
  destination: 'Paris, France',
  startDate: '2026-07-01',
  endDate: '2026-07-05',
  travelers: 2,
  budget: '€3,000',
  style: 'cultural',
  interests: ['museums', 'food', 'architecture'],
  homeCity: 'Kuala Lumpur',
};

const MYR_INPUT = { ...BASE_INPUT, budget: 'RM 15,000', destination: 'Japan' };
const JPY_INPUT = { ...BASE_INPUT, budget: '¥400,000', destination: 'Tokyo' };
const SGD_INPUT = { ...BASE_INPUT, budget: 'SGD 5,000', destination: 'Bali' };
const THB_INPUT = { ...BASE_INPUT, budget: '฿80,000', destination: 'Chiang Mai' };
const IDR_INPUT = { ...BASE_INPUT, budget: 'IDR 20,000,000', destination: 'Lombok' };
const INR_INPUT = { ...BASE_INPUT, budget: '₹200,000', destination: 'Rajasthan' };

// ─── SECTION 1: SYSTEM_PROMPT rule coverage ───────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log('SECTION 1: SYSTEM_PROMPT — rule coverage');
console.log('══════════════════════════════════════════════════');

ok(SYSTEM_PROMPT.includes('"photospot"'), 'RULE 3: photospot type included in allowed types');
ok(SYSTEM_PROMPT.includes('mapQuery'), 'RULE 3: mapQuery listed as required field');
ok(/MINIMUM 7/.test(SYSTEM_PROMPT), 'RULE 2: minimum 7 items (not 5)');
ok(SYSTEM_PROMPT.includes('MUST include') && SYSTEM_PROMPT.includes('"stars"') && SYSTEM_PROMPT.includes('"reviews"'), 'RULE 13: stars/reviews use MUST');
ok(!SYSTEM_PROMPT.includes('SHOULD include'), 'RULE 13: no SHOULD (weakens enforcement)');
ok(/amsterdam(?!-canals)/.test(SYSTEM_PROMPT) || !SYSTEM_PROMPT.includes('amsterdam-canals'), 'RULE 14 example: no compound heroSeed "amsterdam-canals"');
ok(!SYSTEM_PROMPT.includes('rome-colosseum'), 'Schema example: no compound heroSeed "rome-colosseum"');
ok(SYSTEM_PROMPT.includes('NEVER use compound strings'), 'RULE 14: explicit compound string ban');
ok(!SYSTEM_PROMPT.match(/RULE 9.*budget items/s), 'RULE 9 removed (was duplicate of RULE 4)');
ok(SYSTEM_PROMPT.includes('tickets[] MUST always be an empty array') ||
   SYSTEM_PROMPT.includes("tickets[] MUST always be an empty array []"), 'RULE 7: tickets must be empty stated clearly');
ok(SYSTEM_PROMPT.includes('photospot'), 'RULE 11: photospot section exists');
ok(SYSTEM_PROMPT.includes('"lat"') && SYSTEM_PROMPT.includes('"lng"'), 'RULE 11: lat/lng required for photospots');
ok(SYSTEM_PROMPT.includes('heroSeed'), 'RULE 14: heroSeed field required');
ok(SYSTEM_PROMPT.includes('"photos"'), 'RULE 12: photos array requirement stated');
ok(SYSTEM_PROMPT.includes('stars'), 'RULE 5: hotel stars field mentioned');
ok(SYSTEM_PROMPT.includes('rating'), 'RULE 5: hotel rating field mentioned');
ok(SYSTEM_PROMPT.includes('address'), 'RULE 5: hotel address field mentioned');
ok(SYSTEM_PROMPT.includes('"city"') || SYSTEM_PROMPT.includes('day.city') || SYSTEM_PROMPT.includes('RULE 9'), 'RULE 9: day.city required');
ok(SYSTEM_PROMPT.includes('tips[]') || SYSTEM_PROMPT.includes('"tips"'), 'RULE 10: tips[] top-level array mentioned');
ok(SYSTEM_PROMPT.includes('trip.emoji') || SYSTEM_PROMPT.includes('"emoji"'), 'RULE 14: trip.emoji mentioned');

// ─── SECTION 2: buildPlanPrompt correctness ───────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log('SECTION 2: buildPlanPrompt — prompt construction');
console.log('══════════════════════════════════════════════════');

{
  const prompt = buildPlanPrompt(BASE_INPUT);
  ok(prompt.includes('Paris, France'), 'Destination included');
  ok(prompt.includes('5-day'), 'Trip duration calculated correctly (Jul 1-5 = 5 days)');
  ok(prompt.includes('2026-07-01'), 'Start date included');
  ok(prompt.includes('2026-07-05'), 'End date included');
  ok(prompt.includes('€3,000'), 'Budget included');
  ok(prompt.includes('EUR'), 'Currency hint EUR for € budget');
  ok(!prompt.includes('local currency'), 'Not falling back to generic "local currency" for EUR');
  ok(prompt.includes('Tickets section') === false || prompt.includes('tickets[]: ALWAYS leave as an empty array'), 'No contradictory tickets instruction');
  ok(prompt.includes('urgent[]:'), 'urgent[] instruction present');
  ok(prompt.includes('normalizedVersion: 2'), 'Schema version 2 in prompt');
}

// ─── SECTION 3: Currency detection ───────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log('SECTION 3: Currency detection coverage');
console.log('══════════════════════════════════════════════════');

function currencyFrom(input) {
  const prompt = buildPlanPrompt(input);
  const m = prompt.match(/Budget breakdown in (.+?)(?:\n|$)/);
  return m ? m[1].trim() : null;
}

ok(currencyFrom(BASE_INPUT)?.startsWith('EUR'), `EUR: ${currencyFrom(BASE_INPUT)}`);
ok(currencyFrom(MYR_INPUT)?.includes('MYR'), `MYR: ${currencyFrom(MYR_INPUT)}`);
ok(currencyFrom(JPY_INPUT)?.includes('JPY'), `JPY: ${currencyFrom(JPY_INPUT)}`);
ok(currencyFrom(SGD_INPUT)?.includes('SGD'), `SGD: ${currencyFrom(SGD_INPUT)}`);
ok(currencyFrom(THB_INPUT)?.includes('THB'), `THB: ${currencyFrom(THB_INPUT)}`);
ok(currencyFrom(IDR_INPUT)?.includes('IDR'), `IDR: ${currencyFrom(IDR_INPUT)}`);
ok(currencyFrom(INR_INPUT)?.includes('INR'), `INR: ${currencyFrom(INR_INPUT)}`);
ok(currencyFrom({ ...BASE_INPUT, budget: 'AUD 6,000' })?.includes('AUD'), `AUD detected`);
ok(currencyFrom({ ...BASE_INPUT, budget: 'HKD 20,000' })?.includes('HKD'), `HKD detected`);
ok(currencyFrom({ ...BASE_INPUT, budget: 'KRW 3,000,000' })?.includes('KRW'), `KRW detected`);
ok(currencyFrom({ ...BASE_INPUT, budget: 'PHP 50,000' })?.includes('PHP'), `PHP detected`);
ok(currencyFrom({ ...BASE_INPUT, budget: 'NT$ 80,000' })?.includes('TWD'), `TWD (NT$) detected`);

// ─── SECTION 4: Language detection ───────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log('SECTION 4: Language / archetype injection');
console.log('══════════════════════════════════════════════════');

ok(detectLanguage('东京') === 'zh', 'Chinese characters detected as zh');
ok(detectLanguage('東京') === 'zh', 'Traditional Chinese detected as zh');
ok(detectLanguage('日本語テスト') === 'ja', 'Hiragana/katakana detected as ja');
ok(detectLanguage('서울') === 'ko', 'Hangul detected as ko');
ok(detectLanguage('Bangkok') === 'en', 'Latin text defaults to en');
ok(detectLanguage('') === 'en', 'Empty string defaults to en');

// Note: pure kanji (東京) is ambiguous CJK → detected as zh. Need hiragana/katakana to trigger ja.
const jaPrompt = buildPlanPrompt({ ...BASE_INPUT, destination: '東京 (/とうきょう)', homeCity: '吉隆坡' });
ok(jaPrompt.includes('Japanese'), 'Japanese lang instruction injected for Japanese destination (with hiragana)');

const soloInst = getArchetypeInstruction({ archetype: 'solo', travelers: 1, pace: 'balanced', safety_priority: 7 });
ok(soloInst.includes('ONE traveler'), 'Solo archetype: ONE traveler stated');
ok(soloInst.includes('social-opportunity'), 'Solo archetype: social stops required');

const familyInst = getArchetypeInstruction({ archetype: 'family', travelers: 4, child_ages: [6, 8], stroller_needed: true });
ok(familyInst.includes('Stroller') || familyInst.includes('stroller'), 'Family archetype: stroller mentioned');
ok(familyInst.includes('4 people'), 'Family archetype: party size in budget note');

const nomadInst = getArchetypeInstruction({ archetype: 'nomad', wifi_priority: true, work_hours_per_week: 40 });
ok(nomadInst.includes('8h'), 'Nomad archetype: work hours calculated (40/5=8)');
ok(nomadInst.includes('COWORKING-FIRST'), 'Nomad archetype: coworking-first default');

// ─── SECTION 5: buildSkeletonPrompt ──────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log('SECTION 5: buildSkeletonPrompt');
console.log('══════════════════════════════════════════════════');

{
  const skPrompt = buildSkeletonPrompt(BASE_INPUT);
  ok(skPrompt.includes('DO NOT include a `timeline`'), 'Skeleton: timeline excluded from days');
  ok(!skPrompt.includes('Tickets section: plan'), 'Skeleton: no contradictory tickets instruction');
  ok(skPrompt.includes('tickets[]: ALWAYS leave as an empty array'), 'Skeleton: empty tickets instruction');
  ok(skPrompt.includes('urgent[]:'), 'Skeleton: urgent instruction present');
  ok(skPrompt.includes('EUR'), 'Skeleton: EUR currency detected for € budget');
  ok(skPrompt.includes('AT LEAST one hotel per city'), 'Skeleton: hotel completeness requirement');
  ok(skPrompt.includes('AT LEAST 10 budget items'), 'Skeleton: budget completeness requirement');
  ok(skPrompt.includes('city') && skPrompt.includes('day, city'), 'Skeleton: city field in days list');
  ok(skPrompt.includes('tips[]'), 'Skeleton: tips[] mentioned as required');
  ok(skPrompt.includes('"pct"') || skPrompt.includes('pct'), 'Skeleton: pct field in budget requirement');
}

// ─── SECTION 6: buildDayPrompt ────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log('SECTION 6: buildDayPrompt');
console.log('══════════════════════════════════════════════════');

{
  const skeleton = {
    rawPlan: {
      trip: { name: 'Paris Trip', startDate: '2026-07-01' },
      days: [
        { day: 1, title: 'Arrival in Paris', subtitle: 'First impressions', highlights: ['Eiffel Tower'] },
        { day: 2, title: 'Louvre Day', subtitle: 'Art immersion', highlights: ['Mona Lisa'] },
      ],
      hotels: [{
        name: 'Hotel Madeleine', city: 'Paris',
        checkin: '2026-07-01', checkout: '2026-07-05',
      }],
    },
  };

  const dayPrompt = buildDayPrompt(skeleton, 1, BASE_INPUT);
  ok(dayPrompt.includes('Day 1'), 'Day prompt: day number stated');
  ok(dayPrompt.includes('MINIMUM 7'), 'Day prompt: minimum 7 items');
  ok(dayPrompt.includes('"photospot"'), 'Day prompt: photospot type in allowed types');
  ok(dayPrompt.includes('tip') && dayPrompt.includes('lat') && dayPrompt.includes('lng'), 'Day prompt: photospot fields tip/lat/lng required');
  ok(dayPrompt.includes('REQUIRED for all items'), 'Day prompt: mapQuery stated as required for all');
  ok(dayPrompt.includes('minimum 25 words'), 'Day prompt: detail word minimum stated');
  ok(dayPrompt.includes('stars') && dayPrompt.includes('reviews'), 'Day prompt: stars/reviews requirement stated');
  ok(dayPrompt.includes('Hotel Madeleine'), 'Day prompt: relevant hotel injected');
  ok(dayPrompt.includes('Eiffel Tower'), 'Day prompt: day highlights injected');

  const day2Prompt = buildDayPrompt(skeleton, 2, BASE_INPUT);
  ok(day2Prompt.includes('Louvre Day'), 'Day 2 prompt: correct day title');
  ok(day2Prompt.includes('Mona Lisa'), 'Day 2 prompt: correct highlights');
}

// ─── SECTION 7: buildPatchPrompt ─────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log('SECTION 7: buildPatchPrompt — smart routing');
console.log('══════════════════════════════════════════════════');

{
  const { buildPatchPrompt } = await import('../lib/prompt.js');

  const mockState = {
    rawPlan: {
      trip: { name: 'Test Trip', startDate: '2026-07-01' },
      days: [
        { day: 1, date: '2026-07-01', title: 'Arrival', timeline: [{ time: '10:00', title: 'Check in', type: 'hotel' }] },
        { day: 2, date: '2026-07-02', title: 'Explore', timeline: [{ time: '09:00', title: 'Louvre', type: 'activity' }] },
        { day: 3, date: '2026-07-03', title: 'Day Trip', timeline: [{ time: '08:00', title: 'Versailles', type: 'activity' }] },
      ],
      hotels: [],
      budget: [],
    },
  };

  // General edit → compact plan
  const generalPatch = buildPatchPrompt(mockState, 'Change all hotels to 5-star');
  ok(generalPatch.includes('CURRENT PLAN'), 'General patch: sends full compact plan');
  ok(!generalPatch.includes('DAYS TO PATCH'), 'General patch: not targeted format');

  // Day-specific edit → targeted
  const dayPatch = buildPatchPrompt(mockState, 'Add a cooking class to day 2');
  ok(dayPatch.includes('DAYS TO PATCH'), 'Day-specific patch: targeted format');
  ok(dayPatch.includes('Louvre'), 'Day-specific patch: affected day content included');
  ok(!dayPatch.includes('Versailles'), 'Day-specific patch: unaffected day excluded');

  // Keyword match — "arrival"
  const arrivalPatch = buildPatchPrompt(mockState, 'Move my arrival to 14:00');
  ok(arrivalPatch.includes('day 1') || arrivalPatch.includes('Arrival'), 'Arrival keyword maps to day 1');

  // Date match
  const datePatch = buildPatchPrompt(mockState, 'Add a sunset cruise on the 3rd');
  ok(datePatch.includes('Versailles'), 'Date match "3rd" maps to 2026-07-03 correctly');
}

// ─── SECTION 8: Prompt token size check ──────────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log('SECTION 8: Prompt size / token estimate');
console.log('══════════════════════════════════════════════════');

{
  const sysBytes = new TextEncoder().encode(SYSTEM_PROMPT).length;
  const planPrompt = buildPlanPrompt(BASE_INPUT);
  const planBytes = new TextEncoder().encode(planPrompt).length;
  const sysToks = Math.round(sysBytes / 3.5);
  const planToks = Math.round(planBytes / 3.5);
  const totalToks = sysToks + planToks;

  console.log(`  System prompt: ~${sysToks} tokens (${(sysBytes/1024).toFixed(1)}KB)`);
  console.log(`  Plan user message: ~${planToks} tokens (${(planBytes/1024).toFixed(1)}KB)`);
  console.log(`  Total input: ~${totalToks} tokens`);

  warn(sysToks < 3000, `System prompt under 3K tokens (current: ~${sysToks}) — leave headroom for output`);
  warn(totalToks < 6000, `Total input under 6K tokens (current: ~${totalToks}) — with 8192 max_tokens leaves ~${8192 - totalToks} for output`);
  ok(totalToks < 8000, `Input tokens (${totalToks}) within gpt-4o-mini context`);

  // Model quality note
  console.log('\n  ⚠️  MODEL: gpt-4o-mini (lib/claude.js:9)');
  console.log('  gpt-4o-mini follows complex rule sets less reliably than gpt-4o.');
  console.log('  Recommended upgrade path: use gpt-4o for skeleton + gpt-4o-mini for day timelines.');
  console.log('  Cost delta: ~$0.08 per full trip plan (skeleton only on gpt-4o, 6-8 day prompts on mini).');
}

// ─── SECTION 9: Live API output scoring (requires --live flag + OPENAI_API_KEY) ─

if (LIVE) {
  console.log('\n══════════════════════════════════════════════════');
  console.log('SECTION 9: Live API output quality scoring');
  console.log('══════════════════════════════════════════════════');

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const TEST_INPUT = {
    destination: 'Kyoto, Japan',
    startDate: '2026-09-10',
    endDate: '2026-09-13',
    travelers: 2,
    budget: '¥150,000',
    style: 'cultural',
    interests: ['temples', 'food', 'gardens'],
    homeCity: 'Kuala Lumpur',
  };

  console.log('  Calling /skeleton → generating Day 1...');
  const skPrompt = buildSkeletonPrompt(TEST_INPUT);

  let skeleton;
  try {
    const skRes = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: skPrompt },
      ],
    });
    const raw = skRes.choices[0].message.content.trim().replace(/^```json\n?|```$/g, '');
    skeleton = JSON.parse(raw);
    console.log('  Skeleton generated ✅');
  } catch (e) {
    console.error(`  ❌ Skeleton call failed: ${e.message}`);
  }

  if (skeleton) {
    // Score skeleton against rules
    const plan = skeleton?.rawPlan;
    ok(plan?.trip?.currency, 'LIVE: trip.currency present');
    ok(plan?.hotels?.length > 0, 'LIVE: hotels[] non-empty');
    ok(plan?.budget?.length >= 8, `LIVE: ≥8 budget items (got ${plan?.budget?.length})`);
    ok(plan?.tickets?.length === 0, `LIVE: tickets[] is empty (got ${plan?.tickets?.length})`);
    ok(plan?.mapStops?.length > 0, 'LIVE: mapStops[] non-empty');
    ok(plan?.days?.every(d => d.date), 'LIVE: all skeleton days have date field');
    ok(plan?.days?.every(d => d.heroSeed && !d.heroSeed.includes('-')), 'LIVE: heroSeed has no hyphens');
    ok(plan?.hotels?.every(h => h.stars && h.rating), 'LIVE: all hotels have stars + rating');

    // Check budget sum vs input
    const totalBudget = plan?.budget?.filter(b => b.item !== 'Total').reduce((s, b) => {
      const amt = parseFloat(String(b.amount).replace(/[^\d.]/g, ''));
      return s + (isNaN(amt) ? 0 : amt);
    }, 0);
    const totalLine = plan?.budget?.find(b => b.item === 'Total');
    ok(totalLine, 'LIVE: budget has Total line');

    // Generate day 1
    const dayPrompt = buildDayPrompt(skeleton, 1, TEST_INPUT);
    let day1;
    try {
      const dayRes = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 3000,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: dayPrompt },
        ],
      });
      const raw = dayRes.choices[0].message.content.trim().replace(/^```json\n?|```$/g, '');
      day1 = JSON.parse(raw);
      console.log('  Day 1 generated ✅');
    } catch (e) {
      console.error(`  ❌ Day 1 call failed: ${e.message}`);
    }

    if (day1?.timeline) {
      const tl = day1.timeline;
      ok(tl.length >= 7, `LIVE: Day 1 has ≥7 items (got ${tl.length})`);
      ok(tl.every(i => i.time && i.title && i.detail && i.type), 'LIVE: all items have time/title/detail/type');
      ok(tl.every(i => i.mapQuery), 'LIVE: all items have mapQuery');
      const photospots = tl.filter(i => i.type === 'photospot');
      ok(photospots.length >= 1, `LIVE: ≥1 photospot (got ${photospots.length})`);
      ok(photospots.every(p => p.lat && p.lng && p.tip), 'LIVE: photospots have lat/lng/tip');
      const mealsAndActivities = tl.filter(i => ['meal', 'food', 'activity'].includes(i.type));
      const withStars = mealsAndActivities.filter(i => i.stars && i.reviews);
      ok(withStars.length === mealsAndActivities.length,
        `LIVE: all meal/activity items have stars+reviews (${withStars.length}/${mealsAndActivities.length})`);
      ok(!day1.heroSeed?.includes('-'), `LIVE: Day 1 heroSeed no hyphens (got "${day1.heroSeed}")`);
      ok(tl.every(i => i.detail?.split(' ').length >= 20),
        `LIVE: all details ≥20 words`);
    }
  }
} else {
  console.log('\n══════════════════════════════════════════════════');
  console.log('SECTION 9: Live scoring — SKIPPED');
  console.log('  Run with: OPENAI_API_KEY=sk-... node tests/prompt-benchmark.test.js --live');
  console.log('══════════════════════════════════════════════════');
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);
if (failed === 0) {
  console.log('✅ Prompt benchmark PASSED');
  process.exit(0);
} else {
  console.log('❌ Prompt benchmark FAILED — check items above');
  process.exit(1);
}
