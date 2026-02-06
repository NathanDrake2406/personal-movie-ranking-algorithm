import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImdbThemeSummaryResult } from '@/lib/imdb-theme';

const mockFetch = vi.fn<() => Promise<ImdbThemeSummaryResult>>();

vi.mock('@/lib/imdb-theme', () => ({
  fetchImdbThemeSummary: (..._args: unknown[]) => mockFetch(),
}));

import { GET } from './route';

describe('GET /api/imdb-theme', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns summary for valid params', async () => {
    mockFetch.mockResolvedValue({ status: 'found', summary: 'The cinematography dazzles.' });
    const req = new Request('http://localhost/api/imdb-theme?imdbId=tt123&themeId=theme-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toBe('The cinematography dazzles.');
  });

  it('400s when params missing', async () => {
    const req = new Request('http://localhost/api/imdb-theme');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('404s when summary not found', async () => {
    mockFetch.mockResolvedValue({ status: 'not_found' });
    const req = new Request('http://localhost/api/imdb-theme?imdbId=tt123&themeId=theme-1');
    const res = await GET(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Summary unavailable');
  });

  it('500s on config error', async () => {
    mockFetch.mockResolvedValue({ status: 'config_error', error: 'Missing persisted hash' });
    const req = new Request('http://localhost/api/imdb-theme?imdbId=tt123&themeId=theme-1');
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Missing persisted hash');
  });

  it('502s on upstream error', async () => {
    mockFetch.mockResolvedValue({ status: 'upstream_error', error: 'Request failed: 503 Service Unavailable' });
    const req = new Request('http://localhost/api/imdb-theme?imdbId=tt123&themeId=theme-1');
    const res = await GET(req);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe('Request failed: 503 Service Unavailable');
  });
});
