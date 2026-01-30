'use client';

import { FormEvent, useState, useEffect, useRef, KeyboardEvent, memo, useReducer } from 'react';
import styles from './page.module.css';
import type { ScorePayload, SourceScore } from '@/lib/types';

type SearchResult = {
  id: number;
  title: string;
  year: string | null;
  poster: string | null;
};

// Discriminated union for fetch state - makes impossible states impossible
type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ScorePayload }
  | { status: 'error'; error: string };

type FetchAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; data: ScorePayload }
  | { type: 'FETCH_ERROR'; error: string };

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case 'FETCH_START':
      return { status: 'loading' };
    case 'FETCH_SUCCESS':
      return { status: 'success', data: action.data };
    case 'FETCH_ERROR':
      return { status: 'error', error: action.error };
  }
}

function formatScore(val: number | null) {
  return val == null ? '—' : Math.round(val).toString();
}

const ScoreCard = memo(function ScoreCard({ score }: { score: SourceScore }) {
  return (
    <div className={styles.scoreCard}>
      <p className={styles.scoreSource}>{score.label}</p>
      <p className={styles.scoreValue}>{formatScore(score.normalized)}</p>
      {score.raw?.value != null ? (
        <p className={styles.scoreRaw}>
          {score.raw.value} out of {score.raw.scale.split('-')[1]}
        </p>
      ) : null}
      {score.fromFallback ? <p className={styles.scoreMuted}>via fallback</p> : null}
      {score.error ? <p className={styles.scoreMuted}>{score.error}</p> : null}
      {score.url ? (
        <a href={score.url} target="_blank" rel="noreferrer" className={styles.scoreLink}>
          View source →
        </a>
      ) : null}
    </div>
  );
});

type RTScoreCardProps = {
  rtMain: SourceScore | undefined;
  rtAudience: SourceScore | undefined;
  rtAll: SourceScore | undefined;
  rtTop: SourceScore | undefined;
};

const RTScoreCard = memo(function RTScoreCard({
  rtMain,
  rtAudience,
  rtAll,
  rtTop,
}: RTScoreCardProps) {
  return (
    <div className={`${styles.scoreCard} ${styles.rtCard}`}>
      <p className={styles.scoreSource}>Rotten Tomatoes</p>

      {/* Main scores: Critics & Audience side by side */}
      <div className={styles.rtMainScores}>
        <div className={styles.rtMainScore}>
          <span className={styles.rtMainValue}>
            {rtMain?.raw?.value ?? '—'}
          </span>
          {rtMain?.raw?.value != null ? (
            <span className={styles.rtMainScale}>
              {rtMain.raw.value} out of {rtMain.raw.scale.split('-')[1]}
            </span>
          ) : null}
          <span className={styles.rtMainLabel}>Critics</span>
        </div>
        <div className={styles.rtMainScore}>
          <span className={styles.rtMainValue}>
            {formatScore(rtAudience?.normalized ?? null)}
          </span>
          {rtAudience?.raw?.value != null ? (
            <span className={styles.rtMainScale}>
              {rtAudience.raw.value} out of {rtAudience.raw.scale.split('-')[1]}
            </span>
          ) : null}
          <span className={styles.rtMainLabel}>Audience</span>
        </div>
      </div>

      {rtAll || rtTop ? (
        <>
          <div className={styles.rtDivider} />
          <div className={styles.rtSubScores}>
            {rtAll ? (
              <div className={styles.rtSubScore}>
                <span className={styles.rtSubLabel}>All Critics Avg</span>
                <span className={styles.rtSubValue}>
                  {rtAll.raw?.value ?? '—'}
                </span>
              </div>
            ) : null}
            {rtTop ? (
              <div className={styles.rtSubScore}>
                <span className={styles.rtSubLabel}>Top Critics Avg</span>
                <span className={styles.rtSubValue}>
                  {rtTop.raw?.value ?? '—'}
                </span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {rtMain?.fromFallback ? <p className={styles.scoreMuted}>via fallback</p> : null}
      {rtMain?.url ? (
        <a href={rtMain.url} target="_blank" rel="noreferrer" className={styles.scoreLink}>
          View source →
        </a>
      ) : null}
    </div>
  );
});

export default function Home() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [fetchState, dispatch] = useReducer(fetchReducer, { status: 'idle' });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSelected = useRef(false);

  // Derived state from fetchState
  const loading = fetchState.status === 'loading';
  const error = fetchState.status === 'error' ? fetchState.error : null;
  const data = fetchState.status === 'success' ? fetchState.data : null;

  // Debounced search for suggestions
  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }

    if (query.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      setHighlightedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setSuggestions(json.results || []);
        setShowDropdown(json.results?.length > 0);
        setHighlightedIndex(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case 'Enter':
        if (highlightedIndex >= 0) {
          e.preventDefault();
          handleSelect(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const fetchScores = async (title: string) => {
    dispatch({ type: 'FETCH_START' });
    setShowDropdown(false);
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      dispatch({ type: 'FETCH_SUCCESS', data: json as ScorePayload });
    } catch (err) {
      dispatch({ type: 'FETCH_ERROR', error: (err as Error).message });
    }
  };

  const handleSelect = (movie: SearchResult) => {
    justSelected.current = true;
    setQuery(movie.title);
    setSuggestions([]);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    fetchScores(movie.title);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    fetchScores(query);
  };

  // Separate RT scores from others
  const rtScores = data?.sources.filter((s) => s.source.startsWith('rotten_tomatoes')) ?? [];
  const otherScores = data?.sources.filter((s) => !s.source.startsWith('rotten_tomatoes')) ?? [];
  const rtMain = rtScores.find((s) => s.source === 'rotten_tomatoes');
  const rtAudience = rtScores.find((s) => s.source === 'rotten_tomatoes_audience');
  const rtAll = rtScores.find((s) => s.source === 'rotten_tomatoes_all');
  const rtTop = rtScores.find((s) => s.source === 'rotten_tomatoes_top');

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <p className={styles.mastheadTitle}>The Film Index</p>
      </header>

      <section className={styles.hero}>
        <h1 className={styles.headline}>One Score to Rule Them All</h1>
        <p className={styles.subhead}>
          Scores from IMDb, RT, Metacritic, Letterboxd, Mubi, and Douban.
          <br />
          Distilled into one score using a weighted algorithm.
        </p>

        <div className={styles.searchWrapper} ref={dropdownRef}>
          <form className={styles.searchForm} onSubmit={onSubmit}>
            <div className={styles.inputWrapper}>
              <input
                ref={inputRef}
                className={styles.searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                placeholder="Search for a film…"
                autoComplete="off"
                aria-label="Search for a film"
                role="combobox"
                aria-expanded={showDropdown && suggestions.length > 0}
                aria-controls="search-listbox"
                aria-activedescendant={highlightedIndex >= 0 ? `option-${suggestions[highlightedIndex]?.id}` : undefined}
              />
              {searchLoading ? <span className={styles.inputSpinner} /> : null}
            </div>
            <button className={styles.searchBtn} type="submit" disabled={loading}>
              {loading ? 'Loading…' : 'Go'}
            </button>
          </form>

          {showDropdown && suggestions.length > 0 ? (
            <ul id="search-listbox" role="listbox" className={styles.dropdown}>
              {suggestions.map((movie, index) => (
                <li key={movie.id} role="option" id={`option-${movie.id}`} aria-selected={index === highlightedIndex}>
                  <button
                    type="button"
                    className={`${styles.dropdownItem} ${index === highlightedIndex ? styles.dropdownItemHighlighted : ''}`}
                    onClick={() => handleSelect(movie)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {movie.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={movie.poster}
                        alt=""
                        className={styles.dropdownPoster}
                        width={56}
                        height={84}
                      />
                    ) : (
                      <div className={styles.dropdownPosterEmpty} />
                    )}
                    <div className={styles.dropdownInfo}>
                      <span className={styles.dropdownTitle}>{movie.title}</span>
                      {movie.year ? (
                        <span className={styles.dropdownYear}>{movie.year}</span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}
      </section>

      {data ? (
        <section className={styles.results}>
          <div className={styles.movieHeader}>
            <div className={styles.posterWrapper}>
              {data.movie.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.movie.poster}
                  alt={data.movie.title}
                  className={styles.poster}
                  width={360}
                  height={540}
                />
              ) : (
                <div className={styles.posterPlaceholder}>No poster</div>
              )}
            </div>
            <div className={styles.movieInfo}>
              <h2 className={styles.movieTitle}>{data.movie.title}</h2>
              <p className={styles.movieMeta}>
                {data.movie.year && `${data.movie.year} · `}
                {data.movie.imdbId}
              </p>
              <div className={styles.verdictBox}>
                <p className={styles.verdictLabel}>Our Verdict</p>
                <p className={styles.verdictScore}>{formatScore(data.overall?.score ?? null)}</p>
              </div>
            </div>
          </div>

          <div className={styles.scoresSection}>
            <h3 className={styles.scoresTitle}>Individual Scores</h3>
            <div className={styles.scoresGrid}>
              {otherScores.map((s) => (
                <ScoreCard key={s.source} score={s} />
              ))}

              {/* Combined RT Card */}
              {rtScores.length > 0 ? (
                <RTScoreCard
                  rtMain={rtMain}
                  rtAudience={rtAudience}
                  rtAll={rtAll}
                  rtTop={rtTop}
                />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
