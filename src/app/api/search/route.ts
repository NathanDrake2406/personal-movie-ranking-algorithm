import { NextResponse } from 'next/server';
import { getApiKeys } from '@/lib/config';

type TMDBSearchResult = {
  results: Array<{
    id: number;
    title: string;
    release_date?: string;
    poster_path?: string;
  }>;
};

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
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(query)}&page=1`,
    );
    const data: TMDBSearchResult = await res.json();

    const results = data.results.slice(0, 8).map((movie) => ({
      id: movie.id,
      title: movie.title,
      year: movie.release_date?.split('-')[0] || null,
      poster: movie.poster_path
        ? `https://image.tmdb.org/t/p/w92${movie.poster_path}`
        : null,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[Search error]', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
