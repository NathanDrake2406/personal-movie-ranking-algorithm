import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/lib/resolve', () => ({
  resolveMovie: vi.fn(async () => ({
    movie: { imdbId: 'tt123', title: 'Inception', year: '2010', poster: 'p', tmdbId: 42 },
    used: 'tmdb' as const,
  })),
}));

vi.mock('@/lib/wikidata', () => ({
  fetchWikidataIds: vi.fn(async () => ({ rottenTomatoes: 'inception', metacritic: 'inception' })),
}));

vi.mock('@/lib/fetchers', () => ({
  runFetchers: vi.fn(async ({ movie }) => ({
    movie,
    sources: [{ source: 'imdb', label: 'IMDb', normalized: 84 }],
    overall: { score: 84, confidence: 1, disagreement: 0 },
  })),
}));

import { POST } from './route';
import { resolveMovie } from '@/lib/resolve';
import { vi as vitestVi } from 'vitest';

beforeAll(() => {
  process.env.OMDB_API_KEY = 'omdb';
  process.env.TMDB_API_KEY = 'tmdb';
});

describe('POST /api/score', () => {
  it('returns payload for valid title', async () => {
    const req = new Request('http://localhost/api/score', {
      method: 'POST',
      body: JSON.stringify({ title: 'Inception' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.overall.score).toBe(84);
    expect(json.movie.imdbId).toBe('tt123');
    const mockedResolve = vitestVi.mocked(resolveMovie);
    expect(mockedResolve.mock.calls[0][0]).toBe('Inception');
  });

  it('400s when title missing', async () => {
    const req = new Request('http://localhost/api/score', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
