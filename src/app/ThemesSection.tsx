'use client';

import { useReducer, useCallback } from 'react';
import styles from './page.module.css';

type Theme = {
  id: string;
  label: string;
  sentiment: 'positive' | 'negative' | 'neutral';
};

export type ThemesSectionProps = {
  themes: Theme[];
  imdbId: string;
};

type ThemesState = {
  activeThemeId: string | null;
  summaries: Record<string, string>;
  errors: Record<string, string>;
  loadingThemeId: string | null;
};

type ThemesAction =
  | { type: 'TOGGLE_THEME'; themeId: string }
  | { type: 'FETCH_START'; themeId: string }
  | { type: 'FETCH_SUCCESS'; themeId: string; summary: string }
  | { type: 'FETCH_ERROR'; themeId: string; error: string };

function themesReducer(state: ThemesState, action: ThemesAction): ThemesState {
  switch (action.type) {
    case 'TOGGLE_THEME':
      return {
        ...state,
        activeThemeId: state.activeThemeId === action.themeId ? null : action.themeId,
      };
    case 'FETCH_START': {
      const nextErrors = { ...state.errors };
      delete nextErrors[action.themeId];
      return {
        ...state,
        loadingThemeId: action.themeId,
        errors: nextErrors,
      };
    }
    case 'FETCH_SUCCESS':
      return {
        ...state,
        summaries: { ...state.summaries, [action.themeId]: action.summary },
        loadingThemeId: state.loadingThemeId === action.themeId ? null : state.loadingThemeId,
      };
    case 'FETCH_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.themeId]: action.error },
        loadingThemeId: state.loadingThemeId === action.themeId ? null : state.loadingThemeId,
      };
  }
}

const initialState: ThemesState = {
  activeThemeId: null,
  summaries: {},
  errors: {},
  loadingThemeId: null,
};

export function ThemesSection({ themes, imdbId }: ThemesSectionProps) {
  const [state, dispatch] = useReducer(themesReducer, initialState);
  const { activeThemeId, summaries, errors, loadingThemeId } = state;

  const handleChipClick = useCallback(
    async (theme: Theme) => {
      dispatch({ type: 'TOGGLE_THEME', themeId: theme.id });

      // After toggling off, or if already cached/loading, skip fetch
      // We need to check against the *next* state, which after TOGGLE_THEME
      // will have activeThemeId toggled. If it was active, it's now null (toggled off).
      // We can't read reducer state directly here, so we check pre-toggle state:
      // If activeThemeId === theme.id, it means we just toggled it OFF → skip fetch
      if (activeThemeId === theme.id) return;

      // If already cached or currently loading this theme, skip fetch
      if (summaries[theme.id] || loadingThemeId === theme.id) return;

      dispatch({ type: 'FETCH_START', themeId: theme.id });

      try {
        const res = await fetch(
          `/api/imdb-theme?imdbId=${encodeURIComponent(imdbId)}&themeId=${encodeURIComponent(theme.id)}`,
        );
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const json = (await res.json()) as { summary?: string };
        if (!json.summary) throw new Error('Summary unavailable');
        dispatch({ type: 'FETCH_SUCCESS', themeId: theme.id, summary: json.summary });
      } catch (err) {
        dispatch({ type: 'FETCH_ERROR', themeId: theme.id, error: (err as Error).message });
      }
    },
    [activeThemeId, imdbId, loadingThemeId, summaries],
  );

  if (themes.length === 0) return null;

  const activeSummary = activeThemeId ? summaries[activeThemeId] : null;
  const activeError = activeThemeId ? errors[activeThemeId] : null;
  const isLoading = activeThemeId && loadingThemeId === activeThemeId;

  return (
    <div className={styles.themesSection}>
      <p className={styles.themesLabel}>What resonated with audiences</p>
      <div className={styles.themesGrid}>
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`${styles.themeChip} ${
              theme.sentiment === 'positive'
                ? styles.themeChipPositive
                : theme.sentiment === 'negative'
                ? styles.themeChipNegative
                : styles.themeChipNeutral
            } ${activeThemeId === theme.id ? styles.themeChipActive : ''}`}
            onClick={() => handleChipClick(theme)}
          >
            {theme.label}
          </button>
        ))}
      </div>
      {activeThemeId && (
        <div className={styles.themeSummary}>
          {isLoading && (
            <div className={styles.themeSummaryLoading}>
              <div className={styles.themeSummarySkeleton} />
              <div className={styles.themeSummarySkeleton} />
              <div className={styles.themeSummarySkeleton} />
            </div>
          )}
          {!isLoading && activeError && (
            <p className={styles.themeSummaryError}>Summary unavailable. Try the IMDb link below.</p>
          )}
          {!isLoading && !activeError && activeSummary && <p>{activeSummary}</p>}
        </div>
      )}
    </div>
  );
}
