export const SYSTEM_PROMPT = `You are an expert travel planning AI. Output ONLY valid JSON matching the schema provided.

HARD RULES:
- Route-first: design geography before hotels. No backtracking.
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
      "price": "€120/night",
      "note": "3-min walk from Termini",
      "checkin": "YYYY-MM-DD",
      "checkout": "YYYY-MM-DD",
      "nights": 3,
      "bookUrl": "https://booking.com",
      "address": "Via Nazionale 1, Rome"
    }],
    "budget": [
      { "item": "Flights", "amount": "RM 2,400", "note": "Return KUL-FCO via MH" },
      { "item": "Hotels (12 nights)", "amount": "RM 6,000", "note": "Avg RM 500/night" }
    ],
    "urgent": [
      { "label": "Book Cinque Terre train", "note": "Sells out weeks ahead", "url": "https://trenitalia.com", "priority": 1 }
    ],
    "tickets": [{
      "name": "Rome → Florence",
      "date": "Mar 21, 2026",
      "legs": [{ "train": "FR 9519", "from": "Roma Termini", "to": "Firenze S.M.N.", "fromTime": "09:00", "toTime": "10:37", "fromPlatform": "5", "pnr": "" }],
      "passengers": [{ "name": "Traveler 1", "images": [], "pdfUrl": "", "pdfLabel": "Ticket PDF" }]
    }],
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
