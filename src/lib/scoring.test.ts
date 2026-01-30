import { describe, it, expect } from 'vitest';
import { computeReliability } from './scoring';

describe('computeReliability', () => {
  it('returns 0.7 when count is null', () => {
    expect(computeReliability(null, 'imdb')).toBe(0.7);
  });

  it('returns 0.7 when count is undefined', () => {
    expect(computeReliability(undefined, 'imdb')).toBe(0.7);
  });

  it('computes v / (v + m) for imdb with 10000 votes', () => {
    // m_imdb = 10000, so 10000 / (10000 + 10000) = 0.5
    expect(computeReliability(10000, 'imdb')).toBe(0.5);
  });

  it('computes high reliability for imdb with 100000 votes', () => {
    // 100000 / (100000 + 10000) = 0.909...
    expect(computeReliability(100000, 'imdb')).toBeCloseTo(0.909, 2);
  });

  it('computes reliability for metacritic with 20 reviews', () => {
    // m_metacritic = 20, so 20 / (20 + 20) = 0.5
    expect(computeReliability(20, 'metacritic')).toBe(0.5);
  });

  it('returns 0.7 for unknown metric', () => {
    expect(computeReliability(100, 'unknown_metric')).toBe(0.7);
  });
});
