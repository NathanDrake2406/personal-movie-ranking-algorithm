import { NextResponse } from "next/server";
import { getApiKeys } from "@/lib/config";
import { parseQuery, rankResults, generateVariants } from "@/lib/search-utils";
import { fetchJson, isAbortError } from "@/lib/http";
import { log } from "@/lib/logger";
import { LRUCache } from "@/lib/cache";
import { kvSearchGet, kvSearchSet } from "@/lib/kv";

/** TMDB result with poster_path preserved for response mapping */
type CachedMovie = {
  id: number;
  title: string;
  release_date?: string;
  popularity?: number;
  vote_count?: number;
  poster_path?: string;
};

/** In-memory search results cache — 2 min TTL, 500 entries */
const searchCache = new LRUCache<CachedMovie[]>(2 * 60 * 1000, 500);

type TMDBSearchResult = {
  results: CachedMovie[];
};

function toResponse(movie: CachedMovie) {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.release_date?.split("-")[0] || null,
    poster: movie.poster_path
      ? `https://image.tmdb.org/t/p/w92${movie.poster_path}`
      : null,
  };
}

async function fetchTMDB(
  tmdbKey: string,
  searchTitle: string,
  year: number | null,
  signal?: AbortSignal,
): Promise<TMDBSearchResult> {
  let url = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(searchTitle)}&page=1`;

  if (year) {
    url += `&primary_release_year=${year}`;
  }

  return fetchJson<TMDBSearchResult>(url, { signal }, 5000);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const { tmdbKey } = getApiKeys({
    TMDB_API_KEY: process.env.TMDB_API_KEY,
  });

  if (!tmdbKey) {
    return NextResponse.json(
      { error: "TMDB API key not configured" },
      { status: 500 },
    );
  }

  try {
    // Parse query to extract year
    const { title: searchTitle, year } = parseQuery(query);
    const cacheKey = `${searchTitle.toLowerCase()}|${year ?? ""}`;

    const cacheHeaders = {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    };

    // L1: in-memory cache (same instance)
    const l1 = searchCache.get(cacheKey);
    if (l1) {
      const ranked = rankResults(l1, searchTitle, year, 10);
      return NextResponse.json(
        { results: ranked.map(toResponse) },
        { headers: cacheHeaders },
      );
    }

    // L2: KV cache (shared across all instances/users)
    const l2 = await kvSearchGet<CachedMovie>(searchTitle, year);
    if (l2) {
      searchCache.set(cacheKey, l2);
      const ranked = rankResults(l2, searchTitle, year, 10);
      return NextResponse.json(
        { results: ranked.map(toResponse) },
        { headers: cacheHeaders },
      );
    }

    // L3: fetch from TMDB
    // Generate query variants (e.g., & ↔ and, remove apostrophes, hyphens)
    const variants = generateVariants(searchTitle);
    const allQueries = [searchTitle, ...variants];

    // Fetch all variants in parallel (with year filter if present)
    const allResults = await Promise.all(
      allQueries.map((q) => fetchTMDB(tmdbKey, q, year, request.signal)),
    );
    let combinedResults = allResults.flatMap((r) => r.results);

    // Fallback: if year filter returns empty, retry all without year
    if (year && combinedResults.length === 0) {
      const noYearResults = await Promise.all(
        allQueries.map((q) => fetchTMDB(tmdbKey, q, null, request.signal)),
      );
      combinedResults = noYearResults.flatMap((r) => r.results);
    }

    // Dedupe by movie ID
    const movieIndex = new Map<number, CachedMovie>();
    for (const movie of combinedResults) {
      if (!movieIndex.has(movie.id)) movieIndex.set(movie.id, movie);
    }
    const deduped = Array.from(movieIndex.values());

    // Write-through: L1 + L2
    searchCache.set(cacheKey, deduped);
    kvSearchSet(searchTitle, year, deduped).catch(() => {});

    // Re-rank results using smart ranking (top-K selection for k=10)
    const ranked = rankResults(deduped, searchTitle, year, 10);

    return NextResponse.json(
      { results: ranked.map(toResponse) },
      { headers: cacheHeaders },
    );
  } catch (err) {
    if (isAbortError(err)) {
      return new Response(null, { status: 499 });
    }
    log.error("search_failed", { query, error: (err as Error).message });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
