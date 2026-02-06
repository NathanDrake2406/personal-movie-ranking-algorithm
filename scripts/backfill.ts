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

const DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  log.info("backfill_start", { total });

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < total; i++) {
    const row = allMovies[i];
    const label = `[${i + 1}/${total}] ${row.imdbId} ${row.title}`;

    try {
      if (!row.tmdbId) {
        log.warn("backfill_skip", { imdbId: row.imdbId, reason: "no tmdb_id" });
        failed++;
        continue;
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
      succeeded++;
    } catch (err) {
      log.warn("backfill_error", {
        imdbId: row.imdbId,
        label,
        error: (err as Error).message,
      });
      failed++;
    }

    if (i < total - 1) {
      await sleep(DELAY_MS);
    }
  }

  log.info("backfill_complete", { total, succeeded, failed });
}

main().catch((err) => {
  log.error("backfill_fatal", { error: (err as Error).message });
  process.exit(1);
});
