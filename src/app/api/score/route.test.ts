import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn() };
});

vi.mock('@/lib/resolve', () => ({
  resolveByTmdbId: vi.fn(async () => ({
    movie: { imdbId: 'tt123', title: 'Inception', year: '2010', poster: 'p', tmdbId: 42 },
  })),
}));

vi.mock('@/lib/wikidata', () => ({
  fetchWikidataIds: vi.fn(async () => ({ rottenTomatoes: 'inception', metacritic: 'inception' })),
}));

vi.mock('@/lib/fetchers', () => ({
  runFetchers: vi.fn(async ({ movie }) => ({
    payload: {
      movie,
      sources: [{ source: 'imdb', label: 'IMDb', normalized: 84, count: 100000 }],
      overall: { score: 84, coverage: 0.9, disagreement: 0 },
    },
    deferred: () => {},
  })),
}));

import { POST } from './route';
import { resolveByTmdbId } from '@/lib/resolve';
import { vi as vitestVi } from 'vitest';

beforeAll(() => {
  process.env.OMDB_API_KEY = 'omdb';
  process.env.TMDB_API_KEY = 'tmdb';
});

describe('POST /api/score', () => {
  it('returns payload for valid tmdbId', async () => {
    const req = new Request('http://localhost/api/score', {
      method: 'POST',
      body: JSON.stringify({ tmdbId: 42 }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.overall.score).toBe(84);
    expect(json.movie.imdbId).toBe('tt123');
    const mockedResolve = vitestVi.mocked(resolveByTmdbId);
    expect(mockedResolve.mock.calls[0][0]).toBe(42);
  });

  it('400s when tmdbId missing', async () => {
    const req = new Request('http://localhost/api/score', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
