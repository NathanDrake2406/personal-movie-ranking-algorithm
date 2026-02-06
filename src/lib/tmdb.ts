import { fetchJson } from './http';
import type { MovieInfo } from './types';

type TmdbSearchResult = {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string;
  popularity?: number;
};

type TmdbFindResponse = {
  movie_results: Array<{
    id: number;
    title: string;
    release_date?: string;
    poster_path?: string;
    imdb_id?: string;
  }>;
};

type TmdbDetailsResponse = {
  id: number;
  imdb_id?: string;
  title: string;
  release_date?: string;
  poster_path?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  runtime?: number;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    crew?: Array<{ job: string; name: string }>;
    cast?: Array<{ name: string; order: number }>;
  };
  release_dates?: {
    results?: Array<{
      iso_3166_1: string;
      release_dates: Array<{ certification: string; type: number }>;
    }>;
  };
};

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

export async function searchTmdbTitle(query: string, apiKey: string, signal?: AbortSignal) {
  const data = await fetchJson<{ results: TmdbSearchResult[] }>(
    `${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`,
    { signal },
  );
  return data.results ?? [];
}

export async function findByImdb(imdbId: string, apiKey: string, signal?: AbortSignal) {
  const data = await fetchJson<TmdbFindResponse>(
    `${TMDB_BASE}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`,
    { signal },
  );
  const match = data.movie_results?.[0];
  return match ?? null;
}

export async function getTmdbDetails(tmdbId: number, apiKey: string, signal?: AbortSignal) {
  return fetchJson<TmdbDetailsResponse>(`${TMDB_BASE}/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits,release_dates`, { signal });
}

export function tmdbToMovieInfo(movie: TmdbDetailsResponse): MovieInfo {
  const crew = movie.credits?.crew ?? [];

  // Get content rating (US preferred, fallback to GB)
  const releaseDates = movie.release_dates?.results ?? [];
  const usRelease = releaseDates.find((r) => r.iso_3166_1 === 'US');
  const gbRelease = releaseDates.find((r) => r.iso_3166_1 === 'GB');
  const releaseData = usRelease ?? gbRelease;
  const rating = releaseData?.release_dates.find((rd) => rd.certification)?.certification;

  // Get all directors (some films have multiple, e.g., Coen Brothers)
  const directors = crew
    .filter((c) => c.job === 'Director')
    .map((c) => c.name);

  // Get writers (Screenplay, Writer, Story) - deduplicated
  const writerJobs = ['Screenplay', 'Writer', 'Story'];
  const writers = [...new Set(
    crew
      .filter((c) => writerJobs.includes(c.job))
      .map((c) => c.name)
  )].slice(0, 3); // Limit to 3 writers

  // Get cinematographer (Director of Photography)
  const cinematographer = crew.find(
    (c) => c.job === 'Director of Photography' || c.job === 'Cinematography'
  )?.name;

  // Get composer
  const composer = crew.find(
    (c) => c.job === 'Original Music Composer' || c.job === 'Music'
  )?.name;

  const cast = movie.credits?.cast
    ?.sort((a, b) => a.order - b.order)
    .slice(0, 5)
    .map((c) => c.name);

  return {
    imdbId: movie.imdb_id ?? '',
    title: movie.title,
    year: movie.release_date?.slice(0, 4),
    poster: movie.poster_path ? `${IMG_BASE}${movie.poster_path}` : undefined,
    tmdbId: movie.id,
    overview: movie.overview,
    runtime: movie.runtime,
    rating,
    genres: movie.genres?.map((g) => g.name),
    director: directors[0], // Keep backward compatibility
    directors: directors.length > 0 ? directors : undefined,
    writers: writers.length > 0 ? writers : undefined,
    cinematographer,
    composer,
    cast,
  };
}

export function tmdbSearchResultToInfo(result: TmdbSearchResult): MovieInfo {
  return {
    imdbId: '',
    title: result.title,
    year: result.release_date?.slice(0, 4),
    poster: result.poster_path ? `${IMG_BASE}${result.poster_path}` : undefined,
    tmdbId: result.id,
  };
}
