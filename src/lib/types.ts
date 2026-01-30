export type SourceName =
  | 'douban'
  | 'imdb'
  | 'letterboxd'
  | 'metacritic'
  | 'mubi'
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
  mubi?: string;
};

export type OverallScore = {
  score: number;
  confidence: number;
  disagreement: number;
};

export type ScorePayload = {
  movie: MovieInfo;
  sources: SourceScore[];
  overall: OverallScore | null;
  missingSources?: string[];
};
