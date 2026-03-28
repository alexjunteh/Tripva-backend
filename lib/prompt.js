
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

════════════════════════════════════════════════════════════════
⚠️  HARD RULES — YOU MUST FOLLOW ALL OF THESE WITHOUT EXCEPTION
════════════════════════════════════════════════════════════════

RULE 1 — DAY DATE FIELD (MANDATORY):
  Every single day object MUST include a "date" field in YYYY-MM-DD format.
  Calculate it as: startDate + (day index - 1). Never omit this field.

RULE 2 — MINIMUM 5 TIMELINE ITEMS PER DAY (MANDATORY):
  Every day MUST have AT LEAST 5 timeline items. Aim for 6-10.
  Each item MUST have a specific time in HH:MM 24h format (e.g. "09:00").
  A "full day" with vague descriptions is NOT acceptable.

RULE 3 — TIMELINE ITEM REQUIRED FIELDS (MANDATORY):
  Every timeline item MUST include ALL four of these fields:
    - "time": HH:MM format (e.g. "09:00")
    - "title": short name of the activity/meal/transport
    - "detail": description of at least 20 words (be specific and useful)
    - "type": one of "transport" | "activity" | "meal" | "hotel" | "food" | "logistics"

RULE 4 — BUDGET ITEM REQUIRED FIELDS (MANDATORY):
  Every item in budget[] MUST include:
    - "status": either "booked" or "pending"
    - "category": exactly one of "accommodation" | "transport" | "food" | "activities" | "misc"
  Generate a MINIMUM of 8-10 budget items with realistic local prices.

RULE 5 — HOTEL REQUIRED FIELDS (MANDATORY):
  Every item in hotels[] MUST include:
    - "stars": integer from 1 to 5
    - "rating": decimal from 0.0 to 10.0 (based on real review scores)

RULE 6 — URGENT[] REAL BOOKABLE ITEMS ONLY (MANDATORY):
  urgent[] must ONLY contain items the user can actively book right now.
  Every urgent item MUST have a real, working URL (e.g. annefrank.org, louvre.fr, trenitalia.com).
  Do NOT include informational tips, suggestions, or "check X" reminders.

RULE 7 — TICKETS[] ALWAYS EMPTY (MANDATORY):
  tickets[] MUST always be an empty array [].
  Never fabricate tickets, PNRs, platform numbers, or passenger names.
  Tickets are only added by users after real confirmed bookings.

RULE 8 — MAPSTOPS EXCLUDES HOME CITY (MANDATORY):
  mapStops must ONLY contain actual destination stops.
  NEVER include the user's home city, origin city, or origin airport.

RULE 9 — MINIMUM 8-10 BUDGET ITEMS (MANDATORY):
  Generate at least 8 and ideally 10 budget items covering all cost categories.
  Use realistic local prices for the destination (not generic estimates).

RULE 10 — LOCAL TIPS PER CITY (MANDATORY):
  Every city visited must have 3-5 localTips on the day of arrival.
  Tips must be practical and specific (transport passes, booking advice, local customs, etc.).

════════════════════════════════════════════════════════════════
ADDITIONAL ROUTING & PLANNING RULES:
════════════════════════════════════════════════════════════════
- Route-first: design geography before hotels. No backtracking.
- Hotel within 10min walk of train station always
- Train-first: only fly if >4h overland OR <2h flight
- Max 2.5h daily transport (except dedicated travel days)
- 2-4 nights minimum per city
- No Gulf airport routing (Dubai, Doha, Abu Dhabi)
- Hotels must have real checkin/checkout dates
- Budget items must have realistic price estimates

════════════════════════════════════════════════════════════════
PERFECT OUTPUT EXAMPLE — MATCH THIS STRUCTURE EXACTLY:
════════════════════════════════════════════════════════════════

Example of ONE correctly structured day (your output must match this pattern for every day):
{
  "day": 1,
  "date": "2026-06-10",
  "title": "Arrival in Amsterdam",
  "subtitle": "Canal walks and first impressions",
  "emoji": "🚲",
  "heroSeed": "amsterdam-canals",
  "imageUrl": "",
  "timeline": [
    {
      "time": "10:30",
      "title": "Arrive at Amsterdam Centraal",
      "detail": "Your Thalys train pulls into Amsterdam Centraal station. Follow signs to the GVB tram stop just outside the main entrance for transport into the city centre.",
      "type": "transport",
      "mapQuery": "Amsterdam Centraal Station, Amsterdam, Netherlands"
    },
    {
      "time": "12:00",
      "title": "Check in to Hotel V Nesplein",
      "detail": "Drop your bags and freshen up at this boutique hotel in the heart of the Old Centre. The hotel is a 5-minute walk from Centraal station and has a cosy lobby bar.",
      "type": "hotel",
      "mapQuery": "Hotel V Nesplein, Amsterdam, Netherlands"
    },
    {
      "time": "13:30",
      "title": "Lunch at Brouwerij 't IJ",
      "detail": "Enjoy Dutch craft beer and a hearty broodje (sandwich) at this iconic brewery housed inside a 1725 windmill on the eastern edge of the city. Arrive early as it gets busy.",
      "type": "meal",
      "mapQuery": "Brouwerij 't IJ, Amsterdam, Netherlands",
      "stars": 4.5,
      "reviews": "3,812 reviews"
    },
    {
      "time": "15:30",
      "title": "Anne Frank House",
      "detail": "Tour the hidden annexe where Anne Frank wrote her famous diary during World War II. Pre-book your timed entry ticket online at annefrank.org — walk-in tickets are not available.",
      "type": "activity",
      "mapQuery": "Anne Frank House, Prinsengracht 263-267, Amsterdam"
    },
    {
      "time": "18:00",
      "title": "Jordaan Neighbourhood Walk",
      "detail": "Stroll the narrow streets and picturesque canals of the Jordaan district. Browse independent galleries, boutique shops, and stop for a stroopwafel at a street market stall.",
      "type": "activity",
      "mapQuery": "Jordaan, Amsterdam, Netherlands"
    },
    {
      "time": "20:00",
      "title": "Dinner at De Belhamel",
      "detail": "Dine at this art nouveau gem overlooking the Brouwersgracht canal. Order the Dutch-French fusion menu — the duck confit and seasonal vegetables are highly recommended by locals.",
      "type": "meal",
      "mapQuery": "Restaurant De Belhamel, Amsterdam, Netherlands",
      "stars": 4.7,
      "reviews": "1,540 reviews"
    }
  ],
  "highlights": ["Anne Frank House", "Jordaan golden hour", "Canal-side dinner"],
  "localTips": [
    "Buy a 24h or 48h GVB transit pass at Centraal station — cheaper than single tickets.",
    "Anne Frank House tickets sell out weeks ahead; book at annefrank.org as soon as your dates are confirmed.",
    "Rent a bike from MacBike near Centraal for €14/day — the fastest and most local way to get around.",
    "Most restaurants don't take reservations for parties under 4; arrive before 18:30 to avoid queues.",
    "The I Amsterdam card gives free entry to 70+ museums and unlimited transit — great value for 3+ days."
  ],
  "photos": []
}

Example of ONE correctly structured budget item:
{ "item": "Amsterdam Museum Pass (I Amsterdam Card)", "amount": "€75", "note": "Covers 70+ museums and public transport for 48h", "status": "pending", "category": "activities" }

Example of ONE correctly structured hotel item:
{
  "city": "Amsterdam",
  "name": "Hotel V Nesplein",
  "stars": 4,
  "rating": 8.7,
  "price": "€160/night",
  "note": "5-min walk from Centraal station, boutique design hotel",
  "checkin": "2026-06-10",
  "checkout": "2026-06-13",
  "nights": 3,
  "bookUrl": "https://booking.com/hotel/nl/v-nesplein.html",
  "address": "Nes 49, 1012 KD Amsterdam, Netherlands"
}

════════════════════════════════════════════════════════════════
OUTPUT FORMAT: Return ONLY the JSON object, no markdown, no explanation.
════════════════════════════════════════════════════════════════`;

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

HARD RULES FOR THIS DAY TIMELINE (MANDATORY — NO EXCEPTIONS):
- MINIMUM 5 timeline items. Aim for 6-10. Fewer than 5 is a failure.
- Every item MUST have: "time" (HH:MM), "title", "detail" (minimum 20 words), "type"
- "detail" must be specific and informative — at least 20 words per item. Vague one-liners are not acceptable.
- "type" must be one of: "transport" | "activity" | "meal" | "hotel" | "food" | "logistics"
- Times must be in 24h HH:MM format (e.g. "09:00", "14:30")

Return ONLY a JSON object in this exact format:
{
  "day": ${dayNum},
  "date": "YYYY-MM-DD",
  "timeline": [
    {
      "time": "09:00",
      "title": "Activity name",
      "detail": "Detailed description of what to do and see here, with useful practical information for the traveller visiting this location.",
      "type": "activity",
      "mapQuery": "Specific place name, city, country",
      "stars": 4.5,
      "reviews": "1,234 reviews"
    }
  ]
}

Where each timeline item has:
- time: 24h format (e.g. "09:00") — REQUIRED
- title: short name of the activity/meal/transport — REQUIRED
- detail: minimum 20-word description with practical traveller advice — REQUIRED
- type: one of "transport", "activity", "meal", "hotel", "food", "logistics" — REQUIRED
- mapQuery: specific searchable location string (optional but recommended)
- stars: optional rating (number)
- reviews: optional review count string

Aim for 6-10 timeline items covering the full day. Return ONLY the JSON object, no markdown.`;
}
