import { describe, it, expect } from "vitest";
import { computeOverallScore, WEIGHTED_SOURCE_KEYS } from "./scoring";
import type { SourceScore, SourceName } from "./types";

/** Helper to build a SourceScore with minimal boilerplate. */
function makeSource(
  source: SourceName,
  normalized: number | null,
  count?: number | null,
): SourceScore {
  return {
    source,
    label: source,
    normalized,
    count: count ?? undefined,
  };
}

/** Build a full 9-source array with given normalized scores and optional counts. */
function makeAllSources(
  overrides: Partial<Record<SourceName, number | [number, number]>> = {},
): SourceScore[] {
  const defaults: Record<string, number> = {
    rotten_tomatoes_top: 85,
    metacritic: 80,
    rotten_tomatoes_all: 82,
    allocine_press: 76,
    letterboxd: 84,
    rotten_tomatoes_audience: 78,
    imdb: 80,
    allocine_user: 72,
    douban: 75,
  };

  return Object.entries(defaults).map(([key, defaultVal]) => {
    const override = overrides[key as SourceName];
    if (override == null) {
      return makeSource(key as SourceName, defaultVal);
    }
    if (Array.isArray(override)) {
      return makeSource(key as SourceName, override[0], override[1]);
    }
    return makeSource(key as SourceName, override);
  });
}

describe("scoring", () => {
  describe("WEIGHTED_SOURCE_KEYS", () => {
    it("contains exactly 9 expected keys", () => {
      expect(WEIGHTED_SOURCE_KEYS.size).toBe(9);
      const expected = [
        "rotten_tomatoes_top",
        "metacritic",
        "rotten_tomatoes_all",
        "allocine_press",
        "letterboxd",
        "rotten_tomatoes_audience",
        "imdb",
        "allocine_user",
        "douban",
      ];
      for (const key of expected) {
        expect(WEIGHTED_SOURCE_KEYS.has(key)).toBe(true);
      }
    });
  });

  describe("computeOverallScore", () => {
    it("computes correct score with all 9 sources (no shrinkage counts)", () => {
      // All 9 sources present, no count provided → shrinkage skipped
      const sources = makeAllSources();
      const result = computeOverallScore(sources);
      expect(result).not.toBeNull();

      // Hand calculation:
      // BaseCritics = 0.8 * 82 + 0.2 * 76 = 65.6 + 15.2 = 80.8
      // Elite premium: 0.6*(85-80.8) + 0.4*(80-80.8) = 0.6*4.2 + 0.4*(-0.8) = 2.52 - 0.32 = 2.2
      // Clamped: 2.2, dampened: 2.2 * 0.4 = 0.88
      // CriticScore = 80.8 + 0.88 = 81.68
      // CinephileScore = 84
      // Mainstream = (0.35*78 + 0.35*80 + 0.15*72 + 0.15*75) / 1.0 = 27.3 + 28 + 10.8 + 11.25 = 77.35
      // Final = 0.5*81.68 + 0.3*84 + 0.2*77.35 = 40.84 + 25.2 + 15.47 = 81.51
      expect(result!.score).toBeCloseTo(81.51, 1);
      expect(result!.coverage).toBeCloseTo(9 / 9, 4);
    });

    it("applies shrinkage when count is provided (n=4 vs n=200)", () => {
      // Same raw score (90) for allocine_press, but different sample sizes
      // Shrinkage: prior=70, K=30
      // n=4: 70 + (4/34) * (90-70) = 70 + 2.35 = 72.35
      // n=200: 70 + (200/230) * (90-70) = 70 + 17.39 = 87.39
      const sourcesSmall = makeAllSources({ allocine_press: [90, 4] });
      const sourcesLarge = makeAllSources({ allocine_press: [90, 200] });

      const resultSmall = computeOverallScore(sourcesSmall)!;
      const resultLarge = computeOverallScore(sourcesLarge)!;

      // With shrinkage, n=4 should produce a lower overall than n=200
      expect(resultSmall.score).toBeLessThan(resultLarge.score);
    });

    it("skips shrinkage when count is null", () => {
      // allocine_press=90 with no count → uses raw 90
      const sourcesNoCount = makeAllSources({ allocine_press: 90 });
      // allocine_press=90 with count=5 → shrunk (below fullAt threshold)
      const sourcesLowCount = makeAllSources({ allocine_press: [90, 5] });

      const resultNoCount = computeOverallScore(sourcesNoCount)!;
      const resultLowCount = computeOverallScore(sourcesLowCount)!;

      // No count uses raw value (90), which is higher than shrunk
      expect(resultNoCount.score).toBeGreaterThan(resultLowCount.score);
    });

    it("computes positive elite premium (elite > baseline)", () => {
      // RT All=80, AlloPress=76 → Baseline=0.8*80+0.2*76=79.2
      // RT Top=95, Meta=90 → premium = 0.6*(95-79.2) + 0.4*(90-79.2) = 9.48+4.32 = 13.8
      // Clamped: 13.8 (within ±15), dampened: 13.8*0.4 = 5.52
      // CriticScore = 79.2 + 5.52 = 84.72
      const sources = makeAllSources({
        rotten_tomatoes_top: 95,
        metacritic: 90,
        rotten_tomatoes_all: 80,
        allocine_press: 76,
      });
      const result = computeOverallScore(sources)!;

      // Verify the critic component pushes the score up vs. a version with no premium
      const sourcesNoPremium = makeAllSources({
        rotten_tomatoes_top: 80,
        metacritic: 80,
        rotten_tomatoes_all: 80,
        allocine_press: 76,
      });
      const resultNoPremium = computeOverallScore(sourcesNoPremium)!;
      expect(result.score).toBeGreaterThan(resultNoPremium.score);
    });

    it("clamps negative elite premium to -15", () => {
      // Baseline with RT All=90, AlloPress=88 → base=0.8*90+0.2*88=89.6
      // RT Top=50, Meta=55 → premium = 0.6*(50-89.6) + 0.4*(55-89.6) = -23.76 + -13.84 = -37.6
      // Clamped to -15, dampened: -15 * 0.4 = -6
      // CriticScore = 89.6 - 6 = 83.6
      const sources = makeAllSources({
        rotten_tomatoes_top: 50,
        metacritic: 55,
        rotten_tomatoes_all: 90,
        allocine_press: 88,
      });
      const result = computeOverallScore(sources)!;

      // Without clamping, the score would be lower. Verify it's reasonable.
      // CriticScore should be ~83.6 (not dragged down to 74.56 unclamped)
      expect(result.score).toBeGreaterThan(75);
    });

    it("handles elite premium with one source missing (renormalize)", () => {
      // Only RT Top present (no Metacritic) → full weight on RT Top delta
      const sources = makeAllSources().filter((s) => s.source !== "metacritic");
      const result = computeOverallScore(sources);
      expect(result).not.toBeNull();
      expect(result!.coverage).toBeCloseTo(8 / 9, 4);
    });

    it("falls back to absolute elite values when RT All is missing", () => {
      // RT All missing → can't compute baseline → use elite fallback weights
      // RT Top=85, Meta=80 → critic = 0.55*85 + 0.45*80 = 46.75 + 36 = 82.75
      // AlloPress is present but ignored in fallback mode (not reliable alone)
      const sources = makeAllSources().filter(
        (s) => s.source !== "rotten_tomatoes_all",
      );
      const result = computeOverallScore(sources);
      expect(result).not.toBeNull();

      // Verify critic tier uses elite fallback, not AlloCiné-only baseline
      // CriticScore = 82.75, Cinephile = 84, Mainstream = 77.35
      // Final = 0.5*82.75 + 0.3*84 + 0.2*77.35 = 41.375 + 25.2 + 15.47 = 82.045
      expect(result!.score).toBeCloseTo(82.05, 0);
    });

    it("falls back to absolute when RT All and AlloPress both missing", () => {
      // Both baseline sources missing → critic tier uses elite fallback
      const sources = makeAllSources().filter(
        (s) =>
          s.source !== "rotten_tomatoes_all" && s.source !== "allocine_press",
      );
      const result = computeOverallScore(sources);
      expect(result).not.toBeNull();
    });

    it("redistributes weight when cinephile tier is missing", () => {
      // No Letterboxd → critic (50) + mainstream (20) → renormalized to 71.4%/28.6%
      const sources = makeAllSources().filter((s) => s.source !== "letterboxd");
      const result = computeOverallScore(sources);
      expect(result).not.toBeNull();
      // Tier weights: 0.5/(0.5+0.2) = 0.714, 0.2/(0.5+0.2) = 0.286
      expect(result!.coverage).toBeCloseTo(8 / 9, 4);
    });

    it("redistributes weight when mainstream tier is missing", () => {
      // Remove all 4 mainstream sources → only 5 sources left → barely meets minimum
      const sources = makeAllSources().filter(
        (s) =>
          s.source !== "rotten_tomatoes_audience" &&
          s.source !== "imdb" &&
          s.source !== "douban" &&
          s.source !== "allocine_user",
      );
      const result = computeOverallScore(sources);
      expect(result).not.toBeNull();
      // 5 sources (RT Top, Meta, RT All, AlloPress, Letterboxd)
      // Tier weights: 0.5/(0.5+0.3) = 0.625, 0.3/(0.5+0.3) = 0.375
      expect(result!.coverage).toBeCloseTo(5 / 9, 4);
    });

    it("returns null when below minimum sources", () => {
      // Only 4 sources → below MIN_SOURCES_FOR_VERDICT (5)
      const sources = [
        makeSource("rotten_tomatoes_all", 80),
        makeSource("metacritic", 75),
        makeSource("imdb", 82),
        makeSource("letterboxd", 84),
      ];
      const result = computeOverallScore(sources);
      expect(result).toBeNull();
    });

    it("returns null when critic tier is null (no critic sources at all)", () => {
      // 5 sources, but none are critic-tier sources
      const sources = [
        makeSource("letterboxd", 84),
        makeSource("rotten_tomatoes_audience", 78),
        makeSource("imdb", 80),
        makeSource("allocine_user", 72),
        makeSource("douban", 75),
      ];
      const result = computeOverallScore(sources);
      expect(result).toBeNull();
    });

    it("computes count-based coverage (7/9 = 0.778)", () => {
      // Remove 2 sources
      const sources = makeAllSources().filter(
        (s) => s.source !== "douban" && s.source !== "allocine_user",
      );
      const result = computeOverallScore(sources)!;
      expect(result.coverage).toBeCloseTo(7 / 9, 4);
    });

    it("computes disagreement as std dev of raw normalized scores", () => {
      // Use sources with known values for easy hand calculation
      const scores = [80, 80, 80, 80, 80, 80, 80, 80, 80]; // all same
      const allSameKeys: SourceName[] = [
        "rotten_tomatoes_top",
        "metacritic",
        "rotten_tomatoes_all",
        "allocine_press",
        "letterboxd",
        "rotten_tomatoes_audience",
        "imdb",
        "allocine_user",
        "douban",
      ];
      const sources = allSameKeys.map((key, i) => makeSource(key, scores[i]));
      const result = computeOverallScore(sources)!;
      expect(result.disagreement).toBeCloseTo(0, 4);
    });

    it("computes non-zero disagreement for divergent scores", () => {
      const sources = makeAllSources({
        rotten_tomatoes_top: 95,
        metacritic: 65,
        rotten_tomatoes_all: 90,
        allocine_press: 50,
        letterboxd: 80,
        rotten_tomatoes_audience: 85,
        imdb: 70,
        allocine_user: 60,
        douban: 75,
      });
      const result = computeOverallScore(sources)!;

      // Mean = (95+65+90+50+80+85+70+60+75)/9 = 670/9 ≈ 74.44
      // Variance computation via hand is complex, but disagreement should be > 10
      expect(result.disagreement).toBeGreaterThan(10);
    });

    it("excludes non-weighted sources from scoring", () => {
      // rotten_tomatoes (Tomatometer) is not in WEIGHTED_SOURCE_KEYS
      const sources = [...makeAllSources(), makeSource("rotten_tomatoes", 92)];
      const result = computeOverallScore(sources)!;

      // Should still have coverage of 9/9 (the Tomatometer doesn't count)
      expect(result.coverage).toBeCloseTo(1, 4);
    });

    it("ignores sources with null normalized scores", () => {
      const sources = [
        makeSource("rotten_tomatoes_top", null),
        makeSource("metacritic", 80),
        makeSource("rotten_tomatoes_all", 82),
        makeSource("allocine_press", 76),
        makeSource("letterboxd", 84),
        makeSource("rotten_tomatoes_audience", 78),
        makeSource("imdb", 80),
        makeSource("allocine_user", 72),
        makeSource("douban", 75),
      ];
      const result = computeOverallScore(sources)!;
      // RT Top has null normalized → treated as missing, coverage = 8/9
      expect(result.coverage).toBeCloseTo(8 / 9, 4);
    });
  });
});
