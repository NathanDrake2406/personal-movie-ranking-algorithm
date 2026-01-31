import type { SourceScore, OverallScore } from './types';

// Prior strengths (m_i) - votes/reviews needed before trusting raw score
const PRIOR_STRENGTHS: Record<string, number> = {
  imdb: 6000,
  letterboxd: 3000,
  rotten_tomatoes_audience: 1000,
  douban: 6000,
  metacritic: 3,
  rotten_tomatoes_all: 15,
  rotten_tomatoes_top: 6,
  mubi: 100,
};

const DEFAULT_RELIABILITY = 0.65;

// Scale m values based on movie age - older films naturally have fewer reviews
function getAgeMultiplier(year: number | undefined): number {
  if (!year) return 1;
  const age = new Date().getFullYear() - year;
  if (age > 50) return 0.25; // classics get 4x easier threshold
  if (age > 25) return 0.5; // older films get 2x easier threshold
  return 1;
}

export function computeReliability(
  count: number | null | undefined,
  metricKey: string,
  movieYear?: number
): number {
  // Treat 0 or negative as "unknown" - a real rating source wouldn't have 0 reviews
  if (count == null || count <= 0) return DEFAULT_RELIABILITY;

  const baseM = PRIOR_STRENGTHS[metricKey];
  if (baseM == null) return DEFAULT_RELIABILITY;

  const m = baseM * getAgeMultiplier(movieYear);
  return count / (count + m);
}

export function computeAdjustedScore(
  rawScore: number,
  reliability: number,
  baseline: number
): number {
  return reliability * rawScore + (1 - reliability) * baseline;
}

// Baselines (C_i) - fixed priors for Bayesian shrinkage
const BASELINES: Record<string, number> = {
  imdb: 64,
  letterboxd: 65,
  rotten_tomatoes_audience: 70,
  douban: 65,
  metacritic: 55,
  rotten_tomatoes_all: 65,
  rotten_tomatoes_top: 55,
  mubi: 70,
};

// Weights (w_i) - sum to 1.0
const WEIGHTS: Record<string, number> = {
  metacritic: 0.18,
  letterboxd: 0.14,
  imdb: 0.1,
  rotten_tomatoes_top: 0.16,
  douban: 0.11,
  rotten_tomatoes_audience: 0.08,
  mubi: 0.1,
  rotten_tomatoes_all: 0.13,
};

// Minimum sources required for a verdict
// Mubi (cinephile) and Douban (Chinese) are often unavailable - allow up to 2 missing
const MIN_SOURCES_FOR_VERDICT = 6;

export function computeOverallScore(
  scores: SourceScore[],
  movieYear?: number
): OverallScore | null {
  // Filter to metrics that have valid normalized scores and are in our weight set
  const valid = scores.filter(
    (s) => s.normalized != null && WEIGHTS[s.source] != null
  ) as Array<SourceScore & { normalized: number }>;

  // No verdict if 2+ sources are missing (e.g., Mubi missing is OK, but not 2+)
  if (valid.length < MIN_SOURCES_FOR_VERDICT) return null;

  // Compute per-metric values
  const metrics = valid.map((s) => {
    const reliability = computeReliability(s.count, s.source, movieYear);
    const baseline = BASELINES[s.source] ?? 65;
    const adjusted = computeAdjustedScore(s.normalized, reliability, baseline);
    const weight = WEIGHTS[s.source] ?? 0;
    return { source: s.source, reliability, adjusted, weight };
  });

  // Renormalize weights
  const totalWeight = metrics.reduce((sum, m) => sum + m.weight, 0);

  // Compute overall score
  const score =
    metrics.reduce((sum, m) => sum + m.weight * m.adjusted, 0) / totalWeight;

  // Compute confidence (weighted mean of reliabilities)
  const confidence =
    metrics.reduce((sum, m) => sum + m.weight * m.reliability, 0) / totalWeight;

  // Compute disagreement (std dev of adjusted scores)
  const meanAdjusted = score;
  const variance =
    metrics.reduce((sum, m) => sum + Math.pow(m.adjusted - meanAdjusted, 2), 0) /
    metrics.length;
  const disagreement = Math.sqrt(variance);

  return { score, confidence, disagreement };
}
