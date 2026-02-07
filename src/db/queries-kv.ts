import { Redis } from "@upstash/redis";
import { log } from "@/lib/logger";
import type { TopMovie } from "./queries";

const TOP_KV_TTL_SEC = 60 * 60; // 1 hour

// ─── Redis client (reuses the same lazy singleton pattern) ───────────────────

let redisClient: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    redisClient = null;
    return null;
  }

  try {
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

function kvKey(filterKey: string): string {
  return `top:${filterKey}`;
}

export async function kvTopGet(
  filterKey: string,
): Promise<readonly TopMovie[] | null> {
  try {
    const client = getRedisClient();
    if (!client) return null;
    const data = await client.get<TopMovie[]>(kvKey(filterKey));
    return data ?? null;
  } catch (err) {
    log.warn("kv_top_get_failed", { error: (err as Error).message });
    return null;
  }
}

export async function kvTopSet(
  filterKey: string,
  movies: readonly TopMovie[],
): Promise<void> {
  try {
    const client = getRedisClient();
    if (!client) return;
    await client.set(kvKey(filterKey), movies, { ex: TOP_KV_TTL_SEC });
  } catch (err) {
    log.warn("kv_top_set_failed", { error: (err as Error).message });
  }
}

export function _resetTopKvClient(): void {
  redisClient = undefined;
}
