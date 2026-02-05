export type SourceName =
  | 'allocine_press'
  | 'allocine_user'
  | 'douban'
  | 'imdb'
  | 'letterboxd'
  | 'metacritic'
  | 'rotten_tomatoes'
  | 'rotten_tomatoes_all'
  | 'rotten_tomatoes_audience'
  | 'rotten_tomatoes_top';

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
};

export type MovieInfo = {
  imdbId: string;
  title: string;
  year?: string;
  poster?: string;
  tmdbId?: number; // Still used for movie resolution, just not for scoring
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
  coverage: number; // fraction of total weight present (0-1)
  disagreement: number; // std dev of source scores (0-100)
};

export type ImdbTheme = {
  label: string;
  sentiment: 'positive' | 'negative' | 'neutral';
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
