import { Redis } from '@upstash/redis';
import { log } from './logger';
import type { ScorePayload } from './types';

// ─── TTL computation (pure) ──────────────────────────────────────────────────

const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;
const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

export function computeKvTtl(
  movieYear: string | undefined,
  now: Date = new Date(),
): number | null {
  if (!movieYear) return null;
  const year = parseInt(movieYear, 10);
  if (isNaN(year)) return null;

  const age = now.getFullYear() - year;
  if (age < 2) return null;
  if (age <= 10) return SEVEN_DAYS_SEC;
  return THIRTY_DAYS_SEC;
}

// ─── Redis client (lazy singleton) ───────────────────────────────────────────

let redisClient: Redis | null | undefined; // undefined = not initialized

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  // Support both Vercel-provisioned (KV_REST_API_*) and native Upstash (UPSTASH_REDIS_REST_*) names
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    log.info('kv_disabled', { reason: 'Missing Redis env vars' });
    redisClient = null;
    return null;
  }

  try {
    redisClient = new Redis({ url, token });
    log.info('kv_enabled');
    return redisClient;
  } catch (err) {
    log.warn('kv_init_failed', { error: (err as Error).message });
    redisClient = null;
    return null;
  }
}

// ─── Public API (gracefully degrading) ───────────────────────────────────────

// Bump when ScorePayload shape changes to auto-invalidate stale cache entries
const KV_SCHEMA_VERSION = 1;

type CachedPayload = ScorePayload & { _v: number };

function kvKey(imdbId: string): string {
  return `score:${imdbId}`;
}

export async function kvGet(imdbId: string): Promise<ScorePayload | null> {
  try {
    const client = getRedisClient();
    if (!client) return null;
    const data = await client.get<CachedPayload>(kvKey(imdbId));
    if (data && data._v === KV_SCHEMA_VERSION) {
      log.info('kv_hit', { imdbId });
      return data;
    }
    return null;
  } catch (err) {
    log.warn('kv_get_failed', { imdbId, error: (err as Error).message });
    return null;
  }
}

export async function kvSet(
  imdbId: string,
  payload: ScorePayload,
  movieYear: string | undefined,
): Promise<void> {
  try {
    const ttl = computeKvTtl(movieYear);
    if (ttl === null) return;
    const client = getRedisClient();
    if (!client) return;
    const cached: CachedPayload = { ...payload, _v: KV_SCHEMA_VERSION };
    await client.set(kvKey(imdbId), cached, { ex: ttl });
    log.info('kv_set', { imdbId, ttlSec: ttl });
  } catch (err) {
    log.warn('kv_set_failed', { imdbId, error: (err as Error).message });
  }
}

export function _resetKvClient(): void {
  redisClient = undefined;
}
