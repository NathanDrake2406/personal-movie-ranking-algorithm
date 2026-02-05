import { NextResponse } from 'next/server';
import { getApiKeys } from '@/lib/config';
import { parseQuery, rankResults, generateVariants, type SearchResult } from '@/lib/search-utils';
import { fetchJson } from '@/lib/http';

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

async function fetchTMDB(tmdbKey: string, searchTitle: string, year: number | null): Promise<TMDBSearchResult> {
  let url = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(searchTitle)}&page=1`;

  if (year) {
    url += `&primary_release_year=${year}`;
  }

  return fetchJson<TMDBSearchResult>(url, {}, 5000);
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

    // Fetch with year filter if present
    let data = await fetchTMDB(tmdbKey, searchTitle, year);

    // Fallback: if year filter returns empty, retry without year
    if (year && data.results.length === 0) {
      data = await fetchTMDB(tmdbKey, searchTitle, null);
    }

    // Fallback: if still empty, try query variants in parallel
    if (data.results.length === 0) {
      const variants = generateVariants(searchTitle);
      if (variants.length > 0) {
        const variantResults = await Promise.all(
          variants.map((v) => fetchTMDB(tmdbKey, v, year))
        );
        // If year filter still empty, try variants without year
        let combinedResults = variantResults.flatMap((r) => r.results);
        if (combinedResults.length === 0 && year) {
          const noYearResults = await Promise.all(
            variants.map((v) => fetchTMDB(tmdbKey, v, null))
          );
          combinedResults = noYearResults.flatMap((r) => r.results);
        }
        // Dedupe by movie ID
        const seen = new Map<number, (typeof data.results)[0]>();
        for (const movie of combinedResults) {
          if (!seen.has(movie.id)) seen.set(movie.id, movie);
        }
        data = { results: Array.from(seen.values()) };
      }
    }

    // Convert to SearchResult format for ranking
    const searchResults: SearchResult[] = data.results.map((movie) => ({
      id: movie.id,
      title: movie.title,
      release_date: movie.release_date,
      popularity: movie.popularity,
      vote_count: movie.vote_count,
    }));

    // Re-rank results using smart ranking
    const ranked = rankResults(searchResults, searchTitle, year);

    // Map to response format
    const results = ranked.slice(0, 10).map((movie) => {
      const original = data.results.find((m) => m.id === movie.id)!;
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
    console.error('[Search error]', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
