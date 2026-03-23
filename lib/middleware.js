const ALLOWED_ORIGINS = [
  'https://futuriztaos.github.io',
];

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const rateLimitStore = new Map();

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow any localhost:* (dev)
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

/**
 * Apply CORS headers. Returns true if request was OPTIONS (already handled).
 */
export function applyCors(req, res) {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Direct curl/server-side calls — allow
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return true;
  }
  return false;
}

/**
 * Check rate limit for an IP. Returns { allowed, remaining, resetAt }.
 */
export function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }

  entry.count++;
  rateLimitStore.set(ip, entry);

  // Periodic cleanup of expired entries
  if (rateLimitStore.size > 5000) {
    for (const [k, v] of rateLimitStore) {
      if (now > v.resetAt) rateLimitStore.delete(k);
    }
  }

  return {
    allowed: entry.count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - entry.count),
    resetAt: new Date(entry.resetAt).toISOString(),
  };
}

/**
 * Extract client IP from request headers (Vercel sets x-forwarded-for).
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
