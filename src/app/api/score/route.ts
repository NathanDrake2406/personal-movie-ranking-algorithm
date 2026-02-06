import { NextResponse } from 'next/server';
import { fetchWikidataIds } from '@/lib/wikidata';
import { runFetchers } from '@/lib/fetchers';
import { resolveByTmdbId } from '@/lib/resolve';
import { getApiKeys } from '@/lib/config';
import { log } from '@/lib/logger';
import { kvGet, kvSet } from '@/lib/kv';

export async function POST(request: Request) {
  let tmdbId: number | undefined;
  try {
    const body = await request.json();
    tmdbId = body?.tmdbId as number | undefined;
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

    const { movie } = await resolveByTmdbId(tmdbId, env, request.signal);
    if (!movie.imdbId) {
      return NextResponse.json({ error: 'Could not determine IMDb ID' }, { status: 422 });
    }

    const wikidataPromise = fetchWikidataIds(movie.imdbId, request.signal);
    const payload = await runFetchers({ movie, wikidata: wikidataPromise, env, signal: request.signal, kvGet, kvSet });

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    log.error('score_request_failed', { tmdbId, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
