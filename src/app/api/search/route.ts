import { NextResponse } from 'next/server';
import { getApiKeys } from '@/lib/config';
import { parseQuery, rankResults, type SearchResult } from '@/lib/search-utils';

type TMDBSearchResult = {
  results: Array<{
    id: number;
    title: string;
    release_date?: string;
    poster_path?: string;
    popularity?: number;
  }>;
};

async function fetchTMDB(tmdbKey: string, searchTitle: string, year: number | null): Promise<TMDBSearchResult> {
  let url = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(searchTitle)}&page=1`;

  if (year) {
    url += `&primary_release_year=${year}`;
  }

  const res = await fetch(url);
  return res.json();
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

    // Convert to SearchResult format for ranking
    const searchResults: SearchResult[] = data.results.map((movie) => ({
      id: movie.id,
      title: movie.title,
      release_date: movie.release_date,
      popularity: movie.popularity,
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
