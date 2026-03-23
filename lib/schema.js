import { z } from 'zod';

// ─── Sub-schemas ────────────────────────────────────────────────────────────

const timelineItemSchema = z.object({
  time: z.string(),
  title: z.string(),
  detail: z.string(),
  type: z.enum(['transport', 'activity', 'meal', 'hotel']),
  mapQuery: z.string(),
  platform: z.string().optional(),
  stars: z.number().optional(),
  reviews: z.string().optional(),
});

const daySchema = z.object({
  day: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string(),
  emoji: z.string(),
  heroSeed: z.string(),
  imageUrl: z.string(),
  timeline: z.array(timelineItemSchema).min(1),
  highlights: z.array(z.string()),
  localTips: z.array(z.string()),
  photos: z.array(z.unknown()),
});

const hotelSchema = z.object({
  city: z.string(),
  name: z.string(),
  price: z.string(),
  note: z.string(),
  checkin: z.string(),
  checkout: z.string(),
  nights: z.number(),
  bookUrl: z.string(),
  address: z.string(),
});

const budgetItemSchema = z.object({
  item: z.string(),
  amount: z.string(),
  note: z.string(),
});

const urgentItemSchema = z.object({
  label: z.string(),
  note: z.string(),
  url: z.string(),
  priority: z.number(),
});

const ticketLegSchema = z.object({
  train: z.string(),
  from: z.string(),
  to: z.string(),
  fromTime: z.string(),
  toTime: z.string(),
  fromPlatform: z.string(),
  pnr: z.string(),
});

const ticketPassengerSchema = z.object({
  name: z.string(),
  images: z.array(z.unknown()),
  pdfUrl: z.string(),
  pdfLabel: z.string(),
});

const ticketSchema = z.object({
  name: z.string(),
  date: z.string(),
  legs: z.array(ticketLegSchema),
  passengers: z.array(ticketPassengerSchema),
});

const mapStopSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  emoji: z.string(),
  type: z.enum(['stay', 'daytrip']),
  day: z.number(),
  nights: z.number(),
});

const mapRoutePointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const rawPlanSchema = z.object({
  trip: z.object({
    id: z.string(),
    name: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    timezone: z.string(),
    currency: z.string(),
  }),
  days: z.array(daySchema).min(1),
  hotels: z.array(hotelSchema),
  budget: z.array(budgetItemSchema),
  urgent: z.array(urgentItemSchema),
  tickets: z.array(ticketSchema),
  mapStops: z.array(mapStopSchema),
  mapRoute: z.array(mapRoutePointSchema),
});

// ─── Exported schemas ────────────────────────────────────────────────────────

export const tripStateSchema = z.object({
  normalizedVersion: z.literal(2),
  planVersion: z.string(),
  rawPlan: rawPlanSchema,
});

export const planInputSchema = z.object({
  destination: z.string().min(1, 'destination is required'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
  travelers: z.number().int().positive('travelers must be a positive integer'),
  budget: z.string().min(1, 'budget is required'),
  style: z.string().min(1, 'style is required'),
  interests: z.array(z.string()).min(1, 'at least one interest is required'),
  homeCity: z.string().min(1, 'homeCity is required'),
});

export const patchInputSchema = z.object({
  state: tripStateSchema,
  instruction: z.string().min(1, 'instruction is required'),
});

/**
 * Format Zod validation errors into a readable string.
 */
export function formatZodError(error) {
  return error.issues
    .slice(0, 8)
    .map(i => `${i.path.join('.') || 'root'}: ${i.message}`)
    .join('; ');
}
