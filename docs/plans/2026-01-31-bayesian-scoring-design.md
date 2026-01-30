# Bayesian Movie Scoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace simple weighted average with Bayesian shrinkage algorithm that accounts for vote/review count reliability per metric.

**Architecture:** New `scoring.ts` module handles all Bayesian math. Fetchers are extended to return vote counts. The `runFetchers` function calls the new scoring module instead of the old `compositeScore`.

**Tech Stack:** TypeScript, Vitest for testing, Next.js API routes

---

## Constants Reference

```typescript
// Baselines (C_i) - shrink toward these for low-count scores
const BASELINES = {
  imdb: 64, letterboxd: 63, rotten_tomatoes_audience: 70,
  douban: 70, metacritic: 60, rotten_tomatoes_all: 75,
  rotten_tomatoes_top: 75, mubi: 65,
};

// Prior strengths (m_i) - votes needed before trusting raw score
const PRIOR_STRENGTHS = {
  imdb: 10000, letterboxd: 2000, rotten_tomatoes_audience: 2000,
  douban: 10000, metacritic: 20, rotten_tomatoes_all: 60,
  rotten_tomatoes_top: 40, mubi: 200,
};

// Weights (w_i) - sum to 1.0
const WEIGHTS = {
  metacritic: 0.18, letterboxd: 0.16, imdb: 0.15,
  rotten_tomatoes_top: 0.12, douban: 0.12, rotten_tomatoes_audience: 0.10,
  mubi: 0.09, rotten_tomatoes_all: 0.08,
};
```

---

### Task 1: Update SourceScore Type

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Add count field to SourceScore**

Open `src/lib/types.ts` and add `count` field:

```typescript
export type SourceScore = {
  source: SourceName;
  label: string;
  normalized: number | null;
  raw?: {
    value: number | null;
    scale: string;
  };
  count?: number | null;  // NEW: votes/ratings/reviews count
  url?: string;
  error?: string;
  fromFallback?: boolean;
};
```

**Step 2: Update ScorePayload type**

Replace the `composite` field with `overall` object:

```typescript
export type OverallScore = {
  score: number;
  confidence: number;
  disagreement: number;
};

export type ScorePayload = {
  movie: MovieInfo;
  sources: SourceScore[];
  overall: OverallScore | null;  // Changed from composite: number | null
  missingSources?: string[];
};
```

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add count to SourceScore, restructure ScorePayload"
```

---

### Task 2: Create Scoring Module with Tests

**Files:**
- Create: `src/lib/scoring.ts`
- Create: `src/lib/scoring.test.ts`

**Step 1: Write failing tests for computeReliability**

Create `src/lib/scoring.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scoring.test.ts`
Expected: FAIL with "Cannot find module './scoring'"

**Step 3: Write minimal implementation**

Create `src/lib/scoring.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/scoring.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/scoring.ts src/lib/scoring.test.ts
git commit -m "feat(scoring): add computeReliability with tests"
```

---

### Task 3: Add computeAdjustedScore

**Files:**
- Modify: `src/lib/scoring.ts`
- Modify: `src/lib/scoring.test.ts`

**Step 1: Write failing tests**

Add to `src/lib/scoring.test.ts`:

```typescript
import { computeReliability, computeAdjustedScore } from './scoring';

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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scoring.test.ts`
Expected: FAIL with "computeAdjustedScore is not exported"

**Step 3: Write implementation**

Add to `src/lib/scoring.ts`:

```typescript
export function computeAdjustedScore(
  rawScore: number,
  reliability: number,
  baseline: number
): number {
  return reliability * rawScore + (1 - reliability) * baseline;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/scoring.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/scoring.ts src/lib/scoring.test.ts
git commit -m "feat(scoring): add computeAdjustedScore"
```

---

### Task 4: Add computeOverallScore

**Files:**
- Modify: `src/lib/scoring.ts`
- Modify: `src/lib/scoring.test.ts`

**Step 1: Write failing tests**

Add to `src/lib/scoring.test.ts`:

```typescript
import { computeReliability, computeAdjustedScore, computeOverallScore } from './scoring';

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
```

Also add the import at top:

```typescript
import type { SourceScore } from './types';
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scoring.test.ts`
Expected: FAIL with "computeOverallScore is not exported"

**Step 3: Write implementation**

Add to `src/lib/scoring.ts`:

```typescript
// Baselines (C_i) - running averages, updated over time
let baselines: Record<string, number> = {
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

const BETA = 0.01; // baseline learning rate

export function computeOverallScore(scores: SourceScore[]): OverallScore | null {
  // Filter to metrics that have valid normalized scores and are in our weight set
  const valid = scores.filter(
    (s) => s.normalized != null && WEIGHTS[s.source] != null
  ) as Array<SourceScore & { normalized: number }>;

  if (valid.length === 0) return null;

  // Compute per-metric values
  const metrics = valid.map((s) => {
    const reliability = computeReliability(s.count, s.source);
    const baseline = baselines[s.source] ?? 65;
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
  const meanAdjusted = score; // same as weighted mean
  const variance =
    metrics.reduce((sum, m) => sum + Math.pow(m.adjusted - meanAdjusted, 2), 0) /
    metrics.length;
  const disagreement = Math.sqrt(variance);

  // Update baselines
  for (const m of metrics) {
    if (baselines[m.source] != null) {
      baselines[m.source] = (1 - BETA) * baselines[m.source] + BETA * m.adjusted;
    }
  }

  return { score, confidence, disagreement };
}

// For testing: reset baselines to initial values
export function resetBaselines(): void {
  baselines = {
    imdb: 64,
    letterboxd: 63,
    rotten_tomatoes_audience: 70,
    douban: 70,
    metacritic: 60,
    rotten_tomatoes_all: 75,
    rotten_tomatoes_top: 75,
    mubi: 65,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/scoring.test.ts`
Expected: PASS

**Step 5: Add beforeEach to reset baselines in tests**

Update test file to reset baselines between tests:

```typescript
import { computeReliability, computeAdjustedScore, computeOverallScore, resetBaselines } from './scoring';
import { beforeEach } from 'vitest';

beforeEach(() => {
  resetBaselines();
});
```

**Step 6: Commit**

```bash
git add src/lib/scoring.ts src/lib/scoring.test.ts
git commit -m "feat(scoring): add computeOverallScore with weight renormalization"
```

---

### Task 5: Extend OMDB to Return Vote Count

**Files:**
- Modify: `src/lib/omdb.ts`

**Step 1: Update OmdbMovie type and parseOmdbRatings**

In `src/lib/omdb.ts`, add `imdbVotes` to the type:

```typescript
type OmdbMovie = {
  Title: string;
  Year?: string;
  imdbID: string;
  Poster?: string;
  imdbRating?: string;
  imdbVotes?: string;  // NEW: e.g., "1,234,567"
  Metascore?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
};
```

Update `parseOmdbRatings` to return votes:

```typescript
export function parseOmdbRatings(movie: OmdbMovie) {
  let rottenTomatoes: number | null = null;
  if (movie.Ratings) {
    const rt = movie.Ratings.find((r) => r.Source === 'Rotten Tomatoes');
    if (rt?.Value?.endsWith('%')) {
      const n = Number(rt.Value.replace('%', ''));
      rottenTomatoes = Number.isFinite(n) ? n : null;
    }
  }
  const imdb = movie.imdbRating ? Number(movie.imdbRating) : null;
  const imdbVotes = movie.imdbVotes
    ? parseInt(movie.imdbVotes.replace(/,/g, ''), 10)
    : null;
  const metacritic = movie.Metascore ? Number(movie.Metascore) : null;
  return { imdb, imdbVotes, metacritic, rottenTomatoes };
}
```

**Step 2: Commit**

```bash
git add src/lib/omdb.ts
git commit -m "feat(omdb): extract imdbVotes from OMDB response"
```

---

### Task 6: Update fetchImdb to Include Vote Count

**Files:**
- Modify: `src/lib/fetchers.ts`

**Step 1: Update fetchImdb return type and implementation**

Find the `fetchImdb` function and update it to include count:

```typescript
async function fetchImdb(ctx: FetcherContext): Promise<{ score: SourceScore; fallback: OmdbFallback }> {
  const { omdbKey } = getApiKeys(ctx.env);
  if (!omdbKey) {
    return {
      score: { source: 'imdb', label: 'IMDb', normalized: null, error: 'Missing OMDB key' },
      fallback: {},
    };
  }
  try {
    const data = await fetchOmdbById(ctx.movie.imdbId, omdbKey);
    const ratings = parseOmdbRatings(data);
    const score = normalizeScore({
      source: 'imdb',
      label: 'IMDb',
      normalized: null,
      raw: { value: ratings.imdb, scale: '0-10' },
      count: ratings.imdbVotes,  // NEW: include vote count
      url: `https://www.imdb.com/title/${ctx.movie.imdbId}`,
    });
    return { score, fallback: { rt: ratings.rottenTomatoes, metacritic: ratings.metacritic } };
  } catch (err) {
    return {
      score: { source: 'imdb', label: 'IMDb', normalized: null, error: (err as Error).message },
      fallback: {},
    };
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/fetchers.ts
git commit -m "feat(fetchers): add vote count to IMDb scores"
```

---

### Task 7: Update fetchLetterboxd to Include Rating Count

**Files:**
- Modify: `src/lib/fetchers.ts`

**Step 1: Update fetchLetterboxd to extract ratingCount**

Find the `fetchLetterboxd` function and add count extraction:

```typescript
async function fetchLetterboxd(ctx: FetcherContext): Promise<SourceScore> {
  const slug = ctx.wikidata.letterboxd;
  if (!slug) {
    return { source: 'letterboxd', label: 'Letterboxd', normalized: null, error: 'No Letterboxd slug' };
  }
  try {
    const html = await fetchText(`https://letterboxd.com/film/${slug}/`, {
      headers: { accept: 'text/html', 'user-agent': BROWSER_UA },
    });
    // Extract rating from JSON-LD structured data
    const valueMatch = html.match(/"ratingValue"\s*:\s*([\d.]+)/);
    const countMatch = html.match(/"ratingCount"\s*:\s*(\d+)/);
    const value = valueMatch?.[1] ? Number(valueMatch[1]) : null;
    const count = countMatch?.[1] ? parseInt(countMatch[1], 10) : null;
    return normalizeScore({
      source: 'letterboxd',
      label: 'Letterboxd',
      normalized: null,
      raw: { value, scale: '0-5' },
      count,  // NEW
      url: `https://letterboxd.com/film/${slug}/`,
    });
  } catch (err) {
    return {
      source: 'letterboxd',
      label: 'Letterboxd',
      normalized: null,
      error: (err as Error).message,
    };
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/fetchers.ts
git commit -m "feat(fetchers): add rating count to Letterboxd scores"
```

---

### Task 8: Update fetchRottenTomatoes to Include Review Counts

**Files:**
- Modify: `src/lib/fetchers.ts`

**Step 1: Update RT HTML parsing to extract numReviews**

This is the most complex fetcher. Update the HTML scraping section to extract review counts for audience, all critics, and top critics. The embedded JSON looks like:

```json
"audienceAll":{"score":"85","numReviews":"50000+","averageRating":"4.2"}
"criticsAll":{"score":"92","numReviews":"320","averageRating":"8.1"}
"criticsTop":{"score":"88","numReviews":"52","averageRating":"7.9"}
```

Update the regex patterns in the HTML scrape fallback section:

```typescript
// Inside the try block for HTML scraping
const matchAudienceCount = html.match(/"audienceAll"[^}]*"numReviews"\s*:\s*"(\d+)/);
const matchAllCount = html.match(/"criticsAll"[^}]*"numReviews"\s*:\s*"(\d+)/);
const matchTopCount = html.match(/"criticsTop"[^}]*"numReviews"\s*:\s*"(\d+)/);

const audienceCount = matchAudienceCount?.[1] ? parseInt(matchAudienceCount[1], 10) : null;
const allCriticsCount = matchAllCount?.[1] ? parseInt(matchAllCount[1], 10) : null;
const topCriticsCount = matchTopCount?.[1] ? parseInt(matchTopCount[1], 10) : null;
```

Then include `count` when creating each SourceScore for RT Audience, RT All Critics, and RT Top Critics.

**Step 2: Commit**

```bash
git add src/lib/fetchers.ts
git commit -m "feat(fetchers): add review counts to Rotten Tomatoes scores"
```

---

### Task 9: Update fetchMetacritic to Include Review Count

**Files:**
- Modify: `src/lib/fetchers.ts`

**Step 1: Update fetchMetacritic to extract ratingCount**

```typescript
async function fetchMetacritic(ctx: FetcherContext, fallbackValue?: number | null): Promise<SourceScore> {
  const slug = ctx.wikidata.metacritic?.replace(/^movie\//, '');
  if (!slug) {
    if (fallbackValue != null) {
      return normalizeScore({
        source: 'metacritic',
        label: 'Metacritic',
        normalized: null,
        raw: { value: fallbackValue, scale: '0-100' },
        fromFallback: true,
        error: undefined,
      });
    }
    return {
      source: 'metacritic',
      label: 'Metacritic',
      normalized: null,
      error: 'No Metacritic slug',
    };
  }
  try {
    const html = await fetchText(`https://www.metacritic.com/movie/${slug}/`, {
      headers: { accept: 'text/html', 'user-agent': BROWSER_UA },
    });
    const valueMatch = html.match(/"ratingValue"\s*:\s*(\d+)/);
    const countMatch = html.match(/"ratingCount"\s*:\s*(\d+)/);
    const value = valueMatch ? Number(valueMatch[1]) : null;
    const count = countMatch?.[1] ? parseInt(countMatch[1], 10) : null;
    return normalizeScore({
      source: 'metacritic',
      label: 'Metacritic',
      normalized: null,
      raw: { value, scale: '0-100' },
      count,  // NEW
      url: `https://www.metacritic.com/movie/${slug}`,
    });
  } catch (err) {
    if (fallbackValue != null) {
      return normalizeScore({
        source: 'metacritic',
        label: 'Metacritic',
        normalized: null,
        raw: { value: fallbackValue, scale: '0-100' },
        fromFallback: true,
        error: undefined,
      });
    }
    return {
      source: 'metacritic',
      label: 'Metacritic',
      normalized: null,
      error: (err as Error).message,
    };
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/fetchers.ts
git commit -m "feat(fetchers): add review count to Metacritic scores"
```

---

### Task 10: Update fetchDouban to Include Vote Count

**Files:**
- Modify: `src/lib/fetchers.ts`

**Step 1: Update Douban API response type and extraction**

The `subject_abstract` API returns vote count. Update the type:

```typescript
type DoubanAbstractResponse = {
  r: number;
  subject?: {
    rate?: string;
    title?: string;
    votes?: string;  // NEW: e.g., "123456"
  };
};
```

Update `fetchDoubanRating` to return count:

```typescript
async function fetchDoubanRating(doubanId: string): Promise<{ rating: number | null; count: number | null }> {
  const data = await fetchJson<DoubanAbstractResponse>(
    `https://movie.douban.com/j/subject_abstract?subject_id=${doubanId}`,
    { headers: { 'user-agent': BROWSER_UA } },
    10000,
  );

  let rating: number | null = null;
  let count: number | null = null;

  if (data.subject?.rate) {
    rating = parseFloat(data.subject.rate);
    if (isNaN(rating)) rating = null;
  }

  if (data.subject?.votes) {
    count = parseInt(data.subject.votes, 10);
    if (isNaN(count)) count = null;
  }

  return { rating, count };
}
```

Then update `fetchDouban` to use the count:

```typescript
const { rating, count } = await fetchDoubanRating(doubanId);
// ...
return normalizeScore({
  source: 'douban',
  label: 'Douban',
  normalized: null,
  raw: { value: rating, scale: '0-10' },
  count,  // NEW
  url,
  fromFallback: method !== 'wikidata',
});
```

**Step 2: Commit**

```bash
git add src/lib/fetchers.ts
git commit -m "feat(fetchers): add vote count to Douban scores"
```

---

### Task 11: Update fetchMubi to Include Rating Count

**Files:**
- Modify: `src/lib/fetchers.ts`

**Step 1: Update fetchMubi to extract rating count**

The Mubi ratings page shows "Average rating: X.X/10 out of N ratings". Update the regex:

```typescript
async function fetchMubi(ctx: FetcherContext): Promise<SourceScore> {
  const mubiId = ctx.wikidata.mubi;
  if (!mubiId) {
    return {
      source: 'mubi',
      label: 'Mubi',
      normalized: null,
      error: 'No Mubi ID in Wikidata',
    };
  }

  const url = `https://mubi.com/en/films/${mubiId}/ratings`;

  try {
    const html = await fetchText(url, {
      headers: { 'user-agent': BROWSER_UA, accept: 'text/html' },
    });

    // Extract "Average rating: X.X/10 out of N ratings"
    const ratingMatch = html.match(/Average rating:\s*([\d.]+)\/10/);
    const countMatch = html.match(/out of\s+([\d,]+)\s*ratings/i);

    const value = ratingMatch?.[1] ? parseFloat(ratingMatch[1]) : null;
    const count = countMatch?.[1] ? parseInt(countMatch[1].replace(/,/g, ''), 10) : null;

    if (value != null && !isNaN(value)) {
      return normalizeScore({
        source: 'mubi',
        label: 'Mubi',
        normalized: null,
        raw: { value, scale: '0-10' },
        count,  // NEW
        url: `https://mubi.com/en/films/${mubiId}`,
      });
    }

    return {
      source: 'mubi',
      label: 'Mubi',
      normalized: null,
      url: `https://mubi.com/en/films/${mubiId}`,
      error: 'No rating found',
    };
  } catch (err) {
    return {
      source: 'mubi',
      label: 'Mubi',
      normalized: null,
      error: (err as Error).message,
    };
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/fetchers.ts
git commit -m "feat(fetchers): add rating count to Mubi scores"
```

---

### Task 12: Integrate New Scoring in runFetchers

**Files:**
- Modify: `src/lib/fetchers.ts`

**Step 1: Import new scoring module and update runFetchers**

Add import at top:

```typescript
import { computeOverallScore } from './scoring';
```

Update the end of `runFetchers` to use new scoring:

```typescript
export async function runFetchers(ctx: FetcherContext): Promise<ScorePayload> {
  // ... existing fetcher code ...

  const flattened = results.flatMap((r) => (Array.isArray(r) ? r : [r]));
  const normalized = flattened.map(normalizeScore);

  // NEW: Use Bayesian scoring instead of simple compositeScore
  const overall = computeOverallScore(normalized);

  const missingSources = normalized.filter((s) => s.normalized == null).map((s) => s.label);

  const payload: ScorePayload = { movie: ctx.movie, sources: normalized, overall, missingSources };
  scoreCache.set(cacheKey, payload);
  return payload;
}
```

Remove the old `compositeScore` import if no longer needed elsewhere.

**Step 2: Commit**

```bash
git add src/lib/fetchers.ts
git commit -m "feat(fetchers): integrate Bayesian scoring via computeOverallScore"
```

---

### Task 13: Update Tests

**Files:**
- Modify: `src/lib/fetchers.test.ts`
- Modify: `src/app/api/score/route.test.ts`

**Step 1: Update fetchers.test.ts mocks to include counts**

Update the mock to return vote counts in OMDB response:

```typescript
vi.mock('./http', () => {
  const fetchJson = vi.fn(async (url: string) => {
    if (url.includes('omdbapi'))
      return {
        imdbRating: '8.4',
        imdbVotes: '1,234,567',  // NEW
        Ratings: [{ Source: 'Rotten Tomatoes', Value: '86%' }],
        Metascore: '73',
      };
    // ... rest unchanged
  });
  // ... rest unchanged
});
```

Update the mock for fetchText to return counts in HTML:

```typescript
const fetchText = vi.fn(async (url: string) => {
  if (url.includes('letterboxd')) return '"ratingValue":4.1,"ratingCount":50000';
  if (url.includes('metacritic')) return '"ratingValue": 73,"ratingCount":42';
  if (url.includes('mubi.com/en/films/99999/ratings'))
    return '<meta name="description" content="Average rating: 8.5/10 out of 12,345 ratings">';
  // ... rest unchanged
});
```

**Step 2: Update assertions to check for overall instead of composite**

```typescript
it('returns normalized scores and overall', async () => {
  const res = await runFetchers(baseCtx);
  expect(res.sources).toHaveLength(6);
  // ... existing score checks ...
  expect(res.overall).not.toBeNull();
  expect(res.overall!.score).toBeGreaterThan(0);
  expect(res.overall!.confidence).toBeGreaterThan(0);
  expect(res.overall!.disagreement).toBeGreaterThanOrEqual(0);
});
```

**Step 3: Update route.test.ts mock**

```typescript
vi.mock('@/lib/fetchers', () => ({
  runFetchers: vi.fn(async ({ movie }) => ({
    movie,
    sources: [{ source: 'imdb', label: 'IMDb', normalized: 84, count: 100000 }],
    overall: { score: 84, confidence: 0.9, disagreement: 0 },
  })),
}));
```

Update assertion:

```typescript
expect(json.overall.score).toBe(84);
```

**Step 4: Run all tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/fetchers.test.ts src/app/api/score/route.test.ts
git commit -m "test: update tests for new scoring system with vote counts"
```

---

### Task 14: Remove Old compositeScore (Cleanup)

**Files:**
- Modify: `src/lib/normalize.ts`

**Step 1: Remove compositeScore function**

Delete the `compositeScore` function from `src/lib/normalize.ts` since it's no longer used.

**Step 2: Run tests to ensure nothing breaks**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/normalize.ts
git commit -m "chore: remove deprecated compositeScore function"
```

---

## Summary

14 tasks total:
1. Update types (SourceScore.count, ScorePayload.overall)
2. Create scoring module with computeReliability
3. Add computeAdjustedScore
4. Add computeOverallScore with weight renormalization
5. Extend OMDB for vote count
6. Update fetchImdb
7. Update fetchLetterboxd
8. Update fetchRottenTomatoes
9. Update fetchMetacritic
10. Update fetchDouban
11. Update fetchMubi
12. Integrate in runFetchers
13. Update tests
14. Remove old compositeScore
