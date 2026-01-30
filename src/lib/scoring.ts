import type { SourceScore, OverallScore } from './types';

// Prior strengths (m_i) - votes/reviews needed before trusting raw score
const PRIOR_STRENGTHS: Record<string, number> = {
  imdb: 10000,
  letterboxd: 2000,
  rotten_tomatoes_audience: 2000,
  douban: 10000,
  metacritic: 20,
  rotten_tomatoes_all: 60,
  rotten_tomatoes_top: 40,
  mubi: 200,
};

const DEFAULT_RELIABILITY = 0.7;

export function computeReliability(
  count: number | null | undefined,
  metricKey: string
): number {
  if (count == null) return DEFAULT_RELIABILITY;

  const m = PRIOR_STRENGTHS[metricKey];
  if (m == null) return DEFAULT_RELIABILITY;

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
  letterboxd: 63,
  rotten_tomatoes_audience: 70,
  douban: 70,
  metacritic: 60,
  rotten_tomatoes_all: 75,
  rotten_tomatoes_top: 75,
  mubi: 65,
};

// Weights (w_i) - sum to 1.0
const WEIGHTS: Record<string, number> = {
  metacritic: 0.18,
  letterboxd: 0.16,
  imdb: 0.15,
  rotten_tomatoes_top: 0.12,
  douban: 0.12,
  rotten_tomatoes_audience: 0.10,
  mubi: 0.09,
  rotten_tomatoes_all: 0.08,
};

export function computeOverallScore(scores: SourceScore[]): OverallScore | null {
  // Filter to metrics that have valid normalized scores and are in our weight set
  const valid = scores.filter(
    (s) => s.normalized != null && WEIGHTS[s.source] != null
  ) as Array<SourceScore & { normalized: number }>;

  if (valid.length === 0) return null;

  // Compute per-metric values
  const metrics = valid.map((s) => {
    const reliability = computeReliability(s.count, s.source);
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
