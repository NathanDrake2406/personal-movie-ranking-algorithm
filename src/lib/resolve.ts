import { fetchOmdbByTitle, fetchOmdbById } from './omdb';
import { getApiKeys } from './config';
import { searchTmdbTitle, getTmdbDetails, tmdbToMovieInfo, tmdbSearchResultToInfo } from './tmdb';
import type { MovieInfo } from './types';

export type ResolveResult = { movie: MovieInfo; used: 'tmdb' | 'omdb' };

export async function resolveMovie(query: string, env: Record<string, string | undefined>): Promise<ResolveResult> {
  const { tmdbKey, omdbKey } = getApiKeys(env);
  const tmdb = tmdbKey;
  if (tmdbKey) {
    const results = await searchTmdbTitle(query, tmdbKey);
    // Sort by popularity descending - most popular movie first
    results.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const best = results[0];
    if (best) {
      const details = await getTmdbDetails(best.id, tmdbKey);
      const movie = tmdbToMovieInfo(details);
      if (!movie.imdbId) {
        // fallback: keep tmdb info even without imdb id
        return { movie: tmdbSearchResultToInfo(best), used: 'tmdb' };
      }
      return { movie, used: 'tmdb' };
    }
  }

  if (!omdbKey) throw new Error('No TMDB or OMDb API key configured');
  const omdbResults = await fetchOmdbByTitle(query, omdbKey);
  const first = omdbResults[0];
  if (!first) throw new Error('No results for title');
  const full = await fetchOmdbById(first.imdbID, omdbKey);
  const movie: MovieInfo = {
    imdbId: first.imdbID,
    title: full.Title,
    year: full.Year,
    poster: full.Poster,
  };
  return { movie, used: 'omdb' };
}
