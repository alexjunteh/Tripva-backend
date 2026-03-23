import Anthropic from '@anthropic-ai/sdk';
import { tripStateSchema, formatZodError } from './schema.js';
import { SYSTEM_PROMPT, buildPlanPrompt, buildPatchPrompt } from './prompt.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-haiku-4-5-20251001';
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
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      });

      responseText = response.content.find(b => b.type === 'text')?.text ?? '';
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw err;
      if (err instanceof Anthropic.AuthenticationError) throw err;
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
  return callWithRetry([{ role: 'user', content: userMessage }]);
}
