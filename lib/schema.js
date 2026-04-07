import { z } from 'zod';

// ─── Lenient sub-schemas — most fields optional so Claude passes first try ──

const timelineItemSchema = z.object({
  time:      z.string().default(''),
  title:     z.string(),
  detail:    z.string().default(''),
  type:      z.enum(['transport', 'activity', 'meal', 'hotel', 'food', 'logistics', 'photospot']).default('activity'),
  mapQuery:  z.string().default(''),
  photoKey:  z.string().optional(),
  tip:       z.string().optional(),
  lat:       z.number().optional(),
  lng:       z.number().optional(),
  mapUrl:    z.string().optional(),
  platform:  z.string().optional(),
  stars:     z.number().optional(),
  reviews:   z.string().optional(),
});

const daySchema = z.object({
  day:       z.number().int().positive(),
  title:     z.string(),
  subtitle:  z.string().default(''),
  emoji:     z.string().default('📅'),
  heroSeed:  z.string().default(''),
  heroKey:   z.string().optional(),
  imageUrl:  z.string().default(''),
  timeline:  z.array(timelineItemSchema).default([]),
  highlights:z.array(z.string()).default([]),
  localTips: z.array(z.string()).default([]),
  photos:    z.array(z.unknown()).default([]),
});

const hotelSchema = z.object({
  city:     z.string(),
  name:     z.string(),
  price:    z.string().default(''),
  note:     z.string().default(''),
  checkin:  z.string().default(''),
  checkout: z.string().default(''),
  nights:   z.number().default(1),
  bookUrl:  z.string().default(''),
  address:  z.string().default(''),
  tier:     z.string().optional(),
}).passthrough();

const budgetItemSchema = z.object({
  item:   z.string().optional(),
  label:  z.string().optional(),
  amount: z.string(),
  note:   z.string().default(''),
  icon:   z.string().optional(),
  pct:    z.number().optional(),
}).passthrough();

const urgentItemSchema = z.object({
  label:    z.string(),
  note:     z.string().default(''),
  url:      z.string().default(''),
  priority: z.number().default(1),
}).passthrough();

const ticketLegSchema = z.object({
  train:        z.string().default(''),
  from:         z.string().default(''),
  to:           z.string().default(''),
  fromTime:     z.string().default(''),
  toTime:       z.string().default(''),
  fromPlatform: z.string().default(''),
  pnr:          z.string().default(''),
}).passthrough();

const ticketPassengerSchema = z.object({
  name:     z.string(),
  images:   z.array(z.unknown()).default([]),
  pdfUrl:   z.string().default(''),
  pdfLabel: z.string().default(''),
}).passthrough();

const ticketSchema = z.object({
  name:       z.string(),
  date:       z.string().default(''),
  legs:       z.array(ticketLegSchema).default([]),
  passengers: z.array(ticketPassengerSchema).default([]),
}).passthrough();

const normalizeMapStopType = (value) => {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'daytrip' || v === 'stay') return v;
  if (v === 'visit' || v === 'day_trip' || v === 'day-trip') return 'daytrip';
  return 'stay';
};

const mapStopSchema = z.object({
  name:   z.string(),
  lat:    z.number(),
  lng:    z.number(),
  emoji:  z.string().default('📍'),
  type:   z.string().optional().transform(normalizeMapStopType),
  day:    z.number().default(1),
  nights: z.number().default(1),
}).passthrough();

const mapRoutePointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const rawPlanSchema = z.object({
  trip: z.object({
    id:        z.string().default('trip-001'),
    name:      z.string(),
    startDate: z.string().default(''),
    endDate:   z.string().default(''),
    timezone:  z.string().default('UTC'),
    currency:  z.string().default('USD'),
  }).passthrough(),
  days:      z.array(daySchema).min(1),
  hotels:    z.array(hotelSchema).default([]),
  budget:    z.array(budgetItemSchema).default([]),
  urgent:    z.array(urgentItemSchema).default([]),
  tickets:   z.array(ticketSchema).default([]),
  mapStops:  z.array(mapStopSchema).default([]),
  mapRoute:  z.array(mapRoutePointSchema).default([]),
}).passthrough();

export const tripStateSchema = z.object({
  normalizedVersion: z.number().default(2),
  planVersion:       z.string().default(new Date().toISOString()),
  rawPlan:           rawPlanSchema,
});

export const planInputSchema = z.object({
  destination: z.string().min(1, 'destination is required'),
  startDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
  travelers:   z.number().int().positive('travelers must be a positive integer'),
  budget:      z.string().min(1, 'budget is required'),
  style:       z.string().min(1, 'style is required'),
  interests:   z.array(z.string()).min(1, 'at least one interest is required'),
  homeCity:    z.string().min(1, 'homeCity is required'),
});

export const patchInputSchema = z.object({
  state:       tripStateSchema,
  instruction: z.string().min(1, 'instruction is required'),
});

export function formatZodError(error) {
  return error.issues
    .slice(0, 8)
    .map(i => `${i.path.join('.') || 'root'}: ${i.message}`)
    .join('; ');
}

// ─── API Normalization ─────────────────────────────────────────────────────────
// Canonicalizes AI output into a consistent shape before saving or sending to
// the frontend.  Idempotent — safe to call multiple times on the same state.

/**
 * Compute the date string for a given day number relative to tripStartDate.
 * @param {string} tripStartDate - YYYY-MM-DD
 * @param {number} dayNum - 1-based day index
 * @returns {string} YYYY-MM-DD
 */
function computeDayDate(tripStartDate, dayNum) {
  const d = new Date(tripStartDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (dayNum - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Normalize a complete tripState into canonical form.
 *
 * Guarantees:
 *  - normalizedVersion = 2, planVersion = ISO timestamp
 *  - Every day has a `date` field computed from trip.startDate
 *  - Budget items have both `item` and `label`, plus `status` and `category` defaults
 *  - Hotels have numeric `stars` (default 3) and `rating` (default 7.0)
 *  - Timeline items have `type` defaulted to "activity"
 *  - mapStop types are canonical ("stay" | "daytrip")
 *
 * @param {object} state - Raw or partially-normalized tripState
 * @returns {object} Fully normalized tripState
 */
export function normalizeTripState(state) {
  if (!state || !state.rawPlan) return state;

  const raw = state.rawPlan;
  const tripStart = raw.trip?.startDate || '';

  // ── Normalize days ───────────────────────────────────────────────────────
  const days = (raw.days || []).map(day => {
    // Compute date from trip.startDate + day number
    const date = (tripStart && day.day)
      ? computeDayDate(tripStart, day.day)
      : (day.date || '');

    // Normalize timeline items
    const timeline = (day.timeline || []).map(item => ({
      ...item,
      time: item.time || '',
      title: item.title || '',
      detail: item.detail || '',
      type: item.type || 'activity',
    }));

    return {
      ...day,
      date,
      emoji: day.emoji || '📅',
      heroSeed: day.heroSeed || '',
      imageUrl: day.imageUrl || '',
      timeline,
      highlights: day.highlights || [],
      localTips: day.localTips || [],
      photos: day.photos || [],
    };
  });

  // ── Normalize budget items ───────────────────────────────────────────────
  const budget = (raw.budget || []).map(b => ({
    ...b,
    item: b.item || b.label || '',
    label: b.label || b.item || '',
    amount: b.amount || '0',
    status: b.status || 'pending',
    category: b.category || 'misc',
    note: b.note || '',
  }));

  // ── Normalize hotels ─────────────────────────────────────────────────────
  const hotels = (raw.hotels || []).map(h => ({
    ...h,
    stars: typeof h.stars === 'number' ? h.stars : 3,
    rating: typeof h.rating === 'number' ? h.rating : 7.0,
    nights: typeof h.nights === 'number' ? h.nights : 1,
    checkin: h.checkin || '',
    checkout: h.checkout || '',
    bookUrl: h.bookUrl || '',
    address: h.address || '',
  }));

  // ── Normalize mapStops ───────────────────────────────────────────────────
  const mapStops = (raw.mapStops || []).map(s => ({
    ...s,
    type: normalizeMapStopType(s.type),
  }));

  return {
    normalizedVersion: 2,
    planVersion: state.planVersion || new Date().toISOString(),
    rawPlan: {
      ...raw,
      trip: {
        id: raw.trip?.id || 'trip-001',
        ...raw.trip,
        startDate: raw.trip?.startDate || '',
        endDate: raw.trip?.endDate || '',
        timezone: raw.trip?.timezone || 'UTC',
        currency: raw.trip?.currency || 'USD',
      },
      days,
      hotels,
      budget,
      urgent: raw.urgent || [],
      tickets: raw.tickets || [],
      mapStops,
      mapRoute: raw.mapRoute || [],
    },
  };
}
