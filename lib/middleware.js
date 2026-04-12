const ALLOWED_ORIGINS = [
  'https://tripva.app',
  'https://www.tripva.app',
  'https://alexjunteh.github.io',        // GitHub Pages fallback
  'https://tripva-frontend.vercel.app', // Vercel preview
];

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const rateLimitStore = new Map();

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Vercel preview deployments
  if (/^https:\/\/tripva-frontend-[a-z0-9]+-alexs-projects/.test(origin)) return true;
  // Allow localhost dev
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

export function applyCors(req, res) {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    // Direct server-to-server calls
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // Unknown origins get no CORS header = blocked by browser

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return true;
  }
  return false;
}

export function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  entry.count++;
  rateLimitStore.set(ip, entry);
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

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
