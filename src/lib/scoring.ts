import type { SourceScore, OverallScore } from './types';

/**
 * Flat weighted scoring algorithm.
 *
 * All sources have direct percentage weights (total 100%).
 * Missing sources are handled by renormalizing over available sources.
 */

const WEIGHTS: Record<string, number> = {
  // Critics (51%)
  rotten_tomatoes_top: 0.20,
  metacritic: 0.17,
  rotten_tomatoes_all: 0.14,

  // Mid (25%)
  allocine_press: 0.13,
  letterboxd: 0.12,

  // Popular (24%)
  rotten_tomatoes_audience: 0.08,
  imdb: 0.08,
  allocine_user: 0.04,
  douban: 0.04,
};

// Minimum sources required for a verdict
const MIN_SOURCES_FOR_VERDICT = 6;

export function computeOverallScore(
  scores: SourceScore[],
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
