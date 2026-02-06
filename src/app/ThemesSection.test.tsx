/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemesSection } from './ThemesSection';

// Mock CSS modules
vi.mock('./page.module.css', () => ({
  default: new Proxy({}, { get: (_, prop) => prop }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const themes = [
  { id: 'th1', label: 'Great Acting', sentiment: 'positive' as const },
  { id: 'th2', label: 'Slow Pacing', sentiment: 'negative' as const },
  { id: 'th3', label: 'Visual Style', sentiment: 'neutral' as const },
];

describe('ThemesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when themes is empty', () => {
    const { container } = render(<ThemesSection themes={[]} imdbId="tt1234567" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders label and all chips', () => {
    render(<ThemesSection themes={themes} imdbId="tt1234567" />);

    expect(screen.getByText('What resonated with audiences')).toBeInTheDocument();
    expect(screen.getByText('Great Acting')).toBeInTheDocument();
    expect(screen.getByText('Slow Pacing')).toBeInTheDocument();
    expect(screen.getByText('Visual Style')).toBeInTheDocument();
  });

  it('clicking chip fetches summary and displays it', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: 'The acting performances were outstanding.' }),
    });

    render(<ThemesSection themes={themes} imdbId="tt1234567" />);

    await user.click(screen.getByText('Great Acting'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/imdb-theme?imdbId=tt1234567&themeId=th1',
      );
    });

    await waitFor(() => {
      expect(screen.getByText('The acting performances were outstanding.')).toBeInTheDocument();
    });
  });

  it('shows loading skeleton while fetching', async () => {
    const user = userEvent.setup();
    // Return a promise that never resolves to keep loading state
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<ThemesSection themes={themes} imdbId="tt1234567" />);

    await user.click(screen.getByText('Great Acting'));

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.themeSummarySkeleton');
      expect(skeletons.length).toBe(3);
    });
  });

  it('shows error on fetch failure', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<ThemesSection themes={themes} imdbId="tt1234567" />);

    await user.click(screen.getByText('Great Acting'));

    await waitFor(() => {
      expect(screen.getByText('Summary unavailable. Try the IMDb link below.')).toBeInTheDocument();
    });
  });

  it('toggling same chip hides summary', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: 'Great performances.' }),
    });

    render(<ThemesSection themes={themes} imdbId="tt1234567" />);

    // Click to open
    await user.click(screen.getByText('Great Acting'));

    await waitFor(() => {
      expect(screen.getByText('Great performances.')).toBeInTheDocument();
    });

    // Click again to close
    await user.click(screen.getByText('Great Acting'));

    await waitFor(() => {
      expect(screen.queryByText('Great performances.')).not.toBeInTheDocument();
    });
  });

  it('switching chips shows correct summary', async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('themeId=th1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ summary: 'Summary for th1' }),
        });
      }
      if (url.includes('themeId=th2')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ summary: 'Summary for th2' }),
        });
      }
      return Promise.reject(new Error('Unhandled'));
    });

    render(<ThemesSection themes={themes} imdbId="tt1234567" />);

    // Click first chip
    await user.click(screen.getByText('Great Acting'));
    await waitFor(() => {
      expect(screen.getByText('Summary for th1')).toBeInTheDocument();
    });

    // Click second chip
    await user.click(screen.getByText('Slow Pacing'));
    await waitFor(() => {
      expect(screen.getByText('Summary for th2')).toBeInTheDocument();
      expect(screen.queryByText('Summary for th1')).not.toBeInTheDocument();
    });
  });

  it('cached summaries are not re-fetched', async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('themeId=th1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ summary: 'Summary for th1' }),
        });
      }
      if (url.includes('themeId=th2')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ summary: 'Summary for th2' }),
        });
      }
      return Promise.reject(new Error('Unhandled'));
    });

    render(<ThemesSection themes={themes} imdbId="tt1234567" />);

    // Click th1
    await user.click(screen.getByText('Great Acting'));
    await waitFor(() => {
      expect(screen.getByText('Summary for th1')).toBeInTheDocument();
    });

    // Switch to th2
    await user.click(screen.getByText('Slow Pacing'));
    await waitFor(() => {
      expect(screen.getByText('Summary for th2')).toBeInTheDocument();
    });

    // Switch back to th1 — should NOT re-fetch
    const fetchCountBefore = mockFetch.mock.calls.filter((c: string[]) =>
      c[0].includes('themeId=th1'),
    ).length;

    await user.click(screen.getByText('Great Acting'));
    await waitFor(() => {
      expect(screen.getByText('Summary for th1')).toBeInTheDocument();
    });

    const fetchCountAfter = mockFetch.mock.calls.filter((c: string[]) =>
      c[0].includes('themeId=th1'),
    ).length;

    expect(fetchCountAfter).toBe(fetchCountBefore);
  });
});
