import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/imdb-theme', () => ({
  fetchImdbThemeSummary: vi.fn(async () => ({ summary: 'Reviewers say the cinematography dazzles.' })),
}));

import { GET } from './route';

describe('GET /api/imdb-theme', () => {
  it('returns summary for valid params', async () => {
    const req = new Request('http://localhost/api/imdb-theme?imdbId=tt123&themeId=theme-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toBe('Reviewers say the cinematography dazzles.');
  });

  it('400s when params missing', async () => {
    const req = new Request('http://localhost/api/imdb-theme');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
