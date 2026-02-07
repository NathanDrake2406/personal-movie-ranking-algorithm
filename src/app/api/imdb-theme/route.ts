import { NextResponse } from "next/server";
import { fetchImdbThemeSummary } from "@/lib/imdb-theme";
import { isAbortError } from "@/lib/http";
import { log } from "@/lib/logger";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imdbId = searchParams.get("imdbId");
  const themeId = searchParams.get("themeId");

  if (!imdbId || !themeId) {
    return NextResponse.json(
      { error: "imdbId and themeId are required" },
      { status: 400 },
    );
  }

  try {
    const env = {
      IMDB_THEME_GQL_URL: process.env.IMDB_THEME_GQL_URL,
      IMDB_THEME_GQL_OPERATION: process.env.IMDB_THEME_GQL_OPERATION,
      IMDB_THEME_GQL_QUERY: process.env.IMDB_THEME_GQL_QUERY,
      IMDB_THEME_GQL_PERSISTED_HASH: process.env.IMDB_THEME_GQL_PERSISTED_HASH,
      IMDB_THEME_GQL_VARIABLES: process.env.IMDB_THEME_GQL_VARIABLES,
      IMDB_THEME_GQL_HEADERS: process.env.IMDB_THEME_GQL_HEADERS,
      IMDB_THEME_COOKIE: process.env.IMDB_THEME_COOKIE,
    };

    const result = await fetchImdbThemeSummary(
      imdbId,
      themeId,
      env,
      request.signal,
    );
    switch (result.status) {
      case "found":
        return NextResponse.json(
          { summary: result.summary },
          {
            status: 200,
            headers: {
              "Cache-Control":
                "public, s-maxage=86400, stale-while-revalidate=86400",
            },
          },
        );
      case "not_found":
        return NextResponse.json(
          { error: "Summary unavailable" },
          { status: 404 },
        );
      case "config_error":
        return NextResponse.json({ error: result.error }, { status: 500 });
      case "upstream_error":
        return NextResponse.json({ error: result.error }, { status: 502 });
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  } catch (err) {
    if (isAbortError(err)) {
      return new Response(null, { status: 499 });
    }
    log.error("imdb_theme_failed", {
      imdbId,
      themeId,
      error: (err as Error).message,
    });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
