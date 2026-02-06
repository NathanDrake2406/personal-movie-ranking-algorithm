import { fetchJson } from "./http";
import { MemoryCache } from "./cache";
import { parseImdbThemeSummaryResponse } from "./parsers";

const DEFAULT_GRAPHQL_URL = "https://caching.graphql.imdb.com/";
const DEFAULT_OPERATION_NAME = "AIThemePrompt";
const DEFAULT_PERSISTED_HASH =
  "33e1aa46f0f8a40bda4e54b9e3c9cb70a2c8c467ce7b01bb03e887c1641b3024";
const DEFAULT_VARIABLES_TEMPLATE =
  '{"locale":"en-US","showOriginalTitleText":false,"themeId":"{{themeId}}","titleId":"{{imdbId}}"}';
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const DEFAULT_HEADERS: Record<string, string> = {
  "x-imdb-client-name": "imdb-web-next-localized",
  "x-imdb-user-language": "en-US",
  "x-imdb-user-country": "US",
};

const themeSummaryCache = new MemoryCache<string>(24 * 60 * 60 * 1000, 1000);

type ImdbThemeEnv = Record<string, string | undefined>;

export type ImdbThemeSummaryResult =
  | { status: "found"; summary: string }
  | { status: "not_found" }
  | { status: "config_error"; error: string }
  | { status: "upstream_error"; error: string };

function parseJsonEnv(value?: string): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      ([, v]) => typeof v === "string",
    );
    return Object.fromEntries(entries) as Record<string, string>;
  } catch {
    return {};
  }
}

function buildVariables(
  template: string,
  imdbId: string,
  themeId: string,
): Record<string, unknown> | null {
  const raw = template
    .replace(/{{\s*imdbId\s*}}/g, imdbId)
    .replace(/{{\s*themeId\s*}}/g, themeId);
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function buildGraphqlPayload(
  imdbId: string,
  themeId: string,
  env: ImdbThemeEnv,
): Record<string, unknown> | null {
  const operationName = env.IMDB_THEME_GQL_OPERATION || DEFAULT_OPERATION_NAME;
  const query = env.IMDB_THEME_GQL_QUERY;
  const persistedHash =
    env.IMDB_THEME_GQL_PERSISTED_HASH || DEFAULT_PERSISTED_HASH;
  const variablesTemplate =
    env.IMDB_THEME_GQL_VARIABLES || DEFAULT_VARIABLES_TEMPLATE;
  const variables = buildVariables(variablesTemplate, imdbId, themeId);

  if (!variables) return null;

  const payload: Record<string, unknown> = { variables };
  if (operationName) payload.operationName = operationName;

  if (query) {
    payload.query = query;
    return payload;
  }

  if (persistedHash) {
    payload.extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: persistedHash,
      },
    };
    return payload;
  }

  return null;
}

export async function fetchImdbThemeSummary(
  imdbId: string,
  themeId: string,
  env: ImdbThemeEnv,
  signal?: AbortSignal,
): Promise<ImdbThemeSummaryResult> {
  const cacheKey = `${imdbId}:${themeId}`;
  const cached = themeSummaryCache.get(cacheKey);
  if (cached) return { status: "found", summary: cached };

  const graphqlUrl = env.IMDB_THEME_GQL_URL || DEFAULT_GRAPHQL_URL;
  const payload = buildGraphqlPayload(imdbId, themeId, env);
  if (!payload) {
    return {
      status: "config_error",
      error:
        "Missing IMDb GraphQL configuration. Set IMDB_THEME_GQL_QUERY or IMDB_THEME_GQL_PERSISTED_HASH.",
    };
  }

  const extraHeaders = parseJsonEnv(env.IMDB_THEME_GQL_HEADERS);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/graphql+json, application/json",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": BROWSER_UA,
    referer: `https://www.imdb.com/title/${imdbId}/`,
    ...DEFAULT_HEADERS,
    ...extraHeaders,
  };

  if (env.IMDB_THEME_COOKIE && !headers.cookie) {
    headers.cookie = env.IMDB_THEME_COOKIE;
  }

  try {
    const hasQuery =
      typeof payload.query === "string" && payload.query.length > 0;
    const hasPersisted =
      payload.extensions && typeof payload.extensions === "object";

    const response = await (async () => {
      if (!hasQuery && hasPersisted) {
        const url = new URL(graphqlUrl);
        const operationName =
          (payload.operationName as string | undefined) ||
          DEFAULT_OPERATION_NAME;
        url.searchParams.set("operationName", operationName);
        url.searchParams.set(
          "variables",
          JSON.stringify(payload.variables ?? {}),
        );
        url.searchParams.set(
          "extensions",
          JSON.stringify(payload.extensions ?? {}),
        );
        return fetchJson<unknown>(url.toString(), {
          method: "GET",
          headers,
          signal,
        });
      }

      return fetchJson<unknown>(graphqlUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
      });
    })();

    const summary = parseImdbThemeSummaryResponse(response, themeId);
    if (!summary) return { status: "not_found" };

    themeSummaryCache.set(cacheKey, summary);
    return { status: "found", summary };
  } catch (err) {
    return { status: "upstream_error", error: (err as Error).message };
  }
}
