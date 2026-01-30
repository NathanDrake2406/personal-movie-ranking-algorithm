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
};

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

export async function searchTmdbTitle(query: string, apiKey: string) {
  const data = await fetchJson<{ results: TmdbSearchResult[] }>(
    `${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`,
  );
  return data.results ?? [];
}

export async function findByImdb(imdbId: string, apiKey: string) {
  const data = await fetchJson<TmdbFindResponse>(
    `${TMDB_BASE}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`,
  );
  const match = data.movie_results?.[0];
  return match ?? null;
}

export async function getTmdbDetails(tmdbId: number, apiKey: string) {
  return fetchJson<TmdbDetailsResponse>(`${TMDB_BASE}/movie/${tmdbId}?api_key=${apiKey}`);
}

export function tmdbToMovieInfo(movie: TmdbDetailsResponse): MovieInfo {
  return {
    imdbId: movie.imdb_id ?? '',
    title: movie.title,
    year: movie.release_date?.slice(0, 4),
    poster: movie.poster_path ? `${IMG_BASE}${movie.poster_path}` : undefined,
    tmdbId: movie.id,
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
