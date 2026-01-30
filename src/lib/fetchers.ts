import { fetchJson, fetchText } from './http';
import { normalizeScore } from './normalize';
import { computeOverallScore } from './scoring';
import type { MovieInfo, ScorePayload, SourceScore, WikidataIds } from './types';
import { MemoryCache } from './cache';
import { getApiKeys } from './config';
import { fetchOmdbById, parseOmdbRatings } from './omdb';

type FetcherContext = {
  movie: MovieInfo;
  wikidata: WikidataIds;
  env: Record<string, string | undefined>;
};

type OmdbFallback = { rt?: number | null; metacritic?: number | null };

function slugifyTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/g, '')
    .trim()
    .replace(/\\s+/g, '_');
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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
      count: ratings.imdbVotes,
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

// Mubi slug fallback: lowercase, replace non-alphanumeric with hyphens
function slugifyForMubi(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchMubi(ctx: FetcherContext): Promise<SourceScore> {
  // Prefer Wikidata ID (numeric), fall back to title slug
  const mubiId = ctx.wikidata.mubi;
  if (!mubiId) {
    // No Wikidata ID - skip Mubi to avoid wrong matches with slug
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
        count,
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

async function fetchRottenTomatoes(
  ctx: FetcherContext,
  fallbackValue?: number | null,
): Promise<SourceScore[]> {
  // Wikidata P1258 may include the "m/" prefix, strip it if present
  let slug = ctx.wikidata.rottenTomatoes?.replace(/^m\//, '') || slugifyTitle(ctx.movie.title);
  try {
    const apiUrl = `https://www.rottentomatoes.com/napi/movie/${slug}`;
    const json = await fetchJson<{ meterScore?: number }>(apiUrl, {
      headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
    });
    let value = json.meterScore ?? null;

    let avgAll: number | null = null;
    let avgTop: number | null = null;

    // If percentage missing, fall back to average rating scraped from HTML (0-10 -> convert)
    let allCriticsCount: number | null = null;
    let topCriticsCount: number | null = null;

    if (value == null) {
      const html = await fetchText(`https://www.rottentomatoes.com/m/${slug}`, {
        headers: { accept: 'text/html', 'user-agent': BROWSER_UA },
      });
      const matchAll = html.match(/"criticsAll"[^}]*"averageRating"\\s*:\\s*"([\\d.]+)"/);
      const matchTop = html.match(/"criticsTop"[^}]*"averageRating"\\s*:\\s*"([\\d.]+)"/);
      if (matchAll?.[1]) avgAll = Number(matchAll[1]) * 10;
      if (matchTop?.[1]) avgTop = Number(matchTop[1]) * 10;
      if (avgAll != null) value = avgAll;

      // Extract review counts
      const matchAllCount = html.match(/"criticsAll"[^}]*"numReviews"\s*:\s*"(\d+)/);
      const matchTopCount = html.match(/"criticsTop"[^}]*"numReviews"\s*:\s*"(\d+)/);
      allCriticsCount = matchAllCount?.[1] ? parseInt(matchAllCount[1], 10) : null;
      topCriticsCount = matchTopCount?.[1] ? parseInt(matchTopCount[1], 10) : null;
    }

    const scores: SourceScore[] = [];

    scores.push(
      normalizeScore({
        source: 'rotten_tomatoes',
        label: 'RT Tomatometer',
        normalized: null,
        raw: { value, scale: '0-100' },
        count: allCriticsCount,
        url: `https://www.rottentomatoes.com/m/${slug}`,
      }),
    );

    if (avgAll != null) {
      scores.push(
        normalizeScore({
          source: 'rotten_tomatoes_all',
          label: 'RT Critics Avg (All)',
          normalized: null,
          raw: { value: avgAll, scale: '0-100' },
          count: allCriticsCount,
          url: `https://www.rottentomatoes.com/m/${slug}`,
        }),
      );
    }

    if (avgTop != null) {
      scores.push(
        normalizeScore({
          source: 'rotten_tomatoes_top',
          label: 'RT Critics Avg (Top)',
          normalized: null,
          raw: { value: avgTop, scale: '0-100' },
          count: topCriticsCount,
          url: `https://www.rottentomatoes.com/m/${slug}`,
        }),
      );
    }

    return scores;
  } catch (err) {
    // Try HTML scrape even if API failed (404/403/etc.)
    try {
      const html = await fetchText(`https://www.rottentomatoes.com/m/${slug}`, {
        headers: { accept: 'text/html', 'user-agent': BROWSER_UA },
      });
      // Extract scores from JSON embedded in HTML
      const matchScore = html.match(/"criticsAll"[^}]*"score"\s*:\s*"(\d+)"/);
      const matchAll = html.match(/"criticsAll"[^}]*"averageRating"\s*:\s*"([\d.]+)"/);
      const matchTop = html.match(/"criticsTop"[^}]*"averageRating"\s*:\s*"([\d.]+)"/);
      const matchAudience = html.match(/"audienceAll"[^}]*"averageRating"\s*:\s*"([\d.]+)"/);
      const tomatometer = matchScore?.[1] ? Number(matchScore[1]) : null;
      const avgAll = matchAll?.[1] ? Number(matchAll[1]) * 10 : null;
      const avgTop = matchTop?.[1] ? Number(matchTop[1]) * 10 : null;
      const audienceAvg = matchAudience?.[1] ? Number(matchAudience[1]) : null;

      // Extract review counts (numReviews may have "+" suffix which regex strips)
      const matchAudienceCount = html.match(/"audienceAll"[^}]*"numReviews"\s*:\s*"(\d+)/);
      const matchAllCount = html.match(/"criticsAll"[^}]*"numReviews"\s*:\s*"(\d+)/);
      const matchTopCount = html.match(/"criticsTop"[^}]*"numReviews"\s*:\s*"(\d+)/);
      const audienceCount = matchAudienceCount?.[1] ? parseInt(matchAudienceCount[1], 10) : null;
      const allCriticsCount = matchAllCount?.[1] ? parseInt(matchAllCount[1], 10) : null;
      const topCriticsCount = matchTopCount?.[1] ? parseInt(matchTopCount[1], 10) : null;

      if (tomatometer != null || avgAll != null || avgTop != null || audienceAvg != null) {
        const scores: SourceScore[] = [];
        // Always include Tomatometer first if available
        if (tomatometer != null) {
          scores.push(
            normalizeScore({
              source: 'rotten_tomatoes',
              label: 'RT Tomatometer',
              normalized: null,
              raw: { value: tomatometer, scale: '0-100' },
              count: allCriticsCount,
              url: `https://www.rottentomatoes.com/m/${slug}`,
            }),
          );
        }
        if (audienceAvg != null) {
          scores.push(
            normalizeScore({
              source: 'rotten_tomatoes_audience',
              label: 'RT Audience',
              normalized: null,
              raw: { value: audienceAvg, scale: '0-5' },
              count: audienceCount,
              url: `https://www.rottentomatoes.com/m/${slug}`,
            }),
          );
        }
        if (avgAll != null) {
          scores.push(
            normalizeScore({
              source: 'rotten_tomatoes_all',
              label: 'RT Critics Avg (All)',
              normalized: null,
              raw: { value: avgAll, scale: '0-100' },
              count: allCriticsCount,
              url: `https://www.rottentomatoes.com/m/${slug}`,
            }),
          );
        }
        if (avgTop != null) {
          scores.push(
            normalizeScore({
              source: 'rotten_tomatoes_top',
              label: 'RT Critics Avg (Top)',
              normalized: null,
              raw: { value: avgTop, scale: '0-100' },
              count: topCriticsCount,
              url: `https://www.rottentomatoes.com/m/${slug}`,
            }),
          );
        }
        return scores;
      }
    } catch (scrapeErr) {
      console.error('[RT HTML scrape failed]', (scrapeErr as Error).message);
      // fall through to OMDB fallback
    }

    if (fallbackValue != null) {
      return [
        normalizeScore({
          source: 'rotten_tomatoes',
          label: 'RT Tomatometer',
          normalized: null,
          raw: { value: fallbackValue, scale: '0-100' },
          fromFallback: true,
          error: undefined,
        }),
      ];
    }
    return [
      {
        source: 'rotten_tomatoes',
        label: 'RT Tomatometer',
        normalized: null,
        error: (err as Error).message,
      },
    ];
  }
}

async function fetchMetacritic(ctx: FetcherContext, fallbackValue?: number | null): Promise<SourceScore> {
  // Wikidata P1712 may include "movie/" prefix, strip it if present
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
    // Extract from JSON-LD structured data
    const valueMatch = html.match(/"ratingValue"\s*:\s*(\d+)/);
    const countMatch = html.match(/"ratingCount"\s*:\s*(\d+)/);
    const value = valueMatch ? Number(valueMatch[1]) : null;
    const count = countMatch?.[1] ? parseInt(countMatch[1], 10) : null;
    return normalizeScore({
      source: 'metacritic',
      label: 'Metacritic',
      normalized: null,
      raw: { value, scale: '0-100' },
      count,
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
      count,
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

// ─────────────────────────────────────────────────────────────────────────────
// Douban fetcher with 5-method waterfall for ID resolution
// ─────────────────────────────────────────────────────────────────────────────

type DoubanIdResult = { id: string | null; method: string };

// Method 1: Wikidata (already fetched via ctx.wikidata.douban)
function getDoubanIdFromWikidata(wikidataId?: string): DoubanIdResult {
  if (wikidataId) {
    return { id: wikidataId, method: 'wikidata' };
  }
  return { id: null, method: 'wikidata' };
}

// Method 2: Douban Suggest API (JSON endpoint) - try IMDb ID first, then title
async function getDoubanIdFromSuggestApi(imdbId: string, title?: string): Promise<DoubanIdResult> {
  try {
    // First try with IMDb ID
    const rawImdbId = imdbId.replace(/^tt/, '');
    let data = await fetchJson<Array<{ id?: string; episode?: string; sub_title?: string }>>(
      `https://movie.douban.com/j/subject_suggest?q=tt${rawImdbId}`,
      { headers: { 'user-agent': BROWSER_UA } },
      4000,
    );

    // Check if response contains the IMDb ID (confirms match)
    const jsonStr = JSON.stringify(data);
    if (jsonStr.includes(rawImdbId) && data[0]?.id) {
      return { id: data[0].id, method: 'suggest_api' };
    }

    // Fallback: try with movie title if provided
    if (title && data.length === 0) {
      data = await fetchJson<Array<{ id?: string; episode?: string; sub_title?: string }>>(
        `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(title)}`,
        { headers: { 'user-agent': BROWSER_UA } },
        4000,
      );
      // Match by sub_title (English title) to avoid wrong matches
      const match = data.find((item) => item.sub_title?.toLowerCase() === title.toLowerCase());
      if (match?.id) {
        return { id: match.id, method: 'suggest_api' };
      }
    }

    return { id: null, method: 'suggest_api' };
  } catch {
    return { id: null, method: 'suggest_api' };
  }
}

// Method 3: Douban Subject Search (HTML scraping)
async function getDoubanIdFromSubjectSearch(imdbId: string): Promise<DoubanIdResult> {
  try {
    const rawImdbId = imdbId.replace(/^tt/, '');
    const html = await fetchText(
      `https://movie.douban.com/subject_search?search_text=tt${rawImdbId}`,
      { headers: { 'user-agent': BROWSER_UA, accept: 'text/html' } },
      4000,
    );
    const match = html.match(/subject\/(\d+)/);
    if (match?.[1]) {
      return { id: match[1], method: 'subject_search' };
    }
    return { id: null, method: 'subject_search' };
  } catch {
    return { id: null, method: 'subject_search' };
  }
}

// Method 4: Douban Global Search (looks for IMDb ID in onclick attributes)
async function getDoubanIdFromGlobalSearch(imdbId: string): Promise<DoubanIdResult> {
  try {
    const rawImdbId = imdbId.replace(/^tt/, '');
    const html = await fetchText(
      `https://www.douban.com/search?cat=1002&q=tt${rawImdbId}`,
      { headers: { 'user-agent': BROWSER_UA, accept: 'text/html' } },
      8000,
    );
    // Look for subject ID in URL-encoded format (from onclick or href)
    const match = html.match(/subject%2F(\d+)/);
    if (match?.[1]) {
      return { id: match[1], method: 'global_search' };
    }
    // Also try direct subject link format
    const directMatch = html.match(/movie\.douban\.com\/subject\/(\d+)/);
    if (directMatch?.[1]) {
      return { id: directMatch[1], method: 'global_search' };
    }
    return { id: null, method: 'global_search' };
  } catch {
    return { id: null, method: 'global_search' };
  }
}

// Method 5: Google Search (last resort when Douban blocks)
async function getDoubanIdFromGoogle(imdbId: string): Promise<DoubanIdResult> {
  try {
    const html = await fetchText(
      `https://www.google.com/search?q=%22${imdbId}%22+site:movie.douban.com/subject&safe=off`,
      { headers: { 'user-agent': BROWSER_UA, accept: 'text/html' } },
      10000,
    );
    // Extract Douban subject ID from Google results
    const match = html.match(/movie\.douban\.com\/subject\/(\d+)/);
    if (match?.[1]) {
      return { id: match[1], method: 'google' };
    }
    return { id: null, method: 'google' };
  } catch {
    return { id: null, method: 'google' };
  }
}

// Waterfall: try each method in order until one succeeds
async function resolveDoubanId(imdbId: string, wikidataDoubanId?: string, title?: string): Promise<DoubanIdResult> {
  // 1. Wikidata (already fetched, safest)
  const wikiResult = getDoubanIdFromWikidata(wikidataDoubanId);
  if (wikiResult.id) return wikiResult;

  // 2. Douban Suggest API (tries IMDb ID, then title)
  const suggestResult = await getDoubanIdFromSuggestApi(imdbId, title);
  if (suggestResult.id) return suggestResult;

  // 3. Douban Subject Search
  const subjectResult = await getDoubanIdFromSubjectSearch(imdbId);
  if (subjectResult.id) return subjectResult;

  // 4. Douban Global Search
  const globalResult = await getDoubanIdFromGlobalSearch(imdbId);
  if (globalResult.id) return globalResult;

  // 5. Google Search (last resort)
  const googleResult = await getDoubanIdFromGoogle(imdbId);
  if (googleResult.id) return googleResult;

  return { id: null, method: 'none' };
}

// Douban subject_abstract API response type
type DoubanAbstractResponse = {
  r: number;
  subject?: {
    rate?: string; // e.g. "9.4"
    title?: string;
    votes?: string; // e.g., "123456"
  };
};

// Fetch rating from Douban's subject_abstract JSON API (avoids JS challenge on HTML pages)
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

async function fetchDouban(ctx: FetcherContext): Promise<SourceScore> {
  try {
    // Resolve Douban ID using waterfall (Wikidata → Suggest API → Subject Search → Global Search → Google)
    const { id: doubanId, method } = await resolveDoubanId(ctx.movie.imdbId, ctx.wikidata.douban, ctx.movie.title);

    if (!doubanId) {
      return {
        source: 'douban',
        label: 'Douban',
        normalized: null,
        error: 'Could not find Douban ID',
      };
    }

    // Fetch rating from JSON API (HTML pages have JS challenge)
    const { rating, count } = await fetchDoubanRating(doubanId);
    const url = `https://movie.douban.com/subject/${doubanId}/`;

    if (rating == null) {
      return {
        source: 'douban',
        label: 'Douban',
        normalized: null,
        url,
        error: 'No rating found',
      };
    }

    return normalizeScore({
      source: 'douban',
      label: 'Douban',
      normalized: null,
      raw: { value: rating, scale: '0-10' },
      count,
      url,
      // Include which method found the ID (useful for debugging)
      fromFallback: method !== 'wikidata',
    });
  } catch (err) {
    return {
      source: 'douban',
      label: 'Douban',
      normalized: null,
      error: (err as Error).message,
    };
  }
}

export async function runFetchers(ctx: FetcherContext): Promise<ScorePayload> {
  const cacheKey = ctx.movie.imdbId;
  const cached = scoreCache.get(cacheKey);
  if (cached) return cached;

  // Fetch ALL sources in parallel (no waiting for IMDb first)
  const [imdbResult, rtScores, metacriticScore, letterboxdScore, mubiScore, doubanScore] = await Promise.all([
    fetchImdb(ctx),
    fetchRottenTomatoes(ctx), // No fallback passed - apply post-hoc if needed
    fetchMetacritic(ctx),     // No fallback passed - apply post-hoc if needed
    fetchLetterboxd(ctx),
    fetchMubi(ctx),
    fetchDouban(ctx),
  ]);

  // Apply OMDB fallbacks post-hoc if direct fetches failed
  let finalRtScores = rtScores;
  let finalMetacriticScore = metacriticScore;

  // RT: If all scores have errors and we have OMDB fallback, use it
  const rtAllFailed = rtScores.every((s) => s.error != null);
  if (rtAllFailed && imdbResult.fallback.rt != null) {
    finalRtScores = [
      normalizeScore({
        source: 'rotten_tomatoes',
        label: 'RT Tomatometer',
        normalized: null,
        raw: { value: imdbResult.fallback.rt, scale: '0-100' },
        fromFallback: true,
      }),
    ];
  }

  // Metacritic: If failed and we have OMDB fallback, use it
  if (metacriticScore.error != null && imdbResult.fallback.metacritic != null) {
    finalMetacriticScore = normalizeScore({
      source: 'metacritic',
      label: 'Metacritic',
      normalized: null,
      raw: { value: imdbResult.fallback.metacritic, scale: '0-100' },
      fromFallback: true,
    });
  }

  const results: Array<SourceScore | SourceScore[]> = [
    imdbResult.score,
    finalRtScores,
    finalMetacriticScore,
    letterboxdScore,
    mubiScore,
    doubanScore,
  ];

  const flattened = results.flatMap((r) => (Array.isArray(r) ? r : [r]));
  const normalized = flattened.map(normalizeScore);

  // Use Bayesian scoring
  const overall = computeOverallScore(normalized);

  const missingSources = normalized.filter((s) => s.normalized == null).map((s) => s.label);

  const payload: ScorePayload = { movie: ctx.movie, sources: normalized, overall, missingSources };
  scoreCache.set(cacheKey, payload);
  return payload;
}

const scoreCache = new MemoryCache<ScorePayload>(5 * 60 * 1000); // 5 minutes
