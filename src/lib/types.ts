export type SourceName =
  | "allocine_press"
  | "allocine_user"
  | "douban"
  | "imdb"
  | "letterboxd"
  | "metacritic"
  | "rotten_tomatoes"
  | "rotten_tomatoes_all"
  | "rotten_tomatoes_audience"
  | "rotten_tomatoes_top";

export type SourceScore = {
  source: SourceName;
  label: string;
  normalized: number | null; // 0-100
  raw?: {
    value: number | null;
    scale: string;
  };
  count?: number | null; // votes/ratings/reviews count
  url?: string;
  error?: string;
  fromFallback?: boolean;
  badge?: string;
};

export type MovieInfo = {
  imdbId: string;
  title: string;
  year?: string;
  releaseDate?: string; // "YYYY-MM-DD" from TMDB
  poster?: string;
  tmdbId?: number; // Still used for movie resolution, just not for scoring
  overview?: string;
  runtime?: number;
  rating?: string; // Content rating (G, PG, PG-13, R, etc.)
  genres?: string[];
  director?: string;
  directors?: string[]; // Multiple directors (e.g., Coen Brothers)
  writers?: string[];
  cinematographer?: string;
  composer?: string;
  editor?: string;
  cast?: string[];
};

export type WikidataIds = {
  rottenTomatoes?: string;
  metacritic?: string;
  letterboxd?: string;
  douban?: string;
  allocineFilm?: string;
  allocineSeries?: string;
};

export type OverallScore = {
  score: number;
  coverage: number; // fraction of sources present (0-1), count-based
  disagreement: number; // std dev of source scores (0-100)
};

export type ImdbTheme = {
  id: string;
  label: string;
  sentiment: "positive" | "negative" | "neutral";
};

export type RTConsensus = {
  critics?: string;
  audience?: string;
};

export type ScorePayload = {
  movie: MovieInfo;
  sources: SourceScore[];
  overall: OverallScore | null;
  missingSources?: string[];
  themes?: ImdbTheme[];
  consensus?: RTConsensus;
  imdbSummary?: string; // AI-generated summary from IMDb user reviews
};
