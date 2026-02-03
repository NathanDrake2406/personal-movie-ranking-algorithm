import type { SourceScore, OverallScore } from './types';

/**
 * Simple bloc-based weighted scoring algorithm.
 *
 * Three blocs with shares of final score:
 *   - Popular (20%): IMDb 40%, RT Audience 45%, Douban 15%
 *   - Cinephile (35%): Letterboxd 80%, Mubi 20%
 *   - Critical (45%): Metacritic 40%, RT Top Critics 40%, RT All Critics 20%
 *
 * Missing sources are handled by renormalizing over available sources.
 */

// Absolute weights (bloc share × within-bloc weight)
const WEIGHTS: Record<string, number> = {
  // Popular bloc (20%)
  imdb: 0.2 * 0.4, // 0.08
  douban: 0.2 * 0.15, // 0.03
  rotten_tomatoes_audience: 0.2 * 0.45, // 0.09

  // Cinephile bloc (35%)
  letterboxd: 0.35 * 0.8, // 0.28
  mubi: 0.35 * 0.2, // 0.07

  // Critical bloc (45%)
  metacritic: 0.45 * 0.4, // 0.18
  rotten_tomatoes_top: 0.45 * 0.4, // 0.18
  rotten_tomatoes_all: 0.45 * 0.2, // 0.09
};

// Minimum sources required for a verdict
const MIN_SOURCES_FOR_VERDICT = 6;

export function computeOverallScore(
  scores: SourceScore[],
  _movieYear?: number
): OverallScore | null {
  // Filter to sources with valid normalized scores that are in our weight set
  const valid = scores.filter(
    (s) => s.normalized != null && WEIGHTS[s.source] != null
  ) as Array<SourceScore & { normalized: number }>;

  if (valid.length < MIN_SOURCES_FOR_VERDICT) return null;

  // Compute weighted average with renormalization
  const totalWeight = valid.reduce((sum, s) => sum + WEIGHTS[s.source], 0);
  const score =
    valid.reduce((sum, s) => sum + WEIGHTS[s.source] * s.normalized, 0) /
    totalWeight;

  // Coverage: what fraction of total weight is present (0-1)
  const coverage = totalWeight;

  // Disagreement: std dev of available source scores (surfaces polarization)
  const variance =
    valid.reduce((sum, s) => sum + Math.pow(s.normalized - score, 2), 0) /
    valid.length;
  const disagreement = Math.sqrt(variance);

  return { score, coverage, disagreement };
}
