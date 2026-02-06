export type ApiKeys = {
  tmdbKey?: string;
  omdbKey?: string;
  omdbKeys: string[];
};

export function getApiKeys(env: Record<string, string | undefined>): ApiKeys {
  const tmdbKey = env.TMDB_API_KEY;
  const omdbKey = env.OMDB_API_KEY;
  const omdbKeys = omdbKey ? [omdbKey] : [];
  return { tmdbKey, omdbKey, omdbKeys };
}
