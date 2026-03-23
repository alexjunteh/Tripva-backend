import { z } from 'zod';

// ─── Lenient sub-schemas — most fields optional so Claude passes first try ──

const timelineItemSchema = z.object({
  time:      z.string().default(''),
  title:     z.string(),
  detail:    z.string().default(''),
  type:      z.enum(['transport', 'activity', 'meal', 'hotel', 'food', 'logistics']).default('activity'),
  mapQuery:  z.string().default(''),
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

const mapStopSchema = z.object({
  name:   z.string(),
  lat:    z.number(),
  lng:    z.number(),
  emoji:  z.string().default('📍'),
  type:   z.enum(['stay', 'daytrip']).default('stay'),
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
