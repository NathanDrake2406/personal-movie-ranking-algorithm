import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./http', () => {
  const fetchJson = vi.fn(async (url: string) => {
    if (url.includes('omdbapi'))
      return {
        imdbRating: '8.4',
        imdbVotes: '1,234,567',
        Ratings: [{ Source: 'Rotten Tomatoes', Value: '86%' }],
        Metascore: '73',
      };
    if (url.includes('rottentomatoes')) return { meterScore: 86 };
    // Douban suggest API - return empty to force waterfall to wikidata
    if (url.includes('douban.com/j/subject_suggest')) return [];
    // Douban subject_abstract API - returns rating
    if (url.includes('douban.com/j/subject_abstract'))
      return { r: 0, subject: { rate: '9.1', title: 'Test Movie' } };
    throw new Error('unhandled url ' + url);
  });
  const fetchText = vi.fn(async (url: string) => {
    if (url.includes('letterboxd')) return '"ratingValue":4.1,"ratingCount":50000';
    if (url.includes('metacritic')) return '"ratingValue": 73,"ratingCount":42';
    // Mubi ratings page (uses numeric ID from Wikidata)
    if (url.includes('mubi.com/en/films/99999/ratings'))
      return '<meta name="description" content="Average rating: 8.5/10 out of 12,345 ratings">';
    // Douban search pages and Google fallback - return empty
    if (url.includes('douban.com') || url.includes('google.com')) return '';
    return '';
  });
  return { fetchJson, fetchText };
});

import { runFetchers } from './fetchers';

const baseCtx = {
  movie: { imdbId: 'tt1', title: 'Test Movie' },
  wikidata: { rottenTomatoes: 'test_movie', metacritic: 'test-movie', letterboxd: 'test-movie', douban: '12345', mubi: '99999' },
  env: { OMDB_API_KEY: 'omdb' },
};

describe('runFetchers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns normalized scores and overall', async () => {
    const res = await runFetchers(baseCtx);
    expect(res.sources).toHaveLength(6);
    const imdb = res.sources.find((s) => s.source === 'imdb');
    expect(imdb?.normalized).toBeCloseTo(84);
    const mc = res.sources.find((s) => s.source === 'metacritic');
    expect(mc?.normalized).toBe(73);
    const lb = res.sources.find((s) => s.source === 'letterboxd');
    expect(lb?.normalized).toBeCloseTo(82); // 4.1/5 * 100
    const mubi = res.sources.find((s) => s.source === 'mubi');
    expect(mubi?.normalized).toBeCloseTo(85); // 8.5/10 * 100
    const douban = res.sources.find((s) => s.source === 'douban');
    expect(douban?.normalized).toBeCloseTo(91); // 9.1/10 * 100
    expect(res.overall).not.toBeNull();
    expect(res.overall!.score).toBeGreaterThan(0);
    expect(res.overall!.confidence).toBeGreaterThan(0);
    expect(res.overall!.disagreement).toBeGreaterThanOrEqual(0);
    expect(res.missingSources?.length).toBe(0);
  });

  it('falls back to bundled keys when env missing and still returns scores', async () => {
    const res = await runFetchers({
      ...baseCtx,
      movie: { ...baseCtx.movie, imdbId: 'tt2' },
      env: { OMDB_API_KEY: undefined },
    });
    const imdb = res.sources.find((s) => s.source === 'imdb');
    expect(imdb?.normalized).toBeCloseTo(84);
  });

  it('uses OMDb fallbacks when RT/Metacritic slugs missing', async () => {
    const res = await runFetchers({
      ...baseCtx,
      movie: { ...baseCtx.movie, imdbId: 'tt-fallback' },
      wikidata: { rottenTomatoes: undefined, metacritic: undefined },
    });
    const rt = res.sources.find((s) => s.source === 'rotten_tomatoes');
    const mc = res.sources.find((s) => s.source === 'metacritic');
    expect(rt?.normalized).toBe(86);
    expect(mc?.normalized).toBe(73);
  });
});
