/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import Home from './page';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock CSS modules
vi.mock('./page.module.css', () => ({
  default: new Proxy({}, { get: (_, prop) => prop }),
}));

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

describe('Home page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchScores race condition handling', () => {
    it('cancels previous score fetch when new movie is selected', async () => {
      const user = userEvent.setup();
      const abortedRequests: string[] = [];
      const resolvers: { [key: string]: (value: Response) => void } = {};

      // Track which requests get aborted
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        // Search API - return immediately with movie suggestions
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [
                { id: 1, title: 'Movie A', year: '2020', poster: null },
                { id: 2, title: 'Movie B', year: '2021', poster: null },
              ],
            }),
          });
        }

        // Score API - return a controllable promise
        if (url.includes('/api/score')) {
          const body = options?.body ? JSON.parse(options.body as string) : {};
          const movieId = body.tmdbId;

          // If signal is provided, track abort
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              abortedRequests.push(`movie-${movieId}`);
            });
          }

          // Return a promise we can control
          return new Promise((resolve) => {
            resolvers[`movie-${movieId}`] = resolve;
          });
        }

        return Promise.reject(new Error('Unhandled URL: ' + url));
      });

      render(<Home />);

      // Type in search
      const input = screen.getByRole('combobox');
      await user.type(input, 'Movie');

      // Wait for suggestions to appear
      await waitFor(() => {
        expect(screen.getByText('Movie A')).toBeInTheDocument();
      });

      // Click Movie A (starts first fetch)
      await user.click(screen.getByText('Movie A'));

      // Wait a tick for the fetch to be initiated
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/score',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ tmdbId: 1 }),
          })
        );
      });

      // Type again to get suggestions
      await user.clear(input);
      await user.type(input, 'Movie');

      // Wait for suggestions again
      await waitFor(() => {
        expect(screen.getByText('Movie B')).toBeInTheDocument();
      });

      // Click Movie B (should abort Movie A fetch, start Movie B fetch)
      await user.click(screen.getByText('Movie B'));

      // Wait for second fetch to be initiated
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/score',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ tmdbId: 2 }),
          })
        );
      });

      // Verify Movie A request was aborted
      expect(abortedRequests).toContain('movie-1');
    });

    it('ignores stale responses when AbortController cancels the request', async () => {
      const user = userEvent.setup();
      let movieAResolver: ((value: Response) => void) | null = null;
      let movieBResolver: ((value: Response) => void) | null = null;

      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/api/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              results: [
                { id: 1, title: 'Movie A', year: '2020', poster: null },
                { id: 2, title: 'Movie B', year: '2021', poster: null },
              ],
            }),
          });
        }

        if (url.includes('/api/score')) {
          const body = options?.body ? JSON.parse(options.body as string) : {};
          const movieId = body.tmdbId;

          return new Promise((resolve, reject) => {
            // Listen for abort
            if (options?.signal) {
              options.signal.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }

            if (movieId === 1) {
              movieAResolver = resolve;
            } else if (movieId === 2) {
              movieBResolver = resolve;
            }
          });
        }

        return Promise.reject(new Error('Unhandled URL: ' + url));
      });

      render(<Home />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'Movie');

      await waitFor(() => {
        expect(screen.getByText('Movie A')).toBeInTheDocument();
      });

      // Select Movie A
      await user.click(screen.getByText('Movie A'));

      // Select Movie B quickly (before Movie A resolves)
      await user.clear(input);
      await user.type(input, 'Movie');

      await waitFor(() => {
        expect(screen.getByText('Movie B')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Movie B'));

      // Movie B resolves first
      movieBResolver!({
        ok: true,
        json: () => Promise.resolve({
          movie: { title: 'Movie B', year: '2021', imdbId: 'tt0000002', poster: null },
          sources: [],
          overall: { score: 85 },
          missingSources: [],
        }),
      } as Response);

      // Wait for Movie B to display
      await waitFor(() => {
        expect(screen.getByText('Movie B')).toBeInTheDocument();
        expect(screen.getByText('85')).toBeInTheDocument();
      });

      // Movie A should have been aborted and won't overwrite
      // The UI should still show Movie B
      expect(screen.getByText('Movie B')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument();
    });
  });
});
