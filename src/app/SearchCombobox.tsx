'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import styles from './page.module.css';
import { Poster } from './Poster';

type SearchResult = {
  id: number;
  title: string;
  year: string | null;
  poster: string | null;
};

export type SearchComboboxProps = {
  onSelect: (tmdbId: number) => void;
  disabled?: boolean;
};

export function SearchCombobox({ onSelect, disabled }: SearchComboboxProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSelected = useRef(false);

  // Debounced search for suggestions with request cancellation
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

    const abortController = new AbortController();

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: abortController.signal,
        });
        const json = await res.json();
        setSuggestions(json.results || []);
        setShowDropdown(true);
        setHighlightedIndex(-1);
      } catch (err) {
        // Ignore aborted requests
        if ((err as Error).name !== 'AbortError') {
          setSuggestions([]);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
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

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listboxRef.current) {
      const item = listboxRef.current.children[highlightedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const handleSelect = (movie: SearchResult) => {
    justSelected.current = true;
    setQuery(movie.title);
    setSuggestions([]);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    onSelect(movie.id);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!showDropdown) {
          setShowDropdown(true);
          setHighlightedIndex(0);
        } else {
          setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!showDropdown) {
          setShowDropdown(true);
          setHighlightedIndex(suggestions.length - 1);
        } else {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        }
        break;
      case 'Enter':
        if (showDropdown && highlightedIndex >= 0) {
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

  return (
    <div className={styles.searchWrapper} ref={dropdownRef}>
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
          aria-autocomplete="list"
          aria-expanded={showDropdown && suggestions.length > 0}
          aria-controls="search-listbox"
          aria-activedescendant={highlightedIndex >= 0 ? `option-${suggestions[highlightedIndex]?.id}` : undefined}
          disabled={disabled}
        />
        {searchLoading && <span className={styles.inputSpinner} />}
        {query && !searchLoading && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setShowDropdown(false);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {showDropdown && suggestions.length > 0 ? (
        <ul id="search-listbox" role="listbox" className={styles.dropdown} ref={listboxRef}>
          {suggestions.map((movie, index) => (
            <li key={movie.id} role="option" id={`option-${movie.id}`} aria-selected={index === highlightedIndex}>
              <button
                type="button"
                className={`${styles.dropdownItem} ${index === highlightedIndex ? styles.dropdownItemHighlighted : ''}`}
                onClick={() => handleSelect(movie)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {movie.poster ? (
                  <Poster
                    src={movie.poster}
                    alt=""
                    width={56}
                    height={84}
                    className={styles.dropdownPoster}
                    skeletonClassName={styles.dropdownPosterSkeleton}
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

      {showDropdown && query.length >= 2 && suggestions.length === 0 && !searchLoading ? (
        <div className={styles.noResults}>No results found</div>
      ) : null}
    </div>
  );
}
