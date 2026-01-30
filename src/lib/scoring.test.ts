import { describe, it, expect, beforeEach } from 'vitest';
import { computeReliability, computeAdjustedScore, computeOverallScore, resetBaselines } from './scoring';
import type { SourceScore } from './types';

beforeEach(() => {
  resetBaselines();
});

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

describe('computeOverallScore', () => {
  it('returns null when no valid scores', () => {
    const result = computeOverallScore([]);
    expect(result).toBeNull();
  });

  it('returns null when all scores have errors', () => {
    const scores: SourceScore[] = [
      { source: 'imdb', label: 'IMDb', normalized: null, error: 'failed' },
    ];
    const result = computeOverallScore(scores);
    expect(result).toBeNull();
  });

  it('computes score with single metric (weight renormalized to 1)', () => {
    const scores: SourceScore[] = [
      { source: 'imdb', label: 'IMDb', normalized: 80, count: 100000 },
    ];
    const result = computeOverallScore(scores);
    expect(result).not.toBeNull();
    // reliability = 100000 / (100000 + 10000) = 0.909
    // adjusted = 0.909 * 80 + 0.091 * 64 = 72.72 + 5.82 = 78.54
    expect(result!.score).toBeCloseTo(78.5, 0);
  });

  it('computes weighted blend with multiple metrics', () => {
    const scores: SourceScore[] = [
      { source: 'imdb', label: 'IMDb', normalized: 80, count: 100000 },
      { source: 'metacritic', label: 'Metacritic', normalized: 70, count: 40 },
    ];
    const result = computeOverallScore(scores);
    expect(result).not.toBeNull();
    // imdb: reliability=0.909, adjusted=78.5, weight=0.15
    // metacritic: reliability=0.667, adjusted=66.7, weight=0.18
    // W_A = 0.15 + 0.18 = 0.33
    // score = (0.15*78.5 + 0.18*66.7) / 0.33 = (11.78 + 12.01) / 0.33 = 72.1
    expect(result!.score).toBeCloseTo(72, 0);
  });

  it('uses 0.7 reliability when count is missing', () => {
    const scores: SourceScore[] = [
      { source: 'imdb', label: 'IMDb', normalized: 80 }, // no count
    ];
    const result = computeOverallScore(scores);
    // reliability = 0.7 (default)
    // adjusted = 0.7 * 80 + 0.3 * 64 = 56 + 19.2 = 75.2
    expect(result!.score).toBeCloseTo(75.2, 0);
  });

  it('returns confidence as weighted mean of reliabilities', () => {
    const scores: SourceScore[] = [
      { source: 'imdb', label: 'IMDb', normalized: 80, count: 100000 },
      { source: 'metacritic', label: 'Metacritic', normalized: 70, count: 40 },
    ];
    const result = computeOverallScore(scores);
    // imdb reliability=0.909, weight=0.15
    // metacritic reliability=0.667, weight=0.18
    // confidence = (0.15*0.909 + 0.18*0.667) / 0.33 = 0.776
    expect(result!.confidence).toBeCloseTo(0.78, 1);
  });

  it('returns disagreement as std dev of adjusted scores', () => {
    const scores: SourceScore[] = [
      { source: 'imdb', label: 'IMDb', normalized: 90, count: 100000 },
      { source: 'metacritic', label: 'Metacritic', normalized: 50, count: 40 },
    ];
    const result = computeOverallScore(scores);
    expect(result!.disagreement).toBeGreaterThan(0);
  });
});
