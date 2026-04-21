
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

// ── Archetype-aware prompt tuning ─────────────────────────────────────────────
// Injects traveler-lifestyle-specific guidance into the system prompt so a
// family-with-kids trip doesn't read like a couple's honeymoon. Archetype is
// optional — if absent, no tuning is added (backward-compatible).
export function getArchetypeInstruction(input) {
  const a = input?.archetype;
  if (!a) return '';

  const travelers = input.travelers || 2;

  switch (a) {
    case 'solo': {
      const accom = input.accommodation_type || 'boutique';
      const pace  = input.pace || 'balanced';
      const safety = input.safety_priority ?? 7;
      return `TRAVELER ARCHETYPE: SOLO EXPLORER.
- Plan for ONE traveler. Never suggest couple/family activities.
- Accommodation preference: ${accom}. Pick hotels/hostels matching this tier — if ${accom === 'hostel' ? 'hostel: favor social hostels with common rooms' : 'hotel/boutique: include at least one social-lobby or cafe option'}.
- Pace: ${pace}. ${pace === 'packed' ? 'Dense days with 8-10 activities.' : pace === 'relaxed' ? 'Lighter days with 5-6 activities and rest windows.' : 'Balanced days with 6-8 activities.'}
- Safety priority: ${safety}/10. ${safety >= 8 ? 'Each day\'s localTips MUST include at least 1 safety-specific tip (safe transport at night, neighborhoods to avoid after dark, SIM/eSIM for phone-home). Note safe taxi/transport options explicitly. No solo-night activities in unfamiliar areas.' : safety >= 6 ? 'Include at least 1 safety-aware localTip per city (safe transport, neighborhoods to be aware of, SOS numbers).' : 'Adventurous traveler, less hand-holding — but still note any outright danger zones.'}
- REQUIRE at least 2 social-opportunity stops per day: group tours, coworking cafes, popular bars with community tables, food-tour groups, language-exchange meetups. Name them specifically.
- Cafes: include at least 1 named laptop-friendly cafe per city (solo travelers recharge mid-day).
- Skip activities that assume a companion (couple-only dining, romantic cruises, private-dinner-for-two).`;
    }
    case 'couple': {
      const occasion = input.occasion || 'weekend';
      const accom = input.accommodation_type || 'boutique';
      const dining = input.dining_priority ?? 8;
      return `TRAVELER ARCHETYPE: COUPLE / ROMANCE.
- Plan for TWO adults traveling together. Single room / one-bed stays only.
- Occasion: ${occasion}. ${occasion === 'honeymoon' ? 'EVERY day MUST include at least 1 honeymoon-grade moment: champagne views, couples spa, candle-lit dinner, private tour, suite upgrade. Name specifics.' : occasion === 'anniversary' ? 'EVERY day MUST include at least 1 anniversary-worthy standout: a named memorable restaurant, a private experience, a photograph-worthy moment. Call it out explicitly.' : occasion === 'just-us' ? 'Quiet, intimate, away-from-the-crowds spots. Avoid famous-tourist-trap restaurants.' : 'Weekend fun with one or two named wow moments.'}
- Accommodation: ${accom}. ${accom === 'resort' ? 'Resort properties with couple amenities (spa, romantic dinner options).' : 'Romantic hotels, boutique stays, couple-friendly properties.'}
- Dining priority: ${dining}/10. ${dining >= 8 ? 'Restaurant-forward itinerary. Include Michelin-recommended or top-reviewed dinner spots by name. Every dinner should be a notable named venue — no generic "dinner at hotel".' : 'Dining matters but not the focus.'}
- Weight evenings heavily: named sunset viewpoints, named rooftop bars, late dinners at specific restaurants.
- At least 1 spa/wellness or couple-experience activity somewhere in the itinerary (even a 30-min stop).
- SKIP kid-friendly content, family activities, solo-oriented experiences (e.g., hostel bars).`;
    }
    case 'family': {
      const ages = Array.isArray(input.child_ages) ? input.child_ages : [];
      const agesStr = ages.length ? `ages ${ages.join(', ')}` : 'kids';
      const stroller = input.stroller_needed ? 'YES' : 'no';
      const kidPace = input.kid_pace !== false;
      const diet = input.dietary_notes ? ` Dietary notes: "${input.dietary_notes}".` : '';
      return `TRAVELER ARCHETYPE: FAMILY WITH KIDS.
- Party size: ${travelers} (${ages.length} child${ages.length === 1 ? '' : 'ren'} ${agesStr}, plus adults).
- Stroller needed: ${stroller}. ${input.stroller_needed ? 'EVERY activity\'s "detail" MUST explicitly state stroller-accessibility (e.g. "fully stroller-accessible, elevator at north entrance"). Each day MUST have at least 1 mention of the word "stroller" in either localTips or timeline detail. Flag cobblestone/steep sections explicitly.' : 'Walkability still matters; call out steep/cobblestone streets.'}
- Pacing: ${kidPace ? 'KID-PACE. Shorter days (7-8 timeline items max). Build in a nap/rest window 13:00-15:00 each day. End days by 20:00.' : 'Standard pacing.'}
- Kid-friendly activities: REQUIRE at least 1 playground or park stop in the itinerary total. Prefer interactive museums over static galleries. Include named kid-friendly beaches, petting zoos, trains kids will love.
- Meals: include kid-friendly options on every meal. Early dinner (17:30-19:00) not late dinner. Note high chairs and kids menus in the detail field.
- SKIP nightlife, late-night, wine tastings without kid facility, adults-only venues, physically demanding treks.
- Proactively note bathroom availability (important with kids), playground proximity, and snack-break opportunities in EACH day's localTips (min 1 family-specific tip per day).${diet}
- EVERY budget item must explicitly say "for ${travelers} people" in its note field. Budget items quoted per-person must be multiplied (e.g., $20pp × 4 = $80 total).`;
    }
    case 'friends': {
      const shared = input.shared_accommodation !== false;
      const decision = input.decision_style || 'democratic';
      const energy = input.group_energy || 'balanced';
      return `TRAVELER ARCHETYPE: FRIEND GROUP.
- Party size: ${travelers} adults traveling together.
- Accommodation: ${shared ? `SHARED ACCOMMODATION REQUIRED. hotels[] entries MUST be a shared rental (Airbnb / villa / multi-bedroom apartment / shared flat) — NOT a hotel. In hotels[].name, include "(Airbnb)" or "(Villa)" or similar tag. bedrooms note REQUIRED. Price quoted as total-per-night (whole property), not per-room. Example: {"name":"Casa Vista (Villa — 4 bedrooms, via Airbnb)","price":"€480/night (whole villa)","note":"sleeps ${travelers}, shared kitchen"}.` : 'Multiple hotel rooms.'} Each budget accommodation line must specify the total for the group.
- Decision style: ${decision}. ${decision === 'democratic' ? 'Every activity should suit 3+ people at once. Avoid things that only work for 2 (couples massage, etc.).' : 'Leader-planned — single clear itinerary.'}
- Group energy: ${energy}. ${energy === 'party' ? 'Nightlife-forward. Include at least 1 named bar or club per night. Late-night food stops mandatory. Daytime can be lighter.' : energy === 'chill' ? 'Relaxed. Cafes, viewpoints, long meals. No heavy late nights.' : 'Mix of active days and social nights.'}
- Dining: group-friendly tables (6+). Include shared-plate / tasting menu options. Late dinners OK.
- Call out split-expense notes on EVERY budget line: format "total €X (~€Y/person split ${travelers} ways)".
- Include activities that photograph well as a group (mention group-photo opportunities explicitly).`;
    }
    case 'adventure': {
      const pace = input.pace || 'balanced';
      const acts = Array.isArray(input.activity_types) && input.activity_types.length
        ? input.activity_types.join(', ')
        : 'hiking, general outdoors';
      const fitness = input.fitness_level || 'intermediate';
      const gear = Array.isArray(input.gear_owned) && input.gear_owned.length
        ? input.gear_owned.join(', ')
        : 'none stated';
      return `TRAVELER ARCHETYPE: ADVENTURE / OUTDOOR.
- Focus activities: ${acts}. Weight daily plans toward these specifically — don't substitute unrelated outdoor activities.
- Fitness level: ${fitness}. ${fitness === 'beginner' ? 'Short trails (<5km), gentle elevation, well-marked paths, guided options preferred. Explicitly avoid technical or high-exposure routes.' : fitness === 'advanced' ? 'Multi-day routes, technical terrain, significant elevation gain (1000m+) all fair game. Can recommend Class 3+ scrambles and exposed ridges.' : 'Moderate difficulty — half-day hikes up to 12km, 500-800m gain, non-technical.'}
- Gear already owned: ${gear}. ${Array.isArray(input.gear_owned) && input.gear_owned.length ? `REQUIRE at least 1 gear-rental entry in urgent[] or localTips naming a specific rental shop with daily rate for gear NOT in [${gear}] that the chosen activities need. Skip rental notes for gear already owned.` : 'Include gear rental recommendations (named shops + daily rates) for every activity type.'}
- Pace: ${pace}. ${pace === 'intense' ? 'Multiple activities per day, early starts (06:00-07:00), physical exertion expected. Each day MUST reach 8+ timeline items.' : pace === 'relaxed' ? 'Main activity per day, buffer rest.' : 'Main activity + secondary every day.'}
- Weather-sensitive planning: each day's localTips MUST include at least 1 weather/conditions tip (trail conditions, best season, rainy-day fallback).
- Permits: if activities require permits/advance booking, add to urgent[] with the booking URL and deadline (e.g., "Book W-circuit trek 2mo ahead — patagonia.cl").
- Food: hearty, high-calorie options for activity days. Note named refuel spots (mid-trail huts, town bakeries with packed-lunch).
- Transport: emphasize 4WD rentals (with daily rate), shuttle services to trailheads (with frequency/price), public transit from town to trail where relevant.
- Photo-spots: REQUIRE at least 1 named scenic viewpoint or wildlife-observation photospot per activity day.
- At least 1 timeline item per day MUST explicitly reference the fitness level or gear requirements (e.g., "requires waterproof layer" or "advanced scrambling section — not for beginners").`;
    }
    case 'nomad': {
      const wifi = input.wifi_priority !== false;
      const hours = input.work_hours_per_week;
      const wifiReq = input.wifi_requirement || (wifi ? 'fast' : 'basic');
      const cowork = input.cowork_preferred !== false;
      const dailyWork = hours != null
        ? Math.round(hours / 5)
        : 5;
      return `TRAVELER ARCHETYPE: DIGITAL NOMAD / SLOW TRAVEL.
- Single base city (minimum 2 nights per city, target 5-7+). Avoid fast-paced city-hopping.
- Work rhythm: ~${dailyWork}h focused work per weekday (${hours != null ? hours : 'unspecified'} h/week). Split daily plans between work-block + explore-block.
- Wifi requirement: ${wifiReq.toUpperCase()}. ${wifiReq === 'business' ? 'Accommodation MUST specify measured wifi speeds ≥100Mbps. Call out any accommodation without wired ethernet. Coworking recs must be business-grade (dedicated desks, backup connection).' : wifiReq === 'fast' ? 'Accommodation should note wifi speed (aim ≥50Mbps) and reliability. Video-call-ready cafes/coworking preferred.' : 'Standard wifi assumed; no extensive audit needed.'}
- Work environment: ${cowork ? 'COWORKING-FIRST. Every base city MUST include 2-3 specific coworking spaces with: name, day-pass rate, monthly rate, hours, amenities. Cafes are secondary.' : 'CAFE-FIRST. Include 3-5 laptop-friendly cafes per base city with: name, wifi quality, power outlet availability, time-limit policies, price of a flat white.'}
- Grocery + laundry: note nearest supermarkets (chain name + walk time), self-laundry options, meal-prep-friendly accommodations.
- Weekly rhythm: NOT hour-by-hour every day. Mix "work days" (lighter — cafe/cowork AM, explore PM) with "explore days" (sightseeing-heavy, no work).
- Community: local expat / nomad meetups, language exchanges, community events on specific weekdays.
- Monthly cost lens: accommodation priced per-night AND per-month where relevant. Include rough "nomad cost of living" estimate: coffee, groceries, cowork, transport per month.`;
    }
  }
  return '';
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

RULE 4 — BUDGET IS THE USER'S ENVELOPE — ALLOCATE TO IT (MANDATORY):
  The user gave you a TOTAL budget. Your budget[] array must:
    (a) Sum approximately to that total (±5%), NEVER exceed it. Scale hotel
        tier, activity picks, dining cost down to fit. If the budget is
        clearly too low for the trip, pick cheaper hotels and fewer paid
        activities — don't silently blow the total.
    (b) Distribute across categories with realistic weights:
          accommodation 35-45% | transport 20-30% | food 15-20% |
          activities 10-15% | misc 3-5%. Adjust for trip length (short
          weekend = more activities%, long trip = more accommodation%).
    (c) Include a final "Total" item marked {item:"Total",status:"pending",
        category:"misc",amount:"<same currency as input budget>"} that
        equals the sum of the others — so the frontend can display
        utilization without adding up.
  Every item in budget[] MUST include:
    - "status": either "booked" or "pending"
    - "category": exactly one of "accommodation" | "transport" | "food" | "activities" | "misc"
    - "pct": integer 0-100 = this item's share of total budget
  Generate a MINIMUM of 8-10 budget items with realistic local prices.
  NEVER return an empty budget[]. Even for a shared/demo trip, estimate.

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


RULE 11 — PHOTOSPOTS (MANDATORY for visual destinations):
  Every day with a notable viewpoint, landmark or scenic spot MUST include at least 1 "photospot" timeline item.
  If the day has a main scenic landmark, also include a "heroKey" or "heroSeed" for the day image.
  A photospot item MUST include ALL of these fields:
    - "type": "photospot"
    - "title": starts with "📸 Photospot: " followed by location name
    - "detail": description of what you see and why it's special
    - "tip": specific photography tip (best angle, best time, what to shoot)
    - "lat": GPS latitude (decimal degrees)
    - "lng": GPS longitude (decimal degrees)
    - "mapQuery": searchable Google Maps string for this spot
  Add 1-3 photospots per day depending on how visual the destination is.

RULE 12 — PHOTOS ARRAY (MANDATORY):
  Every day MUST include a "photos" array. If you cannot source verified URLs, leave it as [] — never fabricate URLs.
  The array is populated separately by the system.

RULE 13 — STARS AND REVIEWS ON ACTIVITIES (MANDATORY):
  Every meal, food, and activity item SHOULD include:
    - "stars": decimal rating e.g. 4.5 (realistic estimate based on typical ratings)
    - "reviews": string e.g. "2,341 reviews"

RULE 14 — HEROSEQUENCE & IMAGE (MANDATORY):
  Every day MUST include a "heroSeed" field — a single lowercase keyword matching the main location.
  Use city/neighbourhood names (e.g. "shinjuku", "asakusa", "shibuya", "fuji", "kawagoe").
  Never use compound strings like "tokyo-arrival" — use the single most specific location keyword.
  
  Also include "imageUrl" — use a loremflickr URL for that day's main location/city.
  Use format: https://loremflickr.com/900/500/[city-or-landmark],travel (e.g. https://loremflickr.com/900/500/tokyo,travel)
  Use the city or landmark name as the keyword in the loremflickr URL.
  If no good image found, leave empty string (frontend will use fallback).

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
  "imageUrl": "https://loremflickr.com/900/500/paris,travel",
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
  "photos": []  // Always empty array — never fabricate photo URLs
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
  const archetypeBlock = getArchetypeInstruction(input);

  return `${langInstruction ? langInstruction + '\n\n' : ''}Plan a ${numDays}-day trip to ${destination} for ${travelers} traveler(s).

TRIP DETAILS:
- Home city: ${homeCity}
- Start date: ${startDate}
- End date: ${endDate} (${numDays} days total)
- Total budget: ${budget}
- Travel style: ${style}
- Interests: ${interests.join(', ')}

${archetypeBlock ? archetypeBlock + '\n\n' : ''}REQUIREMENTS:
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
  // Smart patch: only send affected days to reduce tokens
  const plan = state.rawPlan || state;
  const days = plan.days || [];
  const lowerInst = instruction.toLowerCase();
  
  // Detect which days are affected
  const affectedDayNums = [];
  
  // Check for "day N" references
  for (const d of days) {
    const dayNum = d.day;
    if (lowerInst.includes(`day ${dayNum}`) || lowerInst.includes(`day${dayNum}`)) {
      affectedDayNums.push(dayNum);
    }
  }
  
  // Check for keywords that imply specific days
  if (lowerInst.match(/\b(first day|arrival|arrive|landing|first morning|day 1)\b/)) {
    if (!affectedDayNums.includes(1)) affectedDayNums.push(1);
  }
  const lastDay = days.length;
  if (lowerInst.match(/\b(last day|departure|depart|fly back|fly home|flying back|final day|checkout|check.out)\b/)) {
    if (!affectedDayNums.includes(lastDay)) affectedDayNums.push(lastDay);
  }
  
  // Check for date references (e.g. "5th", "10th", "April 15")
  const dateMatch = lowerInst.match(/(\d{1,2})(?:st|nd|rd|th)/g);
  if (dateMatch && plan.trip?.startDate) {
    const tripStart = new Date(plan.trip.startDate);
    for (const dm of dateMatch) {
      const dateNum = parseInt(dm);
      // Try to match against trip dates
      for (const d of days) {
        if (d.date) {
          const dayDate = new Date(d.date);
          if (dayDate.getDate() === dateNum) {
            if (!affectedDayNums.includes(d.day)) affectedDayNums.push(d.day);
          }
        }
      }
    }
  }
  
  // If no specific days detected, send all days (general changes like hotels/budget)
  const isGeneralEdit = affectedDayNums.length === 0 || 
    lowerInst.match(/\b(hotel|budget|all days|every day|whole trip|entire trip)\b/);
  
  if (isGeneralEdit) {
    // For general edits, send compact plan (timelines shortened)
    const compactDays = days.map(d => ({
      ...d,
      timeline: (d.timeline || []).map(t => ({ time: t.time, title: t.title, type: t.type }))
    }));
    const compactPlan = { ...plan, days: compactDays };
    return `You are patching an existing trip plan.

INSTRUCTION: ${instruction}

IMPORTANT: If the instruction changes the trip start/end dates, you MUST:
1. Update trip.startDate and trip.endDate
2. Update EVERY day's "date" field sequentially from the new startDate
3. Keep all activities, titles, and content — only change dates

Return the COMPLETE updated plan JSON. Apply ONLY what was asked. Preserve everything else.

CURRENT PLAN (timelines abbreviated):
${JSON.stringify(compactPlan)}

Return ONLY valid JSON. No markdown.`;
  }
  
  // Targeted edit: send only affected days with full detail + trip metadata
  const affectedDays = days.filter(d => affectedDayNums.includes(d.day));
  const context = {
    trip: plan.trip,
    totalDays: days.length,
    allDayTitles: days.map(d => ({ day: d.day, date: d.date, title: d.title })),
    hotels: plan.hotels,
  };
  
  return `You are patching SPECIFIC DAYS of a trip plan.

INSTRUCTION: ${instruction}

CONTEXT (do not return this, just for reference):
${JSON.stringify(context)}

DAYS TO PATCH (return these updated):
${JSON.stringify(affectedDays)}

RULES:
- Return ONLY a JSON object: { "days": [...updated days...], "hotels": [...if changed...], "budget": [...if changed...] }
- Include ONLY the days you changed, with their COMPLETE timeline
- If hotels/budget need updating, include them. Otherwise omit.
- Apply ONLY what the instruction asks. Preserve all other fields in each day.

Return ONLY valid JSON. No markdown. No explanation.`;
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

  const archetypeBlock = getArchetypeInstruction(input);

  return `Plan a ${numDays}-day trip to ${destination} for ${travelers} traveler(s).

TRIP DETAILS:
- Home city: ${homeCity}
- Start date: ${startDate}
- End date: ${endDate} (${numDays} days total)
- Total budget: ${budget}
- Travel style: ${style}
- Interests: ${interests.join(', ')}

${archetypeBlock ? archetypeBlock + '\n\n' : ''}REQUIREMENTS:
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

  const archetypeBlock = getArchetypeInstruction(input);

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

${archetypeBlock ? archetypeBlock + '\n\n' : ''}Generate the complete hour-by-hour timeline for this day, from wake-up to sleep.
Include transport, meals, activities, and check-in/check-out as relevant.

CITY FOR THIS DAY: ${dayTitle}
Only include attractions, restaurants, and venues that are IN this city. Do NOT include attractions from other cities in the itinerary.

HARD RULES FOR THIS DAY TIMELINE (MANDATORY — NO EXCEPTIONS):
- ONLY generate items for the city named above.
- MINIMUM 7 timeline items. Aim for 8-10. Fewer than 7 is a failure.
- Every item MUST have: "time" (HH:MM), "title", "detail" (minimum 25 words), "type"
- "detail" must be VIVID and SPECIFIC — paint a sensory picture. Include what you SEE, what you DO, why it's UNFORGETTABLE. Minimum 25 words. Vague one-liners = FAIL.
- "type" must be one of: "transport" | "activity" | "meal" | "hotel" | "food" | "logistics" | "photospot"
- Times must be in 24h HH:MM format (e.g. "09:00", "14:30")
- INCLUDE AT LEAST 1 PHOTOSPOT per day for scenic/landmark destinations.
  A photospot item needs: type="photospot", title starting with "\ud83d\udcf8 Photospot:", tip with shooting advice, lat+lng GPS, mapQuery.
- Include stars (4.0-4.9 range) and reviews ("1,234 reviews") on all meal and activity items.
- Every "meal" item MUST include price range in detail (e.g. "$$$ per person for 2 courses + wine").
- Every "activity" item MUST include: recommended visit duration, best time to visit, and one insider tip.

Return ONLY a JSON object in this exact format:
{
  "day": ${dayNum},
  "date": "YYYY-MM-DD",
  "timeline": [
    {
      "time": "09:00",
      "title": "Activity name",
      "detail": "Detailed description with practical traveller information — minimum 20 words.",
      "type": "activity",
      "mapQuery": "Specific place name, city, country",
      "stars": 4.5,
      "reviews": "1,234 reviews"
    },
    {
      "time": "11:00",
      "title": "📸 Photospot: Iconic location name",
      "type": "photospot",
      "detail": "What you see from here and why it is special for photography.",
      "tip": "Best angle: stand at X. Shoot toward Y. Best light: morning/golden hour. Include Z in foreground.",
      "lat": 48.8584,
      "lng": 2.2945,
      "mapQuery": "Specific viewpoint name, city, country"
    }
  ]
}

Where each timeline item has:
- time, title, detail, type — REQUIRED for all items
- mapQuery — REQUIRED for all items
- stars + reviews — REQUIRED for activity/meal/food items
- tip + lat + lng — REQUIRED for photospot items

Aim for 8-10 items covering the full day with at least 1 photospot. Return ONLY the JSON, no markdown.`;
}
