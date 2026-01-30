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
