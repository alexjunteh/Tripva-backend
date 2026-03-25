
// ── Language detection ────────────────────────────────────────────────────────
// Detect script/language from destination or any user text input
export function detectLanguage(text) {
  if (!text) return 'en';
  const s = String(text);
  // CJK Unified Ideographs (Chinese/Japanese/Korean)
  if (/[一-鿿㐀-䶿]/.test(s)) {
    // Distinguish Chinese vs Japanese: hiragana/katakana = Japanese
    if (/[぀-ゟ゠-ヿ]/.test(s)) return 'ja';
    return 'zh';
  }
  if (/[가-힯]/.test(s)) return 'ko';  // Korean Hangul
  if (/[؀-ۿ]/.test(s)) return 'ar';  // Arabic
  if (/[฀-๿]/.test(s)) return 'th';  // Thai
  if (/[ऀ-ॿ]/.test(s)) return 'hi';  // Devanagari (Hindi)
  return 'en';
}

const LANG_INSTRUCTIONS = {
  zh: 'LANGUAGE: Respond entirely in Simplified Chinese (简体中文). All place names, restaurant names, activity titles, details, tips, and hotel descriptions must be in Chinese. Use Chinese characters for all text content.',
  ja: 'LANGUAGE: Respond entirely in Japanese (日本語). All place names, restaurant names, activity titles, details, tips, and hotel descriptions must be in Japanese.',
  ko: 'LANGUAGE: Respond entirely in Korean (한국어). All place names, restaurant names, activity titles, details, tips, and hotel descriptions must be in Korean.',
  ar: 'LANGUAGE: Respond entirely in Arabic (العربية). All place names, restaurant names, activity titles, details, tips, and hotel descriptions must be in Arabic.',
  th: 'LANGUAGE: Respond entirely in Thai (ภาษาไทย). All place names, restaurant names, activity titles, details, tips, and hotel descriptions must be in Thai.',
  hi: 'LANGUAGE: Respond entirely in Hindi (हिन्दी). All place names, restaurant names, activity titles, details, tips, and hotel descriptions must be in Hindi.',
  en: '',
};

export function getLangInstruction(input) {
  const lang = detectLanguage(input.destination) || detectLanguage(input.homeCity);
  return LANG_INSTRUCTIONS[lang] || '';
}

export const SYSTEM_PROMPT = `You are an expert travel planning AI. Output ONLY valid JSON matching the schema provided.

HARD RULES:
- Route-first: design geography before hotels. No backtracking.
- tickets[] MUST always be an empty array []. Never fabricate tickets, PNRs, platform numbers, or passenger names. Tickets are only added by users after real bookings.
- Every day object MUST include a "date" field (YYYY-MM-DD) calculated from startDate + day index.
- Every budget item MUST have "status": "pending" (or "booked" if confirmed) and "category": one of accommodation/transport/food/activities/misc.
- Every hotel MUST include "stars" (integer 1-5) and "rating" (decimal 0-10 from reviews).
- mapStops must only contain actual destination stops — NEVER include the user's home city or origin airport.
- urgent[] must only list things the user needs to actively book/reserve. No informational or "check X" items.
- Hotel within 10min walk of train station always
- Train-first: only fly if >4h overland OR <2h flight
- Max 2.5h daily transport (except dedicated travel days)
- 2-4 nights minimum per city
- No Gulf airport routing (Dubai, Doha, Abu Dhabi)
- Every day must have full hour-by-hour timeline
- Hotels must have real checkin/checkout dates
- Budget items must have realistic price estimates

OUTPUT FORMAT: Return ONLY the JSON object, no markdown, no explanation.`;

const SCHEMA_EXAMPLE = `{
  "normalizedVersion": 2,
  "planVersion": "2026-03-23T00:00:00.000Z",
  "rawPlan": {
    "trip": {
      "id": "trip-abc123",
      "name": "Italy + Switzerland Adventure",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "timezone": "Europe/Rome",
      "currency": "EUR"
    },
    "days": [{
      "day": 1,
      "title": "Arrival in Rome",
      "subtitle": "Settling into the Eternal City",
      "emoji": "🏛️",
      "heroSeed": "rome-colosseum",
      "imageUrl": "",
      "timeline": [
        { "time": "14:00", "title": "Check in to Hotel", "detail": "Check in, freshen up", "type": "hotel", "mapQuery": "Hotel Name, Rome, Italy" },
        { "time": "16:00", "title": "Trastevere Walk", "detail": "Explore the cobbled streets", "type": "activity", "mapQuery": "Trastevere, Rome" },
        { "time": "19:30", "title": "Dinner at Da Enzo", "detail": "Classic Roman cacio e pepe", "type": "meal", "mapQuery": "Da Enzo al 29, Trastevere, Rome", "stars": 4.5, "reviews": "2,341 reviews" }
      ],
      "highlights": ["Trastevere at golden hour", "First Roman pasta"],
      "localTips": ["Buy 48h transit pass at airport", "Book Colosseum in advance"],
      "photos": []
    }],
    "hotels": [{
      "city": "Rome",
      "name": "Hotel Roma Centrale",
      "stars": 4,
      "rating": 8.5,
      "price": "€120/night",
      "note": "3-min walk from Termini",
      "checkin": "YYYY-MM-DD",
      "checkout": "YYYY-MM-DD",
      "nights": 3,
      "bookUrl": "https://booking.com",
      "address": "Via Nazionale 1, Rome"
    }],
    "budget": [
      { "item": "Flights", "amount": "RM 2,400", "note": "Return KUL-FCO via MH", "status": "pending", "category": "transport" },
      { "item": "Hotels (12 nights)", "amount": "RM 6,000", "note": "Avg RM 500/night", "status": "pending", "category": "accommodation" }
    ],
    "urgent": [
      { "label": "Book Cinque Terre train", "note": "Sells out weeks ahead", "url": "https://trenitalia.com", "priority": 1 }
    ],
    "tickets": [],  // Leave empty — tickets are ONLY added when user has real confirmed bookings
    "mapStops": [
      { "name": "Rome", "lat": 41.9028, "lng": 12.4964, "emoji": "🏛️", "type": "stay", "day": 1, "nights": 3 }
    ],
    "mapRoute": [
      { "lat": 41.9028, "lng": 12.4964 }
    ]
  }
}`;

/**
 * Build the user message for generating a new trip plan.
 */
export function buildPlanPrompt(input) {
  const { destination, startDate, endDate, travelers, budget, style, interests, homeCity } = input;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const numDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

  // Try to extract currency code from budget string (e.g., "RM 15000" → "MYR", "€5000" → "EUR")
  const currencyHint = budget.includes('RM') ? 'MYR (show amounts in RM)' :
    budget.startsWith('$') ? 'USD' :
    budget.startsWith('€') ? 'EUR' :
    budget.startsWith('£') ? 'GBP' : 'local currency';

  const langInstruction = getLangInstruction(input);

  return `${langInstruction ? langInstruction + '\n\n' : ''}Plan a ${numDays}-day trip to ${destination} for ${travelers} traveler(s).

TRIP DETAILS:
- Home city: ${homeCity}
- Start date: ${startDate}
- End date: ${endDate} (${numDays} days total)
- Total budget: ${budget}
- Travel style: ${style}
- Interests: ${interests.join(', ')}

REQUIREMENTS:
- Design the route first (geography-optimized, no backtracking)
- Minimum 2 nights per city, maximum city count: ~${Math.floor(numDays / 2)}
- Every day needs a complete hour-by-hour timeline (from wake-up to sleep)
- All hotels must be near train stations (within 10 min walk)
- Budget breakdown in ${currencyHint}
- Include mapStops with real GPS coordinates for every city/town
- Include mapRoute as the ordered GPS path through all stops
- Tickets section: plan the main intercity train journeys
- urgent: include any bookings that should be done in advance

OUTPUT SCHEMA (normalizedVersion: 2):
${SCHEMA_EXAMPLE}

Generate the complete ${numDays}-day plan now. Return ONLY the JSON object.`;
}

/**
 * Build the user message for patching an existing trip state.
 */
export function buildPatchPrompt(state, instruction) {
  return `You are applying a targeted patch to an existing trip plan.

INSTRUCTION: ${instruction}

RULES:
- Apply ONLY what the instruction asks for
- Preserve ALL other fields exactly as-is
- Maintain normalizedVersion: 2
- If adding/modifying days, keep timeline complete (hour-by-hour)
- If changing hotels, update checkin/checkout dates accordingly
- Return the COMPLETE updated trip state JSON

CURRENT STATE:
${JSON.stringify(state, null, 2)}

Return ONLY the complete updated JSON object.`;
}

/**
 * Build the user message for generating a skeleton plan (no day timelines).
 * Fast first phase — produces trip metadata, hotels, budget, mapStops, urgent.
 */
export function buildSkeletonPrompt(input) {
  const { destination, startDate, endDate, travelers, budget, style, interests, homeCity } = input;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const numDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

  const currencyHint = budget.includes('RM') ? 'MYR (show amounts in RM)' :
    budget.startsWith('$') ? 'USD' :
    budget.startsWith('€') ? 'EUR' :
    budget.startsWith('£') ? 'GBP' : 'local currency';

  return `Plan a ${numDays}-day trip to ${destination} for ${travelers} traveler(s).

TRIP DETAILS:
- Home city: ${homeCity}
- Start date: ${startDate}
- End date: ${endDate} (${numDays} days total)
- Total budget: ${budget}
- Travel style: ${style}
- Interests: ${interests.join(', ')}

REQUIREMENTS:
- Design the route first (geography-optimized, no backtracking)
- Minimum 2 nights per city, maximum city count: ~${Math.floor(numDays / 2)}
- All hotels must be near train stations (within 10 min walk)
- Budget breakdown in ${currencyHint}
- Include mapStops with real GPS coordinates for every city/town
- Include mapRoute as the ordered GPS path through all stops
- Tickets section: plan the main intercity train journeys
- urgent: include any bookings that should be done in advance

IMPORTANT — FOR THE DAYS ARRAY:
Return the JSON with the \`days\` array containing ONLY these fields per day:
day, title, subtitle, emoji, heroSeed, imageUrl, highlights, localTips, photos
DO NOT include a \`timeline\` array for any day. The timeline for each day will be filled in separately.

OUTPUT SCHEMA (normalizedVersion: 2):
${SCHEMA_EXAMPLE}

Generate the skeleton ${numDays}-day plan now (no timelines). Return ONLY the JSON object.`;
}

/**
 * Build the user message for generating a single day's timeline.
 * Takes the skeleton plan for context and fills in hour-by-hour detail for one day.
 */
export function buildDayPrompt(skeleton, dayNum, input) {
  const days = skeleton?.rawPlan?.days ?? [];
  const day = days.find(d => d.day === dayNum) || days[dayNum - 1] || {};
  const dayTitle = day.title || `Day ${dayNum}`;
  const daySubtitle = day.subtitle || '';

  const tripName = skeleton?.rawPlan?.trip?.name || input.destination;
  const hotels = skeleton?.rawPlan?.hotels ?? [];
  const relevantHotel = hotels.find(h =>
    h.checkin && h.checkout &&
    new Date(h.checkin) <= new Date(new Date(input.startDate).getTime() + (dayNum - 1) * 86400000) &&
    new Date(h.checkout) >= new Date(new Date(input.startDate).getTime() + (dayNum - 1) * 86400000)
  ) || hotels[0];

  return `You are planning Day ${dayNum} of a trip: "${tripName}".

DAY ${dayNum}: ${dayTitle}
${daySubtitle ? `Subtitle: ${daySubtitle}` : ''}
${day.highlights?.length ? `Highlights: ${day.highlights.join(', ')}` : ''}
${relevantHotel ? `Hotel: ${relevantHotel.name}, ${relevantHotel.city}` : ''}

TRAVELER INFO:
- Destination area: ${input.destination}
- Travel style: ${input.style}
- Interests: ${input.interests.join(', ')}
- Party size: ${input.travelers}

Generate the complete hour-by-hour timeline for this day, from wake-up to sleep.
Include transport, meals, activities, and check-in/check-out as relevant.

Return ONLY a JSON object in this exact format:
{
  "day": ${dayNum},
  "timeline": [
    {
      "time": "09:00",
      "title": "Activity name",
      "detail": "Description of what to do/see",
      "type": "activity",
      "mapQuery": "Specific place name, city, country",
      "stars": 4.5,
      "reviews": "1,234 reviews"
    }
  ]
}

Where each timeline item has:
- time: 24h format (e.g. "09:00")
- title: short name of the activity/meal/transport
- detail: 1-2 sentence description
- type: one of "transport", "activity", "meal", "hotel", "food", "logistics"
- mapQuery: specific searchable location string
- stars: optional rating (number)
- reviews: optional review count string

Aim for 6-10 timeline items covering the full day. Return ONLY the JSON object, no markdown.`;
}
