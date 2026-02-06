import { NextResponse } from 'next/server';
import { getApiKeys } from '@/lib/config';
import { parseQuery, rankResults, generateVariants, type SearchResult } from '@/lib/search-utils';
import { fetchJson } from '@/lib/http';
import { log } from '@/lib/logger';

type TMDBSearchResult = {
  results: Array<{
    id: number;
    title: string;
    release_date?: string;
    poster_path?: string;
    popularity?: number;
    vote_count?: number;
  }>;
};

async function fetchTMDB(tmdbKey: string, searchTitle: string, year: number | null, signal?: AbortSignal): Promise<TMDBSearchResult> {
  let url = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(searchTitle)}&page=1`;

  if (year) {
    url += `&primary_release_year=${year}`;
  }

  return fetchJson<TMDBSearchResult>(url, { signal }, 5000);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const { tmdbKey } = getApiKeys({
    TMDB_API_KEY: process.env.TMDB_API_KEY,
  });

  if (!tmdbKey) {
    return NextResponse.json({ error: 'TMDB API key not configured' }, { status: 500 });
  }

  try {
    // Parse query to extract year
    const { title: searchTitle, year } = parseQuery(query);

    // Generate query variants (e.g., & ↔ and, remove apostrophes, hyphens)
    const variants = generateVariants(searchTitle);
    const allQueries = [searchTitle, ...variants];

    // Fetch all variants in parallel (with year filter if present)
    const allResults = await Promise.all(
      allQueries.map((q) => fetchTMDB(tmdbKey, q, year, request.signal))
    );
    let combinedResults = allResults.flatMap((r) => r.results);

    // Fallback: if year filter returns empty, retry all without year
    if (year && combinedResults.length === 0) {
      const noYearResults = await Promise.all(
        allQueries.map((q) => fetchTMDB(tmdbKey, q, null, request.signal))
      );
      combinedResults = noYearResults.flatMap((r) => r.results);
    }

    // Dedupe by movie ID into an index Map for O(1) lookups
    const movieIndex = new Map<number, (typeof combinedResults)[0]>();
    for (const movie of combinedResults) {
      if (!movieIndex.has(movie.id)) movieIndex.set(movie.id, movie);
    }

    // Convert to SearchResult format for ranking
    const searchResults: SearchResult[] = Array.from(movieIndex.values()).map((movie) => ({
      id: movie.id,
      title: movie.title,
      release_date: movie.release_date,
      popularity: movie.popularity,
      vote_count: movie.vote_count,
    }));

    // Re-rank results using smart ranking
    const ranked = rankResults(searchResults, searchTitle, year);

    // Map to response format (O(1) lookup via movieIndex)
    const results = ranked.slice(0, 10).map((movie) => {
      const original = movieIndex.get(movie.id)!;
      return {
        id: movie.id,
        title: movie.title,
        year: movie.release_date?.split('-')[0] || null,
        poster: original.poster_path
          ? `https://image.tmdb.org/t/p/w92${original.poster_path}`
          : null,
      };
    });

    return NextResponse.json({ results });
  } catch (err) {
    log.error('search_failed', { query, error: (err as Error).message });
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
