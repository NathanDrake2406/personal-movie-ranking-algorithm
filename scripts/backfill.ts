/**
 * Backfill script: re-fetches and re-scores all movies in Postgres.
 *
 * Usage:
 *   npx tsx scripts/backfill.ts
 *
 * Required env vars: TMDB_API_KEY, POSTGRES_URL
 * Optional env vars: OMDB_API_KEY, KV_REST_API_URL + KV_REST_API_TOKEN
 */

import { getDb } from "@/db/client";
import { movies } from "@/db/schema";
import { resolveByTmdbId } from "@/lib/resolve";
import { fetchWikidataIds } from "@/lib/wikidata";
import { runFetchers } from "@/lib/fetchers";
import { kvSet } from "@/lib/kv";
import { log } from "@/lib/logger";

const CONCURRENCY = 5;
const BATCH_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processMovie(
  row: { imdbId: string; tmdbId: number | null; title: string },
  index: number,
  total: number,
): Promise<boolean> {
  const label = `[${index + 1}/${total}] ${row.imdbId} ${row.title}`;

  if (!row.tmdbId) {
    log.warn("backfill_skip", { imdbId: row.imdbId, reason: "no tmdb_id" });
    return false;
  }

  const { movie } = await resolveByTmdbId(row.tmdbId, process.env);
  const wikidata = fetchWikidataIds(movie.imdbId);

  const { payload, deferred } = await runFetchers({
    movie,
    wikidata,
    env: process.env,
    kvSet,
  });

  await deferred();

  const score = payload.overall?.score?.toFixed(1) ?? "N/A";
  const count = payload.sources.filter((s) => s.normalized != null).length;
  log.info("backfill_done", {
    imdbId: row.imdbId,
    label,
    score,
    sources: `${count}/${payload.sources.length}`,
  });
  return true;
}

async function main(): Promise<void> {
  const db = getDb();
  if (!db) {
    log.error("backfill_abort", { reason: "POSTGRES_URL not configured" });
    process.exit(1);
  }

  if (!process.env.TMDB_API_KEY) {
    log.error("backfill_abort", { reason: "TMDB_API_KEY not configured" });
    process.exit(1);
  }

  const allMovies = await db
    .select({
      imdbId: movies.imdbId,
      tmdbId: movies.tmdbId,
      title: movies.title,
    })
    .from(movies);

  const total = allMovies.length;
  log.info("backfill_start", { total, concurrency: CONCURRENCY });

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < total; i += CONCURRENCY) {
    const batch = allMovies.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((row, j) => processMovie(row, i + j, total)),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        succeeded++;
      } else {
        if (result.status === "rejected") {
          log.warn("backfill_error", { error: (result.reason as Error).message });
        }
        failed++;
      }
    }

    if (i + CONCURRENCY < total) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  log.info("backfill_complete", { total, succeeded, failed });
}

main().catch((err) => {
  log.error("backfill_fatal", { error: (err as Error).message });
  process.exit(1);
});
