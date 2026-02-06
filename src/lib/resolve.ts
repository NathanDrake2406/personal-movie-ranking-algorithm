import {
  fetchOmdbByTitleWithRotation,
  fetchOmdbByIdWithRotation,
} from "./omdb";
import { getApiKeys } from "./config";
import {
  searchTmdbTitle,
  getTmdbDetails,
  tmdbToMovieInfo,
  tmdbSearchResultToInfo,
} from "./tmdb";
import type { MovieInfo } from "./types";

export type ResolveResult = { movie: MovieInfo; used: "tmdb" | "omdb" };

export async function resolveByTmdbId(
  tmdbId: number,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<ResolveResult> {
  const { tmdbKey } = getApiKeys(env);
  if (!tmdbKey) throw new Error("TMDB API key not configured");

  const details = await getTmdbDetails(tmdbId, tmdbKey, signal);
  const movie = tmdbToMovieInfo(details);
  return { movie, used: "tmdb" };
}

export async function resolveMovie(
  query: string,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<ResolveResult> {
  const { tmdbKey, omdbKeys } = getApiKeys(env);
  if (tmdbKey) {
    const results = await searchTmdbTitle(query, tmdbKey, signal);
    // Sort by popularity descending - most popular movie first
    results.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const best = results[0];
    if (best) {
      const details = await getTmdbDetails(best.id, tmdbKey, signal);
      const movie = tmdbToMovieInfo(details);
      if (!movie.imdbId) {
        // fallback: keep tmdb info even without imdb id
        return { movie: tmdbSearchResultToInfo(best), used: "tmdb" };
      }
      return { movie, used: "tmdb" };
    }
  }

  if (omdbKeys.length === 0)
    throw new Error("No TMDB or OMDb API key configured");
  const omdbResults = await fetchOmdbByTitleWithRotation(
    query,
    omdbKeys,
    signal,
  );
  const first = omdbResults[0];
  if (!first) throw new Error("No results for title");
  const full = await fetchOmdbByIdWithRotation(first.imdbID, omdbKeys, signal);
  const movie: MovieInfo = {
    imdbId: first.imdbID,
    title: full.Title,
    year: full.Year,
    poster: full.Poster,
  };
  return { movie, used: "omdb" };
}
