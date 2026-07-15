import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ALLOWED_ORIGINS = [
  'https://tripva.app',
  'https://www.tripva.app',
  'https://tripva-frontend.pages.dev',   // Cloudflare Pages preview
  'https://alexjunteh.github.io',        // GitHub Pages fallback
  'https://tripva-frontend.vercel.app', // Vercel preview
];

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const COSTLY_RATE_LIMIT = 3;

const useRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

let generalLimiter;
let costlyLimiter;

if (useRedis) {
  const redis = Redis.fromEnv();
  generalLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(RATE_LIMIT, '60 s'),
    prefix: 'rl:general',
  });
  costlyLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(COSTLY_RATE_LIMIT, '60 s'),
    prefix: 'rl:costly',
  });
}

// In-memory fallback for local dev (no Redis)
const rateLimitStore = new Map();
const costlyRateLimitStore = new Map();

function memoryLimit(store, ip, limit) {
  const now = Date.now();
  let entry = store.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  entry.count++;
  store.set(ip, entry);
  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (now > v.resetAt) store.delete(k);
    }
  }
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: new Date(entry.resetAt).toISOString(),
  };
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/tripva-frontend-[a-z0-9]+-alexs-projects/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.tripva-frontend\.pages\.dev$/.test(origin)) return true;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

export function applyCors(req, res) {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return true;
  }
  return false;
}

export async function checkRateLimit(ip) {
  if (generalLimiter) {
    const { success, remaining, reset } = await generalLimiter.limit(ip);
    return { allowed: success, remaining, resetAt: new Date(reset).toISOString() };
  }
  return memoryLimit(rateLimitStore, ip, RATE_LIMIT);
}

export async function checkRateLimitCostly(ip) {
  if (costlyLimiter) {
    const { success, remaining, reset } = await costlyLimiter.limit(ip);
    return { allowed: success, remaining, resetAt: new Date(reset).toISOString() };
  }
  return memoryLimit(costlyRateLimitStore, ip, COSTLY_RATE_LIMIT);
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
