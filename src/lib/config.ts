export type ApiKeys = {
  tmdbKey?: string;
  tmdbKeys: string[];
  omdbKey?: string;
  omdbKeys: string[];
};

export function getApiKeys(env: Record<string, string | undefined>): ApiKeys {
  const raw = env.TMDB_API_KEY;
  const tmdbKeys = raw
    ? raw.split(",").map((k) => k.trim()).filter(Boolean)
    : [];
  const tmdbKey = tmdbKeys[0];
  const omdbKey = env.OMDB_API_KEY;
  const omdbKeys = omdbKey ? [omdbKey] : [];
  return { tmdbKey, omdbKey, omdbKeys, tmdbKeys };
}
