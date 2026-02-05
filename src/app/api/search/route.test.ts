import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the config module
vi.mock('@/lib/config', () => ({
  getApiKeys: () => ({ tmdbKey: 'test-key' }),
}));

// We need to dynamically import the route after mocking
let GET: typeof import('./route').GET;

describe('GET /api/search', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    // Reset modules to pick up fresh mocks
    vi.resetModules();
    const route = await import('./route');
    GET = route.GET;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetch(results: Array<{ id: number; title: string; release_date?: string; popularity?: number }>) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results }),
    });
  }

  function createRequest(query: string): Request {
    return new Request(`http://localhost/api/search?q=${encodeURIComponent(query)}`);
  }

  it('extracts year from query and uses primary_release_year parameter', async () => {
    mockFetch([{ id: 1, title: 'Dune', release_date: '2021-10-22', popularity: 100 }]);

    await GET(createRequest('Dune 2021'));

    // Verify TMDB was called with primary_release_year
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('primary_release_year=2021'),
      expect.any(Object),
    );
  });

  it('re-ranks results to prioritize exact year match', async () => {
    mockFetch([
      { id: 1, title: 'Dune', release_date: '1984-12-14', popularity: 50 },
      { id: 2, title: 'Dune', release_date: '2021-10-22', popularity: 30 },
    ]);

    const response = await GET(createRequest('Dune 2021'));
    const data = await response.json();

    // 2021 version should be ranked first due to year match
    expect(data.results[0].id).toBe(2);
    expect(data.results[0].year).toBe('2021');
  });

  it('handles typo-tolerant queries through phonetic matching', async () => {
    mockFetch([
      { id: 1, title: 'The Godfather', release_date: '1972-03-24', popularity: 100 },
      { id: 2, title: 'Dogfather', release_date: '2010-01-01', popularity: 10 },
    ]);

    const response = await GET(createRequest('Godfahter'));
    const data = await response.json();

    // "The Godfather" should rank higher due to phonetic similarity
    expect(data.results[0].id).toBe(1);
  });

  it('does NOT extract year from titles like "2001: A Space Odyssey"', async () => {
    mockFetch([
      { id: 1, title: '2001: A Space Odyssey', release_date: '1968-04-02', popularity: 100 },
    ]);

    await GET(createRequest('2001: A Space Odyssey'));

    // Should NOT have primary_release_year=2001
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('primary_release_year='),
      expect.any(Object),
    );
  });

  it('handles accented characters in search', async () => {
    mockFetch([
      { id: 1, title: 'Amélie', release_date: '2001-04-25', popularity: 100 },
    ]);

    const response = await GET(createRequest('Amélie'));
    const data = await response.json();

    expect(data.results[0].title).toBe('Amélie');
  });

  it('falls back to search without year if year filter returns empty', async () => {
    // First call returns empty (year-filtered), second returns results
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: [{ id: 1, title: 'Dune', release_date: '2021-10-22', popularity: 100 }],
        }),
      });
    });

    const response = await GET(createRequest('Dune 2021'));
    const data = await response.json();

    // Should have made two API calls (with year, then without)
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(data.results.length).toBe(1);
  });

  it('returns empty array for short queries (< 2 chars)', async () => {
    mockFetch([]);

    const response = await GET(createRequest('D'));
    const data = await response.json();

    expect(data.results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ranks by similarity + popularity when no year specified', async () => {
    mockFetch([
      { id: 1, title: 'The Matrix Reloaded', release_date: '2003-05-15', popularity: 150 },
      { id: 2, title: 'The Matrix', release_date: '1999-03-31', popularity: 100 },
      { id: 3, title: 'Matrix Revolutions', release_date: '2003-11-05', popularity: 80 },
    ]);

    const response = await GET(createRequest('matrix'));
    const data = await response.json();

    // "The Matrix" should rank highest (exact match after article removal)
    expect(data.results[0].id).toBe(2);
  });

  it('falls back to & variant when original returns empty', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      // Original query "Pride and Prejudice" returns empty
      if (url.includes('Pride%20and%20Prejudice')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
      }
      // Variant "Pride & Prejudice" returns result
      if (url.includes('Pride%20%26%20Prejudice') || url.includes('Pride%26Prejudice')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: [{ id: 1, title: 'Pride & Prejudice', release_date: '2005-11-11', popularity: 80 }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
    });

    const response = await GET(createRequest('Pride and Prejudice'));
    const data = await response.json();

    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe('Pride & Prejudice');
  });

  it('falls back to apostrophe-removed variant when original returns empty', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      // Original "Ocean's Eleven" returns empty
      if (url.includes("Ocean's") || url.includes('Ocean%27s')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
      }
      // Variant "Oceans Eleven" returns result
      if (url.includes('Oceans%20Eleven')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: [{ id: 2, title: "Ocean's Eleven", release_date: '2001-12-07', popularity: 70 }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
    });

    const response = await GET(createRequest("Ocean's Eleven"));
    const data = await response.json();

    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("Ocean's Eleven");
  });

  it('dedupes results from multiple variants', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      // Original returns empty
      if (url.includes('Spider-Man')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
      }
      // Both variants return the same movie
      if (url.includes('Spider%20Man') || url.includes('SpiderMan')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: [{ id: 3, title: 'Spider-Man', release_date: '2002-05-03', popularity: 90 }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
    });

    const response = await GET(createRequest('Spider-Man'));
    const data = await response.json();

    // Should have exactly 1 result, not 2 duplicates
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe('Spider-Man');
  });

  it('does not call variants when original query succeeds', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: [{ id: 1, title: 'Pride & Prejudice', release_date: '2005-11-11', popularity: 80 }],
        }),
      });
    });

    await GET(createRequest('Pride & Prejudice'));

    // Should only call once (original query succeeded)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
