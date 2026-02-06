import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { movies, scores } from "./schema";
import type { NewMovie, NewScore } from "./schema";
import type { ScorePayload, SourceScore } from "@/lib/types";
import { WEIGHTED_SOURCE_KEYS } from "@/lib/scoring";
import { log } from "@/lib/logger";

/** Bump when weights or scoring algorithm change — enables re-derivation queries. */
export const CURRENT_SCORE_VERSION = 2;
const BACKFILL_STALE_TIMESTAMP_MS = 0;

// ─── Pure mapping functions ───────────────────────────────────────────────────

/**
 * Parse year string to number with strict validation.
 * Guards against: empty string → 0, non-integer floats, out-of-range values.
 */
export function parseYear(year: string | undefined): number | null {
  if (year == null || year === "") return null;
  const n = Number(year);
  if (!Number.isInteger(n)) return null;
  if (n < 1888 || n > 2100) return null;
  return n;
}

export function payloadToMovieRow(
  payload: ScorePayload,
  lastFetchedAt: Date,
): NewMovie {
  const { movie, sources, overall } = payload;

  const weightedSources = sources.filter(
    (s) => WEIGHTED_SOURCE_KEYS.has(s.source) && s.normalized != null,
  );

  return {
    imdbId: movie.imdbId,
    tmdbId: movie.tmdbId ?? null,
    title: movie.title,
    year: parseYear(movie.year),
    poster: movie.poster ?? null,
    overview: movie.overview ?? null,
    runtime: movie.runtime != null ? (movie.runtime as number) : null,
    rating: movie.rating ?? null,
    genres: movie.genres ?? null,
    director: movie.director ?? null,
    directors: movie.directors ?? null,
    writers: movie.writers ?? null,
    cinematographer: movie.cinematographer ?? null,
    composer: movie.composer ?? null,
    castMembers: movie.cast ?? null,
    overallScore: overall?.score ?? null,
    coverage: overall?.coverage ?? null,
    disagreement: overall?.disagreement ?? null,
    sourcesCount: weightedSources.length,
    isComplete: weightedSources.length === WEIGHTED_SOURCE_KEYS.size,
    scoreVersion: CURRENT_SCORE_VERSION,
    lastFetchedAt,
  };
}

export function sourceToScoreRow(
  imdbId: string,
  source: SourceScore,
  updatedAt: Date,
): NewScore {
  return {
    imdbId,
    source: source.source,
    label: source.label,
    normalized: source.normalized ?? null,
    rawValue: source.raw?.value ?? null,
    rawScale: source.raw?.scale ?? null,
    count: source.count ?? null,
    url: source.url ?? null,
    error: source.error ?? null,
    fromFallback: source.fromFallback ?? false,
    updatedAt,
  };
}

// ─── Persist (transactional upsert, never throws) ────────────────────────────

export type PersistOptions = {
  /** When true, only inserts if movie doesn't exist — never overwrites existing data.
   *  Used for KV cache hits where the data may be stale. */
  backfill?: boolean;
};

export async function persistScores(
  payload: ScorePayload,
  options: PersistOptions = {},
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const isBackfill = options.backfill ?? false;
  const persistedAt = isBackfill
    ? new Date(BACKFILL_STALE_TIMESTAMP_MS)
    : new Date();
  const movieRow = payloadToMovieRow(payload, persistedAt);
  const scoreRows = payload.sources.map((s) =>
    sourceToScoreRow(payload.movie.imdbId, s, persistedAt),
  );

  try {
    await db.transaction(async (tx) => {
      if (isBackfill) {
        // Backfill mode: insert-if-absent only — don't overwrite existing data
        // with potentially stale KV-cached payloads
        await tx.insert(movies).values(movieRow).onConflictDoNothing();
        if (scoreRows.length > 0) {
          await tx.insert(scores).values(scoreRows).onConflictDoNothing();
        }
      } else {
        // Fresh fetch: authoritative upsert with real lastFetchedAt
        await tx
          .insert(movies)
          .values(movieRow)
          .onConflictDoUpdate({
            target: movies.imdbId,
            set: {
              tmdbId: movieRow.tmdbId,
              title: movieRow.title,
              year: movieRow.year,
              poster: movieRow.poster,
              overview: movieRow.overview,
              runtime: movieRow.runtime,
              rating: movieRow.rating,
              genres: movieRow.genres,
              director: movieRow.director,
              directors: movieRow.directors,
              writers: movieRow.writers,
              cinematographer: movieRow.cinematographer,
              composer: movieRow.composer,
              castMembers: movieRow.castMembers,
              overallScore: movieRow.overallScore,
              coverage: movieRow.coverage,
              disagreement: movieRow.disagreement,
              sourcesCount: movieRow.sourcesCount,
              isComplete: movieRow.isComplete,
              scoreVersion: movieRow.scoreVersion,
              lastFetchedAt: movieRow.lastFetchedAt,
              // NOTE: createdAt intentionally omitted — first-write-wins
            },
          });

        // Replace all scores: delete stale rows then insert current set.
        // This prevents orphans when the source set changes (e.g., split RT → OMDB fallback).
        await tx.delete(scores).where(eq(scores.imdbId, payload.movie.imdbId));
        if (scoreRows.length > 0) {
          await tx.insert(scores).values(scoreRows);
        }
      }
    });

    log.info("db_persisted", {
      imdbId: payload.movie.imdbId,
      sourcesCount: movieRow.sourcesCount,
      isComplete: movieRow.isComplete,
      backfill: isBackfill,
    });
  } catch (err) {
    log.warn("db_persist_failed", {
      imdbId: payload.movie.imdbId,
      error: (err as Error).message,
    });
  }
}
