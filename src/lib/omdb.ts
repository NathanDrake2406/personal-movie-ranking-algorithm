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
