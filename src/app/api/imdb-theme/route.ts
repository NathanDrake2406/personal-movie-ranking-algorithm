import { NextResponse } from 'next/server';
import { fetchImdbThemeSummary } from '@/lib/imdb-theme';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imdbId = searchParams.get('imdbId');
    const themeId = searchParams.get('themeId');

    if (!imdbId || !themeId) {
      return NextResponse.json({ error: 'imdbId and themeId are required' }, { status: 400 });
    }

    const env = {
      IMDB_THEME_GQL_URL: process.env.IMDB_THEME_GQL_URL,
      IMDB_THEME_GQL_OPERATION: process.env.IMDB_THEME_GQL_OPERATION,
      IMDB_THEME_GQL_QUERY: process.env.IMDB_THEME_GQL_QUERY,
      IMDB_THEME_GQL_PERSISTED_HASH: process.env.IMDB_THEME_GQL_PERSISTED_HASH,
      IMDB_THEME_GQL_VARIABLES: process.env.IMDB_THEME_GQL_VARIABLES,
      IMDB_THEME_GQL_HEADERS: process.env.IMDB_THEME_GQL_HEADERS,
      IMDB_THEME_COOKIE: process.env.IMDB_THEME_COOKIE,
    };

    const result = await fetchImdbThemeSummary(imdbId, themeId, env);
    if (!result.summary) {
      return NextResponse.json({ error: result.error || 'Summary unavailable' }, { status: 404 });
    }

    return NextResponse.json({ summary: result.summary }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
