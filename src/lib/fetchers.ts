import { fetchJson, fetchText } from "./http";
import { log } from "./logger";
import { normalizeScore } from "./normalize";
import { computeOverallScore } from "./scoring";
import { persistScores } from "@/db/persist";
import type {
  MovieInfo,
  ScorePayload,
  SourceScore,
  WikidataIds,
} from "./types";
import { MemoryCache } from "./cache";
import { getApiKeys } from "./config";
import { fetchOmdbByIdWithRotation, parseOmdbRatings } from "./omdb";
import {
  parseImdbHtml,
  parseLetterboxdHtml,
  parseMetacriticHtml,
  parseMetacriticBadge,
  parseDoubanSubjectSearchHtml,
  parseDoubanGlobalSearchHtml,
  parseGoogleDoubanSearchHtml,
  parseRTApiResponse,
  parseRTCriticsHtml,
  parseRTAudienceHtml,
  parseAllocineHtml,
  parseImdbThemes,
  parseImdbSummary,
  parseRTConsensus,
  parseImdbCriticReviewsHtml,
} from "./parsers";
import type { ImdbTheme, RTConsensus } from "./types";

type FetcherContext = {
  movie: MovieInfo;
  wikidata: WikidataIds;
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  kvGet?: (imdbId: string) => Promise<ScorePayload | null>;
  kvSet?: (
    imdbId: string,
    payload: ScorePayload,
    releaseDate: string | undefined,
    movieYear: string | undefined,
  ) => Promise<void>;
};

type OmdbFallback = { rt?: number | null; metacritic?: number | null };

function slugifyTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/g, "")
    .trim()
    .replace(/\\s+/g, "_");
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function fetchImdb(ctx: FetcherContext): Promise<{
  score: SourceScore;
  fallback: OmdbFallback;
  themes: ImdbTheme[];
  summary: string | null;
}> {
  const { omdbKeys } = getApiKeys(ctx.env);
  const imdbUrl = `https://www.imdb.com/title/${ctx.movie.imdbId}`;

  // Always fetch IMDb HTML for themes and summary (only exist in HTML, not APIs)
  let themes: ImdbTheme[] = [];
  let summary: string | null = null;
  try {
    const html = await fetchText(imdbUrl, {
      headers: {
        "user-agent": BROWSER_UA,
        "accept-language": "en-US,en;q=0.9",
      },
      signal: ctx.signal,
    });
    themes = parseImdbThemes(html);
    summary = parseImdbSummary(html);

    // Also try to parse rating from HTML as a fallback
    const parsed = parseImdbHtml(html);
    if (parsed.value != null) {
      // If we got rating from HTML, use it directly (skip OMDB)
      return {
        score: normalizeScore({
          source: "imdb",
          label: "IMDb",
          normalized: null,
          raw: { value: parsed.value, scale: "0-10" },
          count: parsed.count,
          url: imdbUrl,
        }),
        fallback: {},
        themes,
        summary,
      };
    }
  } catch {
    // HTML scrape failed, will try OMDB below
  }

  // Layer 2: OMDB API fallback for rating (themes/summary already extracted above)
  if (omdbKeys.length > 0) {
    try {
      const data = await fetchOmdbByIdWithRotation(
        ctx.movie.imdbId,
        omdbKeys,
        ctx.signal,
      );
      const ratings = parseOmdbRatings(data);
      if (ratings.imdb != null && !isNaN(ratings.imdb)) {
        const score = normalizeScore({
          source: "imdb",
          label: "IMDb",
          normalized: null,
          raw: { value: ratings.imdb, scale: "0-10" },
          count: ratings.imdbVotes,
          url: imdbUrl,
        });
        return {
          score,
          fallback: {
            rt: ratings.rottenTomatoes,
            metacritic: ratings.metacritic,
          },
          themes,
          summary,
        };
      }
    } catch {
      // All OMDB keys failed
    }
  }

  return {
    score: {
      source: "imdb",
      label: "IMDb",
      normalized: null,
      url: imdbUrl,
      error: "No rating data available",
    },
    fallback: {},
    themes,
    summary,
  };
}

// Letterboxd slug fallback: title-year format (e.g., "the-wrecking-crew-2026")
function slugifyForLetterboxd(title: string, year?: string) {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return year ? `${titleSlug}-${year}` : titleSlug;
}

async function fetchAllocine(ctx: FetcherContext): Promise<SourceScore[]> {
  const filmId = ctx.wikidata.allocineFilm;
  const seriesId = ctx.wikidata.allocineSeries;

  const id = filmId || seriesId;
  if (!id) {
    return [
      {
        source: "allocine_press",
        label: "AlloCiné Press",
        normalized: null,
        error: "No AlloCiné ID",
      },
      {
        source: "allocine_user",
        label: "AlloCiné User",
        normalized: null,
        error: "No AlloCiné ID",
      },
    ];
  }

  const isFilm = !!filmId;
  const url = isFilm
    ? `https://www.allocine.fr/film/fichefilm_gen_cfilm=${id}.html`
    : `https://www.allocine.fr/series/ficheserie_gen_cserie=${id}.html`;

  try {
    const html = await fetchText(url, {
      headers: { "user-agent": BROWSER_UA },
      signal: ctx.signal,
    });
    const { press, user } = parseAllocineHtml(html);

    return [
      normalizeScore({
        source: "allocine_press",
        label: "AlloCiné Press",
        normalized: null,
        raw:
          press.value != null
            ? { value: press.value, scale: "0-5" }
            : undefined,
        count: press.count,
        url,
      }),
      normalizeScore({
        source: "allocine_user",
        label: "AlloCiné User",
        normalized: null,
        raw:
          user.value != null ? { value: user.value, scale: "0-5" } : undefined,
        count: user.count,
        url,
      }),
    ];
  } catch (err) {
    return [
      {
        source: "allocine_press",
        label: "AlloCiné Press",
        normalized: null,
        error: (err as Error).message,
      },
      {
        source: "allocine_user",
        label: "AlloCiné User",
        normalized: null,
        error: (err as Error).message,
      },
    ];
  }
}

async function fetchRottenTomatoes(
  ctx: FetcherContext,
  fallbackValue?: number | null,
): Promise<{ scores: SourceScore[]; consensus: RTConsensus }> {
  // Wikidata P1258 may include the "m/" prefix, strip it if present
  const slug =
    ctx.wikidata.rottenTomatoes?.replace(/^m\//, "") ||
    slugifyTitle(ctx.movie.title);
  try {
    const apiUrl = `https://www.rottentomatoes.com/napi/movie/${slug}`;
    const json = await fetchJson<{ meterScore?: number }>(apiUrl, {
      headers: { "user-agent": BROWSER_UA, accept: "application/json" },
      signal: ctx.signal,
    });
    const apiParsed = parseRTApiResponse(json);
    let value = apiParsed.tomatometer;

    let avgAll: number | null = null;
    let avgTop: number | null = null;
    let allCriticsCount: number | null = null;
    let topCriticsCount: number | null = null;
    let consensus: RTConsensus = {};
    let badge: string | undefined = undefined;

    // If percentage missing, fall back to average rating scraped from HTML
    if (value == null) {
      const html = await fetchText(`https://www.rottentomatoes.com/m/${slug}`, {
        headers: { accept: "text/html", "user-agent": BROWSER_UA },
        signal: ctx.signal,
      });
      const criticsParsed = parseRTCriticsHtml(html);
      avgAll = criticsParsed.criticsAvgAll;
      avgTop = criticsParsed.criticsAvgTop;
      allCriticsCount = criticsParsed.allCriticsCount;
      topCriticsCount = criticsParsed.topCriticsCount;
      badge = criticsParsed.badge ?? undefined;
      consensus = parseRTConsensus(html);
      if (avgAll != null) value = avgAll;
    }

    const scores: SourceScore[] = [];

    scores.push(
      normalizeScore({
        source: "rotten_tomatoes",
        label: "RT Tomatometer",
        normalized: null,
        raw: { value, scale: "0-100" },
        count: allCriticsCount,
        url: `https://www.rottentomatoes.com/m/${slug}`,
        badge,
      }),
    );

    if (avgAll != null) {
      scores.push(
        normalizeScore({
          source: "rotten_tomatoes_all",
          label: "RT Critics Avg (All)",
          normalized: null,
          raw: { value: avgAll, scale: "0-100" },
          count: allCriticsCount,
          url: `https://www.rottentomatoes.com/m/${slug}`,
        }),
      );
    }

    if (avgTop != null) {
      scores.push(
        normalizeScore({
          source: "rotten_tomatoes_top",
          label: "RT Critics Avg (Top)",
          normalized: null,
          raw: { value: avgTop, scale: "0-100" },
          count: topCriticsCount,
          url: `https://www.rottentomatoes.com/m/${slug}`,
        }),
      );
    }

    return { scores, consensus };
  } catch (err) {
    // Try HTML scrape even if API failed (404/403/etc.)
    try {
      const html = await fetchText(`https://www.rottentomatoes.com/m/${slug}`, {
        headers: { accept: "text/html", "user-agent": BROWSER_UA },
        signal: ctx.signal,
      });
      const criticsParsed = parseRTCriticsHtml(html);
      const audienceParsed = parseRTAudienceHtml(html);
      const consensus = parseRTConsensus(html);

      const {
        tomatometer,
        criticsAvgAll: avgAll,
        criticsAvgTop: avgTop,
        allCriticsCount,
        topCriticsCount,
        badge: rtBadge,
      } = criticsParsed;
      const { audienceAvg, isVerifiedAudience, audienceCount } = audienceParsed;

      if (
        tomatometer != null ||
        avgAll != null ||
        avgTop != null ||
        audienceAvg != null
      ) {
        const scores: SourceScore[] = [];
        // Always include Tomatometer first if available
        if (tomatometer != null) {
          scores.push(
            normalizeScore({
              source: "rotten_tomatoes",
              label: "RT Tomatometer",
              normalized: null,
              raw: { value: tomatometer, scale: "0-100" },
              count: allCriticsCount,
              url: `https://www.rottentomatoes.com/m/${slug}`,
              badge: rtBadge ?? undefined,
            }),
          );
        }
        if (audienceAvg != null) {
          scores.push(
            normalizeScore({
              source: "rotten_tomatoes_audience",
              label: isVerifiedAudience
                ? "RT Verified Audience"
                : "RT Audience",
              normalized: null,
              raw: { value: audienceAvg, scale: "0-5" },
              count: audienceCount,
              url: `https://www.rottentomatoes.com/m/${slug}`,
            }),
          );
        }
        if (avgAll != null) {
          scores.push(
            normalizeScore({
              source: "rotten_tomatoes_all",
              label: "RT Critics Avg (All)",
              normalized: null,
              raw: { value: avgAll, scale: "0-100" },
              count: allCriticsCount,
              url: `https://www.rottentomatoes.com/m/${slug}`,
            }),
          );
        }
        if (avgTop != null) {
          scores.push(
            normalizeScore({
              source: "rotten_tomatoes_top",
              label: "RT Critics Avg (Top)",
              normalized: null,
              raw: { value: avgTop, scale: "0-100" },
              count: topCriticsCount,
              url: `https://www.rottentomatoes.com/m/${slug}`,
            }),
          );
        }
        return { scores, consensus };
      }
    } catch (scrapeErr) {
      log.warn("rt_scrape_failed", {
        imdbId: ctx.movie.imdbId,
        error: (scrapeErr as Error).message,
      });
      // fall through to OMDB fallback
    }

    if (fallbackValue != null) {
      return {
        scores: [
          normalizeScore({
            source: "rotten_tomatoes",
            label: "RT Tomatometer",
            normalized: null,
            raw: { value: fallbackValue, scale: "0-100" },
            fromFallback: true,
            error: undefined,
          }),
        ],
        consensus: {},
      };
    }
    return {
      scores: [
        {
          source: "rotten_tomatoes",
          label: "RT Tomatometer",
          normalized: null,
          error: (err as Error).message,
        },
      ],
      consensus: {},
    };
  }
}

// Try to scrape Metacritic page and extract score/count
async function scrapeMetacritic(
  slug: string,
  signal?: AbortSignal,
): Promise<{
  value: number | null;
  count: number | null;
  badge?: string;
} | null> {
  try {
    const html = await fetchText(`https://www.metacritic.com/movie/${slug}/`, {
      headers: { accept: "text/html", "user-agent": BROWSER_UA },
      signal,
    });
    const parsed = parseMetacriticHtml(html);
    if (parsed.value != null) {
      const badge = parseMetacriticBadge(html);
      return {
        value: parsed.value,
        count: parsed.count,
        badge: badge ?? undefined,
      };
    }
    return null; // Page loaded but no score found
  } catch {
    return null; // 404 or other error
  }
}

// Fallback: scrape Metacritic score from IMDb's critic reviews page
// IMDb embeds the Metascore, review count, and Metacritic URL directly
async function scrapeMetacriticViaImdb(
  imdbId: string,
  signal?: AbortSignal,
): Promise<{
  value: number | null;
  count: number | null;
  metacriticUrl: string | null;
} | null> {
  try {
    const html = await fetchText(
      `https://www.imdb.com/title/${imdbId}/criticreviews`,
      {
        headers: {
          "user-agent": BROWSER_UA,
          "accept-language": "en-US,en;q=0.9",
        },
        signal,
      },
    );
    const parsed = parseImdbCriticReviewsHtml(html);
    if (parsed.value != null) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchMetacritic(
  ctx: FetcherContext,
  fallbackValue?: number | null,
): Promise<SourceScore> {
  // Wikidata P1712 may include "movie/" prefix, strip it if present
  const slug = ctx.wikidata.metacritic?.replace(/^movie\//, "");

  // --- Layer 1: Direct Metacritic scrape (requires slug) ---
  if (slug) {
    let result: {
      value: number | null;
      count: number | null;
      badge?: string;
    } | null = null;
    let usedSlug = slug;

    if (ctx.movie.year) {
      const slugWithYear = `${slug}-${ctx.movie.year}`;
      const [canonical, withYear] = await Promise.all([
        scrapeMetacritic(slug, ctx.signal),
        scrapeMetacritic(slugWithYear, ctx.signal),
      ]);
      if (canonical) {
        result = canonical;
      } else if (withYear) {
        result = withYear;
        usedSlug = slugWithYear;
      }
    } else {
      result = await scrapeMetacritic(slug, ctx.signal);
    }

    if (result) {
      return normalizeScore({
        source: "metacritic",
        label: "Metacritic",
        normalized: null,
        raw: { value: result.value, scale: "0-100" },
        count: result.count,
        url: `https://www.metacritic.com/movie/${usedSlug}`,
        badge: result.badge,
      });
    }
  }

  // --- Layer 2: IMDb critic reviews page (no slug needed, just IMDb ID) ---
  const imdbResult = await scrapeMetacriticViaImdb(
    ctx.movie.imdbId,
    ctx.signal,
  );
  if (imdbResult) {
    return normalizeScore({
      source: "metacritic",
      label: "Metacritic",
      normalized: null,
      raw: { value: imdbResult.value, scale: "0-100" },
      count: imdbResult.count,
      url: imdbResult.metacriticUrl ?? undefined,
      fromFallback: true,
    });
  }

  // --- Layer 3: OMDB Metascore (requires API key) ---
  if (fallbackValue != null) {
    return normalizeScore({
      source: "metacritic",
      label: "Metacritic",
      normalized: null,
      raw: { value: fallbackValue, scale: "0-100" },
      fromFallback: true,
      error: undefined,
    });
  }

  return {
    source: "metacritic",
    label: "Metacritic",
    normalized: null,
    error: "Could not fetch Metacritic score",
  };
}

async function fetchLetterboxd(ctx: FetcherContext): Promise<SourceScore> {
  // Prefer Wikidata slug, fall back to title-year slug
  const slug =
    ctx.wikidata.letterboxd ||
    slugifyForLetterboxd(ctx.movie.title, ctx.movie.year);
  try {
    const html = await fetchText(`https://letterboxd.com/film/${slug}/`, {
      headers: { accept: "text/html", "user-agent": BROWSER_UA },
      signal: ctx.signal,
    });
    const parsed = parseLetterboxdHtml(html);
    return normalizeScore({
      source: "letterboxd",
      label: "Letterboxd",
      normalized: null,
      raw: { value: parsed.value, scale: "0-5" },
      count: parsed.count,
      url: `https://letterboxd.com/film/${slug}/`,
    });
  } catch (err) {
    return {
      source: "letterboxd",
      label: "Letterboxd",
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
    return { id: wikidataId, method: "wikidata" };
  }
  return { id: null, method: "wikidata" };
}

// Method 2: Douban Suggest API (JSON endpoint) - try IMDb ID first, then title
async function getDoubanIdFromSuggestApi(
  imdbId: string,
  title?: string,
  signal?: AbortSignal,
): Promise<DoubanIdResult> {
  try {
    // First try with IMDb ID
    const rawImdbId = imdbId.replace(/^tt/, "");
    let data = await fetchJson<
      Array<{ id?: string; episode?: string; sub_title?: string }>
    >(
      `https://movie.douban.com/j/subject_suggest?q=tt${rawImdbId}`,
      { headers: { "user-agent": BROWSER_UA }, signal },
      4000,
    );

    // Check if response contains the IMDb ID (confirms match)
    const jsonStr = JSON.stringify(data);
    if (jsonStr.includes(rawImdbId) && data[0]?.id) {
      return { id: data[0].id, method: "suggest_api" };
    }

    // Fallback: try with movie title if provided
    if (title && data.length === 0) {
      data = await fetchJson<
        Array<{ id?: string; episode?: string; sub_title?: string }>
      >(
        `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(title)}`,
        { headers: { "user-agent": BROWSER_UA }, signal },
        4000,
      );
      // Match by sub_title (English title) to avoid wrong matches
      const match = data.find(
        (item) => item.sub_title?.toLowerCase() === title.toLowerCase(),
      );
      if (match?.id) {
        return { id: match.id, method: "suggest_api" };
      }
    }

    return { id: null, method: "suggest_api" };
  } catch {
    return { id: null, method: "suggest_api" };
  }
}

// Method 3: Douban Subject Search (HTML scraping)
async function getDoubanIdFromSubjectSearch(
  imdbId: string,
  signal?: AbortSignal,
): Promise<DoubanIdResult> {
  try {
    const rawImdbId = imdbId.replace(/^tt/, "");
    const html = await fetchText(
      `https://movie.douban.com/subject_search?search_text=tt${rawImdbId}`,
      { headers: { "user-agent": BROWSER_UA, accept: "text/html" }, signal },
      4000,
    );
    const id = parseDoubanSubjectSearchHtml(html);
    return { id, method: "subject_search" };
  } catch {
    return { id: null, method: "subject_search" };
  }
}

// Method 4: Douban Global Search (looks for IMDb ID in onclick attributes)
async function getDoubanIdFromGlobalSearch(
  imdbId: string,
  signal?: AbortSignal,
): Promise<DoubanIdResult> {
  try {
    const rawImdbId = imdbId.replace(/^tt/, "");
    const html = await fetchText(
      `https://www.douban.com/search?cat=1002&q=tt${rawImdbId}`,
      { headers: { "user-agent": BROWSER_UA, accept: "text/html" }, signal },
      8000,
    );
    const id = parseDoubanGlobalSearchHtml(html);
    return { id, method: "global_search" };
  } catch {
    return { id: null, method: "global_search" };
  }
}

// Method 5: Google Search (last resort when Douban blocks)
async function getDoubanIdFromGoogle(
  imdbId: string,
  signal?: AbortSignal,
): Promise<DoubanIdResult> {
  try {
    const html = await fetchText(
      `https://www.google.com/search?q=%22${imdbId}%22+site:movie.douban.com/subject&safe=off`,
      { headers: { "user-agent": BROWSER_UA, accept: "text/html" }, signal },
      10000,
    );
    const id = parseGoogleDoubanSearchHtml(html);
    return { id, method: "google" };
  } catch {
    return { id: null, method: "google" };
  }
}

// Waterfall: try each method in order until one succeeds
async function resolveDoubanId(
  imdbId: string,
  wikidataDoubanId?: string,
  title?: string,
  signal?: AbortSignal,
): Promise<DoubanIdResult> {
  // 1. Wikidata (already fetched, safest)
  const wikiResult = getDoubanIdFromWikidata(wikidataDoubanId);
  if (wikiResult.id) return wikiResult;

  // 2. Douban Suggest API (tries IMDb ID, then title)
  const suggestResult = await getDoubanIdFromSuggestApi(imdbId, title, signal);
  if (suggestResult.id) return suggestResult;

  // 3. Douban Subject Search
  const subjectResult = await getDoubanIdFromSubjectSearch(imdbId, signal);
  if (subjectResult.id) return subjectResult;

  // 4. Douban Global Search
  const globalResult = await getDoubanIdFromGlobalSearch(imdbId, signal);
  if (globalResult.id) return globalResult;

  // 5. Google Search (last resort)
  const googleResult = await getDoubanIdFromGoogle(imdbId, signal);
  if (googleResult.id) return googleResult;

  return { id: null, method: "none" };
}

// Douban subject_abstract API response type
type DoubanAbstractResponse = {
  r: number;
  subject?: {
    rate?: string; // e.g. "9.4"
    title?: string;
  };
};

// Fetch rating from Douban's subject_abstract JSON API
// Note: Vote count is not available via API, and HTML pages are protected (302 redirect).
// Douban will use default 0.7 reliability.
async function fetchDoubanRating(
  doubanId: string,
  signal?: AbortSignal,
): Promise<{ rating: number | null; count: number | null }> {
  const data = await fetchJson<DoubanAbstractResponse>(
    `https://movie.douban.com/j/subject_abstract?subject_id=${doubanId}`,
    { headers: { "user-agent": BROWSER_UA }, signal },
    10000,
  );

  let rating: number | null = null;

  if (data.subject?.rate) {
    rating = parseFloat(data.subject.rate);
    if (isNaN(rating)) rating = null;
  }

  // Vote count not available - HTML pages are blocked (anti-bot protection)
  return { rating, count: null };
}

async function fetchDouban(ctx: FetcherContext): Promise<SourceScore> {
  // Check cache first (24h TTL for successful results)
  const cacheKey = ctx.movie.imdbId;
  const cached = doubanCache.get(cacheKey);
  if (cached) return cached;

  try {
    // Resolve Douban ID using waterfall (Wikidata → Suggest API → Subject Search → Global Search → Google)
    const { id: doubanId, method } = await resolveDoubanId(
      ctx.movie.imdbId,
      ctx.wikidata.douban,
      ctx.movie.title,
      ctx.signal,
    );

    if (!doubanId) {
      return {
        source: "douban",
        label: "Douban",
        normalized: null,
        error: "Could not find Douban ID",
      };
    }

    // Fetch rating from JSON API (HTML pages have JS challenge)
    const { rating, count } = await fetchDoubanRating(doubanId, ctx.signal);
    const url = `https://movie.douban.com/subject/${doubanId}/`;

    if (rating == null) {
      return {
        source: "douban",
        label: "Douban",
        normalized: null,
        url,
        error: "No rating found",
      };
    }

    const result = normalizeScore({
      source: "douban",
      label: "Douban",
      normalized: null,
      raw: { value: rating, scale: "0-10" },
      count,
      url,
      // Include which method found the ID (useful for debugging)
      fromFallback: method !== "wikidata",
    });

    // Cache only successful results (with a score)
    if (result.normalized != null) {
      doubanCache.set(cacheKey, result);
    }

    return result;
  } catch (err) {
    return {
      source: "douban",
      label: "Douban",
      normalized: null,
      error: (err as Error).message,
    };
  }
}

type RunFetchersInput = {
  movie: MovieInfo;
  wikidata: WikidataIds | Promise<WikidataIds>;
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  kvGet?: (imdbId: string) => Promise<ScorePayload | null>;
  kvSet?: (
    imdbId: string,
    payload: ScorePayload,
    releaseDate: string | undefined,
    movieYear: string | undefined,
  ) => Promise<void>;
};

type FetchersResult = {
  payload: ScorePayload;
  deferred: () => Promise<void>;
};

export async function runFetchers(
  input: RunFetchersInput,
): Promise<FetchersResult> {
  const { movie, env, signal, kvGet: kvGetFn, kvSet: kvSetFn } = input;
  const cacheKey = movie.imdbId;
  const cached = scoreCache.get(cacheKey);
  if (cached) {
    // Backfill mode is intentional here: in-memory cache may be older than this
    // request and should never overwrite existing DB rows.
    return {
      payload: cached,
      deferred: async () => {
        await persistScores(cached, { backfill: true });
      },
    };
  }

  // Layer 2: KV cache (optional, days-scale TTL)
  if (kvGetFn) {
    const kvCached = await kvGetFn(cacheKey);
    if (kvCached) {
      scoreCache.set(cacheKey, kvCached);
      // Backfill KV-cached data to Postgres (insert-if-absent only — never overwrite
      // existing rows with potentially stale cached data)
      return {
        payload: kvCached,
        deferred: async () => {
          await persistScores(kvCached, { backfill: true });
        },
      };
    }
  }

  const startMs = Date.now();

  // IMDb only needs movie.imdbId, not wikidata — start it immediately
  const imdbCtx: FetcherContext = {
    movie,
    wikidata: {} as WikidataIds,
    env,
    signal,
    kvGet: kvGetFn,
    kvSet: kvSetFn,
  };
  const imdbPromise = fetchImdb(imdbCtx);

  // Resolve wikidata in parallel with IMDb (may already be resolved)
  const [wikidata, imdbResult] = await Promise.all([
    Promise.resolve(input.wikidata),
    imdbPromise,
  ]);

  const ctx: FetcherContext = {
    movie,
    wikidata,
    env,
    signal,
    kvGet: kvGetFn,
    kvSet: kvSetFn,
  };

  // Fetch remaining sources that depend on wikidata slugs
  const [
    rtResult,
    metacriticScore,
    letterboxdScore,
    allocineScores,
    doubanScore,
  ] = await Promise.all([
    fetchRottenTomatoes(ctx), // No fallback passed - apply post-hoc if needed
    fetchMetacritic(ctx), // No fallback passed - apply post-hoc if needed
    fetchLetterboxd(ctx),
    fetchAllocine(ctx),
    fetchDouban(ctx),
  ]);

  // Apply OMDB fallbacks post-hoc if direct fetches failed
  let finalRtScores = rtResult.scores;
  let finalMetacriticScore = metacriticScore;

  // RT: If all scores have errors OR all normalized values are null, use OMDB fallback
  const rtAllFailed = rtResult.scores.every(
    (s) => s.error != null || s.normalized == null,
  );
  if (rtAllFailed && imdbResult.fallback.rt != null) {
    finalRtScores = [
      normalizeScore({
        source: "rotten_tomatoes",
        label: "RT Tomatometer",
        normalized: null,
        raw: { value: imdbResult.fallback.rt, scale: "0-100" },
        fromFallback: true,
      }),
    ];
  }

  // Metacritic: If failed (error OR no normalized value) and we have OMDB fallback, use it
  if (
    (metacriticScore.error != null || metacriticScore.normalized == null) &&
    imdbResult.fallback.metacritic != null
  ) {
    finalMetacriticScore = normalizeScore({
      source: "metacritic",
      label: "Metacritic",
      normalized: null,
      raw: { value: imdbResult.fallback.metacritic, scale: "0-100" },
      fromFallback: true,
    });
  }

  const results: Array<SourceScore | SourceScore[]> = [
    imdbResult.score,
    finalRtScores,
    finalMetacriticScore,
    letterboxdScore,
    allocineScores,
    doubanScore,
  ];

  const allScores = results.flatMap((r) => (Array.isArray(r) ? r : [r]));

  const overall = computeOverallScore(allScores);

  const missingSources = allScores
    .filter((s) => s.normalized == null)
    .map((s) => s.label);

  const payload: ScorePayload = {
    movie,
    sources: allScores,
    overall,
    missingSources,
    themes: imdbResult.themes.length > 0 ? imdbResult.themes : undefined,
    consensus:
      Object.keys(rtResult.consensus).length > 0
        ? rtResult.consensus
        : undefined,
    imdbSummary: imdbResult.summary || undefined,
  };
  // A source with normalized=null and NO error means the scraper ran clean against
  // the real page and found no data — that's safe to cache (e.g., no press reviews).
  // A source with an error string could be a network/scrape failure — don't cache.
  const hasTransientFailure = allScores.some(
    (s) => s.normalized == null && s.error != null,
  );

  // Only cache in memory when all sources resolved cleanly — a transient failure
  // (e.g., "temporarily unavailable") should allow the next request to retry fresh.
  if (!hasTransientFailure) {
    scoreCache.set(cacheKey, payload);
  }

  // Deferred work: logging, KV write-through, and DB persistence (run after response is sent)
  const deferred = async () => {
    for (const s of allScores) {
      log.info("source_fetched", {
        imdbId: movie.imdbId,
        source: s.source,
        hasScore: s.normalized != null,
        error: s.error,
      });
    }
    log.info("scores_computed", {
      imdbId: movie.imdbId,
      durationMs: Date.now() - startMs,
      sourcesAvailable: allScores.filter((s) => s.normalized != null).length,
      overallScore: overall?.score ?? null,
    });

    if (kvSetFn && !hasTransientFailure) {
      kvSetFn(cacheKey, payload, movie.releaseDate, movie.year).catch((err) => {
        log.warn("kv_writeback_failed", {
          imdbId: cacheKey,
          error: (err as Error).message,
        });
      });
    }

    // Persist to Postgres (no completeness gate — quality filtered at query time)
    await persistScores(payload);
  };

  return { payload, deferred };
}

const scoreCache = new MemoryCache<ScorePayload>(5 * 60 * 1000, 500); // 5 min TTL, 500 max
const doubanCache = new MemoryCache<SourceScore>(24 * 60 * 60 * 1000, 500); // 24h TTL for Douban
