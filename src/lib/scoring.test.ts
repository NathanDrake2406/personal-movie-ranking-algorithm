import { describe, it, expect } from 'vitest';
import { computeReliability, computeAdjustedScore } from './scoring';

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

describe('computeAdjustedScore', () => {
  it('returns baseline when reliability is 0', () => {
    // adjusted = 0 * 80 + 1 * 64 = 64
    expect(computeAdjustedScore(80, 0, 64)).toBe(64);
  });

  it('returns raw score when reliability is 1', () => {
    // adjusted = 1 * 80 + 0 * 64 = 80
    expect(computeAdjustedScore(80, 1, 64)).toBe(80);
  });

  it('blends raw and baseline at 0.5 reliability', () => {
    // adjusted = 0.5 * 80 + 0.5 * 64 = 72
    expect(computeAdjustedScore(80, 0.5, 64)).toBe(72);
  });

  it('shrinks high score toward baseline with low reliability', () => {
    // adjusted = 0.2 * 90 + 0.8 * 64 = 18 + 51.2 = 69.2
    expect(computeAdjustedScore(90, 0.2, 64)).toBeCloseTo(69.2);
  });
});
