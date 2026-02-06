import type { SourceScore, OverallScore } from "./types";

/**
 * Tiered delta-based scoring algorithm.
 *
 * Addresses critic overlap: RT Top ⊂ RT All, Metacritic shares ~55% with RT Top.
 * Instead of treating overlapping sources as independent votes, elite sources
 * (RT Top, Metacritic) act as premiums on top of a critic baseline.
 *
 * Three tiers with redistribution when a tier is entirely missing:
 *   - Critics  (50%): BaseCritics + ElitePremium
 *   - Cinephile (30%): Letterboxd
 *   - Mainstream (20%): RT Audience, IMDb, Douban, AlloCiné User
 *
 * Includes Bayesian shrinkage for small-sample sources (AlloCiné).
 */

// ─── Tier weights ─────────────────────────────────────────────────────────────

const TIER_WEIGHT_CRITIC = 0.5;
const TIER_WEIGHT_CINEPHILE = 0.3;
const TIER_WEIGHT_MAINSTREAM = 0.2;

// ─── Within-tier weights ──────────────────────────────────────────────────────

// Critic baseline (RT All + AlloCiné Press)
const CRITIC_BASE_WEIGHTS: Record<string, number> = {
  rotten_tomatoes_all: 0.8,
  allocine_press: 0.2,
};

// Elite premium sources (delta from baseline)
const ELITE_WEIGHTS: Record<string, number> = {
  rotten_tomatoes_top: 0.6,
  metacritic: 0.4,
};

// Fallback when RT All is missing: use elite sources as absolute values
const ELITE_FALLBACK_WEIGHTS: Record<string, number> = {
  rotten_tomatoes_top: 0.55,
  metacritic: 0.45,
};

const ELITE_PREMIUM_CLAMP = 15; // Max ±15 raw premium
const ELITE_PREMIUM_DAMPENER = 0.4; // Scale factor on clamped premium

// Mainstream tier
const MAINSTREAM_WEIGHTS: Record<string, number> = {
  rotten_tomatoes_audience: 0.35,
  imdb: 0.35,
  douban: 0.15,
  allocine_user: 0.15,
};

// ─── Bayesian shrinkage ───────────────────────────────────────────────────────

const SHRINKAGE_PRIOR = 70;

// Per-source shrinkage config.
// k: Bayesian strength parameter (higher = more pull toward prior)
// fullAt: count at which the source is considered fully reliable (no shrinkage)
// AlloCiné Press has ~30-40 critics max — that's their full pool, not a small sample.
const SHRINKAGE_CONFIG: Record<string, { k: number; fullAt: number }> = {
  allocine_press: { k: 8, fullAt: 30 },
  allocine_user: { k: 30, fullAt: 1000 },
};

const SHRINKAGE_SOURCES = new Set(Object.keys(SHRINKAGE_CONFIG));

function applyShrinkage(
  source: string,
  score: number,
  count: number | null | undefined,
): number {
  if (count == null) return score;
  const cfg = SHRINKAGE_CONFIG[source];
  if (!cfg) return score;
  if (count >= cfg.fullAt) return score;
  return (
    SHRINKAGE_PRIOR + (count / (count + cfg.k)) * (score - SHRINKAGE_PRIOR)
  );
}

// ─── Source key set (public API — unchanged) ──────────────────────────────────

/** The 9 weighted source keys — single source of truth for scoring + persistence. */
export const WEIGHTED_SOURCE_KEYS: ReadonlySet<string> = new Set([
  "rotten_tomatoes_top",
  "metacritic",
  "rotten_tomatoes_all",
  "allocine_press",
  "letterboxd",
  "rotten_tomatoes_audience",
  "imdb",
  "allocine_user",
  "douban",
]);

// Minimum sources required for a verdict
const MIN_SOURCES_FOR_VERDICT = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ValidSource = SourceScore & { normalized: number };

/** Build a lookup from source name → ValidSource for quick access. */
function buildSourceMap(scores: SourceScore[]): Map<string, ValidSource> {
  const map = new Map<string, ValidSource>();
  for (const s of scores) {
    if (s.normalized != null && WEIGHTED_SOURCE_KEYS.has(s.source)) {
      map.set(s.source, s as ValidSource);
    }
  }
  return map;
}

/** Compute weighted average from a weight map, renormalizing over present sources.
 *  Returns null if no sources are present. */
function weightedAvg(
  weights: Record<string, number>,
  sourceMap: Map<string, ValidSource>,
  useShrinkage: boolean,
): number | null {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, w] of Object.entries(weights)) {
    const src = sourceMap.get(key);
    if (!src) continue;
    const score =
      useShrinkage && SHRINKAGE_SOURCES.has(key)
        ? applyShrinkage(key, src.normalized, src.count)
        : src.normalized;
    totalWeight += w;
    weightedSum += w * score;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

// ─── Tier computation ─────────────────────────────────────────────────────────

function computeCriticScore(
  sourceMap: Map<string, ValidSource>,
): number | null {
  const hasRtAll = sourceMap.has("rotten_tomatoes_all");

  if (hasRtAll) {
    const baseCritics = weightedAvg(CRITIC_BASE_WEIGHTS, sourceMap, true)!;
    // Normal path: compute elite premium as delta from baseline
    let premiumNumerator = 0;
    let premiumDenominator = 0;

    for (const [key, w] of Object.entries(ELITE_WEIGHTS)) {
      const src = sourceMap.get(key);
      if (!src) continue;
      premiumNumerator += w * (src.normalized - baseCritics);
      premiumDenominator += w;
    }

    if (premiumDenominator > 0) {
      const rawPremium = premiumNumerator / premiumDenominator;
      const clampedPremium = Math.max(
        -ELITE_PREMIUM_CLAMP,
        Math.min(ELITE_PREMIUM_CLAMP, rawPremium),
      );
      return baseCritics + clampedPremium * ELITE_PREMIUM_DAMPENER;
    }

    // No elite sources available — baseline alone
    return baseCritics;
  }

  // RT All missing — use elite sources as absolute values (no delta possible)
  return weightedAvg(ELITE_FALLBACK_WEIGHTS, sourceMap, false);
}

function computeCinephileScore(
  sourceMap: Map<string, ValidSource>,
): number | null {
  const lb = sourceMap.get("letterboxd");
  return lb ? lb.normalized : null;
}

function computeMainstreamScore(
  sourceMap: Map<string, ValidSource>,
): number | null {
  return weightedAvg(MAINSTREAM_WEIGHTS, sourceMap, true);
}

// ─── Main scoring function ────────────────────────────────────────────────────

export function computeOverallScore(
  scores: SourceScore[],
): OverallScore | null {
  const sourceMap = buildSourceMap(scores);

  // Minimum source count gate
  if (sourceMap.size < MIN_SOURCES_FOR_VERDICT) return null;

  // Compute tier scores
  const criticScore = computeCriticScore(sourceMap);
  const cinephileScore = computeCinephileScore(sourceMap);
  const mainstreamScore = computeMainstreamScore(sourceMap);

  // Critic tier must not be null
  if (criticScore == null) return null;

  // Build tier list with weights, redistributing when tiers are null
  const tiers: Array<{ score: number; weight: number }> = [];
  tiers.push({ score: criticScore, weight: TIER_WEIGHT_CRITIC });
  if (cinephileScore != null) {
    tiers.push({ score: cinephileScore, weight: TIER_WEIGHT_CINEPHILE });
  }
  if (mainstreamScore != null) {
    tiers.push({ score: mainstreamScore, weight: TIER_WEIGHT_MAINSTREAM });
  }

  // Renormalize tier weights
  const totalTierWeight = tiers.reduce((sum, t) => sum + t.weight, 0);
  const finalScore = tiers.reduce(
    (sum, t) => sum + (t.weight / totalTierWeight) * t.score,
    0,
  );

  // Coverage: count-based (presentSources / 9)
  const coverage = sourceMap.size / WEIGHTED_SOURCE_KEYS.size;

  // Disagreement: unweighted std dev of raw normalized scores (not shrunk)
  const rawScores = [...sourceMap.values()].map((s) => s.normalized);
  const mean = rawScores.reduce((sum, v) => sum + v, 0) / rawScores.length;
  const variance =
    rawScores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / rawScores.length;
  const disagreement = Math.sqrt(variance);

  return { score: finalScore, coverage, disagreement };
}
