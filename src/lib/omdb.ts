import { fetchJson } from './http';

type OmdbMovie = {
  Title: string;
  Year?: string;
  imdbID: string;
  Poster?: string;
  imdbRating?: string;
  imdbVotes?: string; // e.g., "1,234,567"
  Metascore?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
};

export async function fetchOmdbByTitle(title: string, apiKey: string) {
  const data = await fetchJson<{ Search?: OmdbMovie[] }>(
    `https://www.omdbapi.com/?apikey=${apiKey}&type=movie&s=${encodeURIComponent(title)}`,
  );
  return data.Search ?? [];
}

export async function fetchOmdbById(imdbId: string, apiKey: string) {
  return fetchJson<OmdbMovie>(
    `https://www.omdbapi.com/?apikey=${apiKey}&i=${encodeURIComponent(imdbId)}`,
  );
}

// Try multiple API keys until one succeeds
export async function fetchOmdbByIdWithRotation(imdbId: string, apiKeys: string[]) {
  for (const key of apiKeys) {
    try {
      const data = await fetchOmdbById(imdbId, key);
      // OMDB returns Response: "False" on error, check for valid data
      if (data.imdbRating || data.Title) {
        return data;
      }
    } catch {
      // Try next key
    }
  }
  throw new Error('All OMDB keys exhausted');
}

export async function fetchOmdbByTitleWithRotation(title: string, apiKeys: string[]) {
  for (const key of apiKeys) {
    try {
      const results = await fetchOmdbByTitle(title, key);
      if (results.length > 0) {
        return results;
      }
    } catch {
      // Try next key
    }
  }
  return [];
}

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
