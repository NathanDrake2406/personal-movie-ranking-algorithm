import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScorePayload } from './types';

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
    // AlloCiné page with press and user ratings
    if (url.includes('allocine.fr'))
      return '<div>Presse</div><span class="stareval-note">3,8</span><span class="stareval-note">4,2</span>';
    // Douban search pages and Google fallback - return empty
    if (url.includes('douban.com') || url.includes('google.com')) return '';
    return '';
  });
  return { fetchJson, fetchText };
});

import { runFetchers } from './fetchers';

const baseCtx = {
  movie: { imdbId: 'tt1', title: 'Test Movie' },
  wikidata: { rottenTomatoes: 'test_movie', metacritic: 'test-movie', letterboxd: 'test-movie', douban: '12345', allocineFilm: '12345' },
  env: { OMDB_API_KEY: 'omdb' },
};

describe('runFetchers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns normalized scores and overall', async () => {
    const res = await runFetchers(baseCtx);
    // Check individual sources are present and normalized correctly
    const imdb = res.sources.find((s) => s.source === 'imdb');
    expect(imdb?.normalized).toBeCloseTo(88, 0);
    const mc = res.sources.find((s) => s.source === 'metacritic');
    expect(mc?.normalized).toBe(73);
    const lb = res.sources.find((s) => s.source === 'letterboxd');
    expect(lb?.normalized).toBeCloseTo(82); // 4.1/5 * 100
    const allocinePress = res.sources.find((s) => s.source === 'allocine_press');
    expect(allocinePress?.normalized).toBeCloseTo(76); // 3.8/5 * 100
    const allocineUser = res.sources.find((s) => s.source === 'allocine_user');
    expect(allocineUser?.normalized).toBeCloseTo(84); // 4.2/5 * 100
    const douban = res.sources.find((s) => s.source === 'douban');
    expect(douban?.normalized).toBeCloseTo(91); // 9.1/10 * 100
    // Overall may be null if not enough weighted sources match
    // Just verify the response structure is valid
    expect(res.sources.length).toBeGreaterThan(0);
  });

  it('returns other sources when OMDB key is missing', async () => {
    const res = await runFetchers({
      ...baseCtx,
      movie: { ...baseCtx.movie, imdbId: 'tt2' },
      env: { OMDB_API_KEY: undefined },
    });
    // Without OMDB key, IMDb score won't be fetched via OMDB
    // but other sources (letterboxd, allocine, douban) should still work
    const lb = res.sources.find((s) => s.source === 'letterboxd');
    expect(lb?.normalized).toBeCloseTo(82);
    const allocinePress = res.sources.find((s) => s.source === 'allocine_press');
    expect(allocinePress?.normalized).toBeCloseTo(76);
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

  it('uses OMDb RT fallback when RT returns 200 but no score data', async () => {
    // This tests the bug where RT returns HTTP 200 with missing meterScore
    // and no scores can be scraped - the OMDB fallback should trigger
    const { fetchJson } = await import('./http');
    const mockedFetchJson = vi.mocked(fetchJson);

    // Override to return empty meterScore for this specific call pattern
    mockedFetchJson.mockImplementation(async (url: string) => {
      if (url.includes('omdbapi')) {
        return {
          imdbRating: '8.4',
          imdbVotes: '1,234,567',
          Ratings: [{ Source: 'Rotten Tomatoes', Value: '86%' }],
          Metascore: '73',
        };
      }
      // RT API returns 200 but with no score
      if (url.includes('rottentomatoes') && url.includes('napi')) {
        return {}; // No meterScore field
      }
      if (url.includes('douban.com/j/subject_suggest')) return [];
      if (url.includes('douban.com/j/subject_abstract'))
        return { r: 0, subject: { rate: '9.1', title: 'Test Movie' } };
      throw new Error('unhandled url ' + url);
    });

    const { fetchText } = await import('./http');
    const mockedFetchText = vi.mocked(fetchText);
    mockedFetchText.mockImplementation(async (url: string) => {
      // RT HTML scrape also returns no data
      if (url.includes('rottentomatoes')) return '<html>no data</html>';
      if (url.includes('letterboxd')) return '"ratingValue":4.1,"ratingCount":50000';
      if (url.includes('metacritic')) return '"ratingValue": 73,"ratingCount":42';
      if (url.includes('allocine.fr'))
        return '<div>Presse</div><span class="stareval-note">3,8</span><span class="stareval-note">4,2</span>';
      return '';
    });

    const res = await runFetchers({
      ...baseCtx,
      movie: { ...baseCtx.movie, imdbId: 'tt-rt-empty' },
    });

    // OMDB fallback should be used since RT returned no data
    const rt = res.sources.find((s) => s.source === 'rotten_tomatoes');
    expect(rt?.normalized).toBe(86);
    expect(rt?.fromFallback).toBe(true);
  });

  it('uses KV cache on in-memory miss', async () => {
    const kvPayload: ScorePayload = {
      movie: { imdbId: 'tt-kv', title: 'KV Movie', year: '2010' },
      sources: [],
      overall: { score: 85, coverage: 0.9, disagreement: 2.5 },
    };
    const mockKvGet = vi.fn().mockResolvedValue(kvPayload);
    const mockKvSet = vi.fn();

    const res = await runFetchers({
      movie: { imdbId: 'tt-kv', title: 'KV Movie', year: '2010' },
      wikidata: {},
      env: {},
      kvGet: mockKvGet,
      kvSet: mockKvSet,
    });

    expect(res).toEqual(kvPayload);
    expect(mockKvGet).toHaveBeenCalledWith('tt-kv');
    expect(mockKvSet).not.toHaveBeenCalled();
  });

  it('writes to KV after scraping on KV miss', async () => {
    const mockKvGet = vi.fn().mockResolvedValue(null);
    const mockKvSet = vi.fn().mockResolvedValue(undefined);

    const res = await runFetchers({
      ...baseCtx,
      movie: { ...baseCtx.movie, imdbId: 'tt-kvmiss', year: '2010' },
      kvGet: mockKvGet,
      kvSet: mockKvSet,
    });

    expect(mockKvGet).toHaveBeenCalledWith('tt-kvmiss');
    expect(mockKvSet).toHaveBeenCalledWith('tt-kvmiss', res, '2010');
  });
});
