import { NextResponse } from 'next/server';
import { fetchWikidataIds } from '@/lib/wikidata';
import { runFetchers } from '@/lib/fetchers';
import { resolveByTmdbId } from '@/lib/resolve';
import { getApiKeys } from '@/lib/config';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tmdbId = body?.tmdbId as number | undefined;
    if (!tmdbId || typeof tmdbId !== 'number') {
      return NextResponse.json({ error: 'tmdbId is required' }, { status: 400 });
    }

    const env = {
      OMDB_API_KEY: process.env.OMDB_API_KEY,
      TMDB_API_KEY: process.env.TMDB_API_KEY,
    };

    const { tmdbKey } = getApiKeys(env);
    if (!tmdbKey) {
      return NextResponse.json(
        { error: 'TMDB_API_KEY environment variable is required' },
        { status: 500 }
      );
    }

    const { movie } = await resolveByTmdbId(tmdbId, env);
    if (!movie.imdbId) {
      return NextResponse.json({ error: 'Could not determine IMDb ID' }, { status: 422 });
    }

    const wikidata = await fetchWikidataIds(movie.imdbId);
    const payload = await runFetchers({ movie, wikidata, env });

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
