import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeKvTtl, kvGet, kvSet, _resetKvClient } from './kv';
import type { ScorePayload } from './types';

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

// ─── TTL (pure) ──────────────────────────────────────────────────────────────

describe('computeKvTtl', () => {
  const now = new Date('2026-02-06T00:00:00Z');

  it('returns null for films less than 2 years old', () => {
    expect(computeKvTtl('2025', now)).toBeNull(); // age 1
    expect(computeKvTtl('2026', now)).toBeNull(); // age 0
  });

  it('returns null when year is undefined or invalid', () => {
    expect(computeKvTtl(undefined, now)).toBeNull();
    expect(computeKvTtl('', now)).toBeNull();
    expect(computeKvTtl('abc', now)).toBeNull();
  });

  it('returns 7 days for films 2-10 years old', () => {
    expect(computeKvTtl('2024', now)).toBe(SEVEN_DAYS); // age 2
    expect(computeKvTtl('2020', now)).toBe(SEVEN_DAYS); // age 6
    expect(computeKvTtl('2016', now)).toBe(SEVEN_DAYS); // age 10 (boundary)
  });

  it('returns 30 days for films older than 10 years', () => {
    expect(computeKvTtl('2015', now)).toBe(THIRTY_DAYS); // age 11
    expect(computeKvTtl('1994', now)).toBe(THIRTY_DAYS); // age 32
  });
});

// ─── kvGet / kvSet (mocked Redis) ────────────────────────────────────────────

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({ get: mockGet, set: mockSet })),
}));

const samplePayload: ScorePayload = {
  movie: { imdbId: 'tt0111161', title: 'The Shawshank Redemption', year: '1994' },
  sources: [],
  overall: { score: 91, coverage: 0.95, disagreement: 3.2 },
};

function clearRedisEnv() {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

describe('kvGet', () => {
  beforeEach(() => {
    _resetKvClient();
    mockGet.mockReset();
    clearRedisEnv();
    process.env.KV_REST_API_URL = 'https://fake.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';
  });
  afterEach(() => {
    clearRedisEnv();
    _resetKvClient();
  });

  it('returns cached payload on KV hit (without _v field)', async () => {
    mockGet.mockResolvedValue({ ...samplePayload, _v: 1 });
    const result = await kvGet('tt0111161');
    expect(result).toEqual(samplePayload);
    expect(result).not.toHaveProperty('_v');
    expect(mockGet).toHaveBeenCalledWith('score:tt0111161');
  });

  it('returns null on KV miss', async () => {
    mockGet.mockResolvedValue(null);
    expect(await kvGet('tt9999999')).toBeNull();
  });

  it('returns null for stale schema version', async () => {
    mockGet.mockResolvedValue({ ...samplePayload, _v: 0 });
    expect(await kvGet('tt0111161')).toBeNull();
  });

  it('returns null when env vars are missing', async () => {
    clearRedisEnv();
    _resetKvClient();
    expect(await kvGet('tt0111161')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns null on Redis error (graceful degradation)', async () => {
    mockGet.mockRejectedValue(new Error('connection refused'));
    expect(await kvGet('tt0111161')).toBeNull();
  });

  it('falls back to UPSTASH_REDIS_REST_* env vars', async () => {
    clearRedisEnv();
    _resetKvClient();
    process.env.UPSTASH_REDIS_REST_URL = 'https://native.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'native-token';
    mockGet.mockResolvedValue({ ...samplePayload, _v: 1 });
    const result = await kvGet('tt0111161');
    expect(result).toEqual(samplePayload);
    expect(result).not.toHaveProperty('_v');
  });
});

describe('kvSet', () => {
  beforeEach(() => {
    _resetKvClient();
    mockSet.mockReset();
    clearRedisEnv();
    process.env.KV_REST_API_URL = 'https://fake.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';
  });
  afterEach(() => {
    clearRedisEnv();
    _resetKvClient();
  });

  it('writes with 30-day TTL for old films', async () => {
    mockSet.mockResolvedValue(undefined);
    await kvSet('tt0111161', samplePayload, '1994');
    expect(mockSet).toHaveBeenCalledWith('score:tt0111161', { ...samplePayload, _v: 1 }, { ex: 30 * 86400 });
  });

  it('writes with 7-day TTL for mid-age films', async () => {
    mockSet.mockResolvedValue(undefined);
    await kvSet('tt1234567', samplePayload, '2020');
    expect(mockSet).toHaveBeenCalledWith('score:tt1234567', { ...samplePayload, _v: 1 }, { ex: 7 * 86400 });
  });

  it('skips write for recent films', async () => {
    await kvSet('tt0000001', samplePayload, '2025');
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('skips write when year is undefined', async () => {
    await kvSet('tt0000001', samplePayload, undefined);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('does not throw on Redis error', async () => {
    mockSet.mockRejectedValue(new Error('rate limited'));
    await expect(kvSet('tt0111161', samplePayload, '1994')).resolves.toBeUndefined();
  });
});
