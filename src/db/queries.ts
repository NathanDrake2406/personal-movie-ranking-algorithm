import { desc, and, gte, isNotNull, eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import { movies } from "./schema";
import { CURRENT_SCORE_VERSION } from "./persist";
import { LRUCache } from "@/lib/cache";
import { log } from "@/lib/logger";
import { kvTopGet, kvTopSet } from "./queries-kv";

// L1: In-memory LRU — 5 min TTL, up to 20 filter combos
const topMoviesCache = new LRUCache<readonly TopMovie[]>(5 * 60 * 1000, 20);

export type TopSort = "top" | "divisive";

export type TopMovie = {
  readonly imdbId: string;
  readonly tmdbId: number | null;
  readonly title: string;
  readonly year: number | null;
  readonly poster: string | null;
  readonly director: string | null;
  readonly overallScore: number;
  readonly disagreement: number | null;
  readonly coverage: number;
  readonly sourcesCount: number;
};

export type TopMoviesOptions = {
  readonly limit?: number;
  readonly minSources?: number;
  readonly sort?: TopSort;
  readonly genre?: string;
};

function cacheKey(
  sort: TopSort,
  limit: number,
  minSources: number | undefined,
  genre: string | undefined,
): string {
  return `v${CURRENT_SCORE_VERSION}:${sort}:${limit}:${minSources ?? ""}:${genre ?? ""}`;
}

export async function getTopMovies(
  options: TopMoviesOptions = {},
): Promise<readonly TopMovie[]> {
  const { limit = 10, minSources, sort = "top", genre } = options;
  const db = getDb();
  if (!db) return [];

  const key = cacheKey(sort, limit, minSources, genre);

  // L1: In-memory
  const l1 = topMoviesCache.get(key);
  if (l1) {
    log.info("top_cache_hit", { layer: "L1", key });
    return l1;
  }

  // L2: KV (Redis)
  const l2 = await kvTopGet(key);
  if (l2) {
    log.info("top_cache_hit", { layer: "L2", key });
    topMoviesCache.set(key, l2);
    return l2;
  }

  // L3: Postgres (source of truth)
  const conditions = [
    isNotNull(movies.overallScore),
    gte(movies.coverage, 0.7),
    eq(movies.scoreVersion, CURRENT_SCORE_VERSION),
  ];

  if (minSources != null) {
    conditions.push(gte(movies.sourcesCount, minSources));
  }

  if (genre) {
    conditions.push(sql`${movies.genres} @> ARRAY[${genre}]::text[]`);
  }

  if (sort === "divisive") {
    conditions.push(isNotNull(movies.disagreement));
    conditions.push(gte(movies.overallScore, 50));
  }

  // Quality-weighted disagreement: penalise films below the 70-point prior
  // so mediocre films with noisy scores don't dominate genuinely polarising ones.
  const weightedDisagreement = desc(
    sql`${movies.disagreement} * least(${movies.overallScore} / 70.0, 1.0)`,
  );

  const rows = await db
    .select({
      imdbId: movies.imdbId,
      tmdbId: movies.tmdbId,
      title: movies.title,
      year: movies.year,
      poster: movies.poster,
      director: movies.director,
      overallScore: movies.overallScore,
      disagreement: movies.disagreement,
      coverage: movies.coverage,
      sourcesCount: movies.sourcesCount,
    })
    .from(movies)
    .where(and(...conditions))
    .orderBy(
      sort === "divisive" ? weightedDisagreement : desc(movies.overallScore),
    )
    .limit(limit);

  // Cast is safe: the WHERE clause guarantees overallScore and coverage are non-null
  const result = rows as unknown as readonly TopMovie[];

  log.info("top_cache_miss", { key, count: result.length });

  // Populate L1 + L2
  topMoviesCache.set(key, result);
  kvTopSet(key, result); // fire-and-forget

  return result;
}
