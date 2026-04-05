import OpenAI from 'openai';
import { z } from 'zod';
import { tripStateSchema, formatZodError } from './schema.js';
import { SYSTEM_PROMPT, buildPlanPrompt, buildPatchPrompt, buildSkeletonPrompt, buildDayPrompt } from './prompt.js';
import { enrichWithAffiliateLinks } from './affiliate.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 8192;
const MAX_RETRIES = 3;

/**
 * Strip markdown code fences if Claude wraps the JSON response.
 */
function extractJSON(text) {
  const trimmed = text.trim();
  // Remove ```json ... ``` or ``` ... ```
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

/**
 * Call Claude with retry logic on JSON parse / schema validation failures.
 * Builds a multi-turn conversation on retries so Claude can self-correct.
 *
 * @param {Array} initialMessages - Starting messages array
 * @returns {import('../lib/schema.js').TripState} Validated trip state
 */
async function callWithRetry(initialMessages) {
  let messages = [...initialMessages];
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let responseText = '';

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      });

      responseText = response.choices[0]?.message?.content ?? '';
    } catch (err) {
      if (err?.status === 429) throw err;
      if (err?.status === 401) throw err;
      lastError = `API error: ${err.message}`;
      if (attempt === MAX_RETRIES) throw new Error(lastError);
      // Brief wait before retry on transient errors
      await new Promise(r => setTimeout(r, 1000 * attempt));
      continue;
    }

    // ── Parse JSON ──────────────────────────────────────────────────────────
    let parsed;
    try {
      parsed = JSON.parse(extractJSON(responseText));
    } catch (e) {
      lastError = `Response is not valid JSON (${e.message})`;
      if (attempt < MAX_RETRIES) {
        messages = [
          ...messages,
          { role: 'assistant', content: responseText },
          {
            role: 'user',
            content: `Your response could not be parsed as JSON. Error: ${e.message}. Return ONLY the raw JSON object — no markdown, no explanation.`,
          },
        ];
      }
      continue;
    }

    // ── Validate schema ─────────────────────────────────────────────────────
    const result = tripStateSchema.safeParse(parsed);
    if (!result.success) {
      lastError = `Schema validation failed: ${formatZodError(result.error)}`;
      if (attempt < MAX_RETRIES) {
        messages = [
          ...messages,
          { role: 'assistant', content: responseText },
          {
            role: 'user',
            content: `The JSON doesn't match the required schema. Issues: ${formatZodError(result.error)}.\n\nPlease return the complete corrected JSON object.`,
          },
        ];
      }
      continue;
    }

    return result.data;
  }

  throw new Error(`Failed after ${MAX_RETRIES} attempts. Last error: ${lastError}`);
}

/**
 * Generate a new trip plan from scratch.
 *
 * @param {import('../lib/schema.js').PlanInput} input
 * @returns {Promise<import('../lib/schema.js').TripState>}
 */
export async function generatePlan(input) {
  const userMessage = buildPlanPrompt(input);
  return callWithRetry([{ role: 'user', content: userMessage }]);
}

/**
 * Generate a plan with SSE progress callbacks.
 * onProgress receives { type: 'progress'|'done'|'error', message?, data? }
 *
 * @param {import('../lib/schema.js').PlanInput} input
 * @param {Function} onProgress
 * @returns {Promise<import('../lib/schema.js').TripState>}
 */
export async function generatePlanStreamed(input, onProgress) {
  const steps = [
    'Designing geography-optimized route...',
    'Building daily itineraries and timelines...',
    'Adding hotels, budget, and train tickets...',
    'Validating and finalizing your plan...',
  ];

  let stepIdx = 0;
  const progressInterval = setInterval(() => {
    if (stepIdx < steps.length) {
      onProgress({ type: 'progress', message: steps[stepIdx++] });
    }
  }, 2500);

  try {
    const result = await generatePlan(input);
    clearInterval(progressInterval);
    return result;
  } catch (err) {
    clearInterval(progressInterval);
    throw err;
  }
}

/**
 * Patch an existing trip state with a natural-language instruction.
 *
 * @param {import('../lib/schema.js').TripState} state
 * @param {string} instruction
 * @returns {Promise<import('../lib/schema.js').TripState>}
 */
export async function patchPlan(state, instruction) {
  const userMessage = buildPatchPrompt(state, instruction);
  const MAX_PATCH_RETRIES = 3;
  let messages = [{ role: 'user', content: userMessage }];
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_PATCH_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 8192,
        messages: [{ role: 'system', content: 'You are a travel plan editor. Apply the requested change precisely. Return ONLY valid JSON. No markdown, no explanation.' }, ...messages],
      });
      const text = response.choices[0]?.message?.content ?? '';
      const jsonStr = extractJSON(text);
      const result = JSON.parse(jsonStr);
      
      // If result has rawPlan, it's a complete state — return as-is
      if (result.rawPlan) return result;
      
      // If result has trip + days, it's a complete plan — wrap it
      if (result.trip && result.days) {
        return { normalizedVersion: 2, planVersion: state.planVersion, rawPlan: result };
      }
      
      // If result has just { days: [...] }, it's a partial patch — merge
      if (result.days && !result.trip) {
        const plan = JSON.parse(JSON.stringify(state.rawPlan || state));
        // Merge changed days back
        for (const patchedDay of result.days) {
          const idx = plan.days.findIndex(d => d.day === patchedDay.day);
          if (idx >= 0) {
            plan.days[idx] = { ...plan.days[idx], ...patchedDay };
          } else {
            plan.days.push(patchedDay);
            plan.days.sort((a, b) => a.day - b.day);
          }
        }
        // Merge hotels/budget if provided
        if (result.hotels) plan.hotels = result.hotels;
        if (result.budget) plan.budget = result.budget;
        if (result.urgent) plan.urgent = result.urgent;
        
        return { normalizedVersion: 2, planVersion: state.planVersion, rawPlan: plan };
      }
      
      // Fallback: treat as complete plan
      return { normalizedVersion: 2, planVersion: state.planVersion, rawPlan: result };
    } catch (err) {
      if (err?.status === 429) throw err;
      if (err?.status === 401) throw err;
      lastError = err.message || String(err);
      if (attempt < MAX_PATCH_RETRIES) {
        messages = [
          ...messages,
          { role: 'assistant', content: '(invalid)' },
          { role: 'user', content: 'Invalid JSON. Return ONLY the patched days as valid JSON: { "days": [...] }' },
        ];
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  throw new Error(`Failed after ${MAX_PATCH_RETRIES} attempts. Last error: ${lastError}`);
}


/**
 * Call Claude for a single day's timeline (lighter, no full schema validation).
 */
async function callDayTimeline(skeleton, dayNum, input) {
  const dayTimelineSchema = z.object({
    day: z.number(),
    timeline: z.array(z.object({
      time: z.string().default(''),
      title: z.string(),
      detail: z.string().default(''),
      type: z.enum(['transport', 'activity', 'meal', 'hotel', 'food', 'logistics']).default('activity'),
      mapQuery: z.string().default(''),
      stars: z.number().optional(),
      reviews: z.string().optional(),
    })).default([])
  });

  const messages = [{ role: 'user', content: buildDayPrompt(skeleton, dayNum, input) }];
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'system', content: 'You are a travel planning AI. Output ONLY valid JSON. No markdown, no explanation.' }, ...messages],
  });
  const text = response.choices[0]?.message?.content ?? '';
  const parsed = JSON.parse(extractJSON(text));
  return dayTimelineSchema.parse(parsed);
}

/**
 * Generate a plan progressively: skeleton first, then each day's timeline one-by-one.
 * Calls onEvent with: progress, skeleton, day events during generation.
 * Returns the fully assembled + affiliate-enriched trip state.
 *
 * @param {import('../lib/schema.js').PlanInput} input
 * @param {Function} onEvent
 * @returns {Promise<import('../lib/schema.js').TripState>}
 */
export async function generatePlanProgressive(input, onEvent) {
  // Phase 1: Generate skeleton (trip + hotels + budget + map, no timelines)
  onEvent({ type: 'progress', message: 'Designing your route...' });
  const skeletonRaw = await callWithRetry([{ role: 'user', content: buildSkeletonPrompt(input) }]);

  // Send skeleton event — frontend can render trip header immediately
  onEvent({ type: 'skeleton', data: skeletonRaw });

  // Phase 2: Generate ALL days in parallel (much faster)
  const days = skeletonRaw.rawPlan.days;
  onEvent({ type: 'progress', message: `Building ${days.length} days in parallel...` });

  const dayPromises = days.map((day) =>
    callDayTimeline(skeletonRaw, day.day, input)
      .then(result => ({ ...day, timeline: result.timeline || [] }))
      .catch(e => {
        console.error(`[progressive] Day ${day.day} timeline failed:`, e.message);
        return { ...day, timeline: [] };
      })
  );

  const filledDays = await Promise.all(dayPromises);

  // Emit day events in order
  for (const filledDay of filledDays) {
    onEvent({ type: 'day', data: filledDay });
  }

  // Assemble final state with all timelines filled in
  const finalState = {
    ...skeletonRaw,
    rawPlan: { ...skeletonRaw.rawPlan, days: filledDays }
  };

  return enrichWithAffiliateLinks(finalState, input.travelers || 2);
}
