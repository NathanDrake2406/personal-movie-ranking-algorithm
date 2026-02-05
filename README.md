# Movies Ranking

A Next.js app that aggregates movie scores from multiple sources (IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Mubi, Douban, AlloCiné), normalizes them to 0–100, and computes a weighted composite score. Also displays AI-generated review themes and summaries from IMDb.

**Live:** https://movies-ranking-rho.vercel.app

## Setup
```bash
npm install
```

Add API keys in `.env.local`:
```env
TMDB_API_KEY=your_tmdb_key    # Required for movie search
OMDB_API_KEY=your_omdb_key    # Optional, improves reliability
```

IMDb theme summaries are enabled by default. Override these env vars only if needed:
```env
IMDB_THEME_GQL_URL=           # GraphQL endpoint
IMDB_THEME_GQL_PERSISTED_HASH= # Query hash (see source for default)
```

Run dev server:
```bash
npm run dev
```

## How it works

- **Title resolution:** TMDB search → canonical IMDb ID + poster/year/metadata. Falls back to OMDb with key rotation.
- **Wikidata lookup:** Fetches slugs for RT, Metacritic, Letterboxd, Mubi, Douban, AlloCiné by IMDb ID.
- **Sources:**
  - IMDb: OMDB API with key rotation → direct HTML scrape fallback
  - Rotten Tomatoes: Verified audience preferred, falls back to all audience; includes critics/audience consensus
  - Metacritic, Letterboxd, Mubi, Douban, AlloCiné: HTML scrape with Wikidata slugs
- **IMDb Themes:** Reverse-engineered GraphQL API fetches AI-generated per-theme summaries (persisted query pattern)
- **Normalization:** Each score mapped to 0–100 in `src/lib/normalize.ts`
- **Scoring:** Flat weighted average - Critics 51%, Mid-tier 25%, Popular 24%
- **API:** POST `/api/score` with `{ tmdbId }` → movie metadata, per-source scores, composite
- **Caching:** 5-minute cache for scores, 24-hour cache for theme summaries

## Testing
- Run the suite:
```bash
npm test
```
- Coverage report (HTML + text):
```bash
npm test -- --coverage
```
- Lint:
```bash
npm run lint
```

## Architecture

### IMDb GraphQL Scraper

The app reverse-engineers IMDb's internal GraphQL API to fetch AI-generated review summaries per theme. Key implementation details:

- **Persisted queries:** IMDb uses Apollo-style persisted query hashes. We send the hash instead of the full query, which IMDb's caching endpoint accepts via GET params.
- **BFS response parsing:** Since IMDb's response shape can vary, the parser uses breadth-first search to locate theme summaries by matching `themeId` at any nesting level.
- **Configurable:** All GraphQL params (endpoint, hash, variables template, headers) are overridable via env vars for resilience.

See `src/lib/imdb-theme.ts` for implementation and `src/lib/parsers.ts` for the response parser.
