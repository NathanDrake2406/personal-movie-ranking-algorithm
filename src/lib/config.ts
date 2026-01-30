const TMDB_FALLBACK_KEY = 'd12b33d3f4fb8736dc06f22560c4f8d4';
const OMDB_ROTATION_KEYS = [
  '8c967f70',
  'dd37e5a4',
  '3fdb9c5a',
  'b81150c9',
  '2981ebb6',
  'f17eacb0',
];

export type ApiKeys = { tmdbKey?: string; omdbKey?: string; omdbKeys: string[] };

export function getApiKeys(env: Record<string, string | undefined>): ApiKeys {
  const tmdbKey = env.TMDB_API_KEY || TMDB_FALLBACK_KEY;
  const omdbKey = env.OMDB_API_KEY;
  // Return all rotation keys for fallback attempts
  const omdbKeys = omdbKey ? [omdbKey, ...OMDB_ROTATION_KEYS] : OMDB_ROTATION_KEYS;
  return { tmdbKey, omdbKey, omdbKeys };
}

export const defaults = {
  tmdb: TMDB_FALLBACK_KEY,
  omdbRotation: OMDB_ROTATION_KEYS,
};
