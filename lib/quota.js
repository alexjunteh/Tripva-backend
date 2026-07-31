import { Redis } from '@upstash/redis';

const DAILY_LIMITS = {
  anonymous: 3,
  free: 10,
  paid: Infinity,
};

const DAY_SECONDS = 86400;

const useRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
let redis;
if (useRedis) redis = Redis.fromEnv();

const memoryStore = new Map();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function memoryCheck(identifier, limit) {
  const day = todayKey();
  const key = `${day}:${identifier}`;

  // Evict stale days
  if (memoryStore.size > 10000) {
    for (const [k] of memoryStore) {
      if (!k.startsWith(day)) memoryStore.delete(k);
    }
  }

  const current = memoryStore.get(key) || 0;
  if (current >= limit) {
    return { allowed: false, used: current, limit, remaining: 0 };
  }

  memoryStore.set(key, current + 1);
  return { allowed: true, used: current + 1, limit, remaining: limit - current - 1 };
}

async function redisCheck(identifier, limit) {
  const day = todayKey();
  const key = `quota:daily:${day}:${identifier}`;
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, DAY_SECONDS);

  if (current > limit) {
    return { allowed: false, used: current, limit, remaining: 0 };
  }
  return { allowed: true, used: current, limit, remaining: limit - current };
}

export function getDailyLimit(tier) {
  return DAILY_LIMITS[tier] || DAILY_LIMITS.anonymous;
}

export async function checkDailyQuota(identifier, tier = 'anonymous') {
  const limit = getDailyLimit(tier);
  if (limit === Infinity) return { allowed: true, used: 0, limit: -1, remaining: -1 };

  if (useRedis) return redisCheck(identifier, limit);
  return memoryCheck(identifier, limit);
}
