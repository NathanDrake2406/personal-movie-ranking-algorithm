# Movies Ranking

A Next.js app that aggregates movie scores from multiple sources (IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Mubi, Douban), normalizes them to 0–100, and computes a weighted composite score.

**Live:** https://movies-ranking-rho.vercel.app

## Setup
```bash
npm install
```

Add API keys in `.env.local`:
```env
OMDB_API_KEY=your_omdb_key    # Optional if rotation keys configured
TMDB_API_KEY=your_tmdb_key    # Recommended for better movie resolution
```

Optional IMDb theme summaries (reverse-engineered GraphQL). Defaults are set for `AIThemePrompt` on `caching.graphql.imdb.com`, so only override if IMDb changes:
```env
IMDB_THEME_GQL_URL=https://caching.graphql.imdb.com/
IMDB_THEME_GQL_OPERATION=AIThemePrompt
IMDB_THEME_GQL_PERSISTED_HASH=33e1aa46f0f8a40bda4e54b9e3c9cb70a2c8c467ce7b01bb03e887c1641b3024
# OR provide a raw query instead of persisted hash:
# IMDB_THEME_GQL_QUERY=query YourOperationName($tconst: ID!, $themeId: ID!) { ... }
IMDB_THEME_GQL_VARIABLES={\"locale\":\"en-US\",\"showOriginalTitleText\":false,\"themeId\":\"{{themeId}}\",\"titleId\":\"{{imdbId}}\"}
# Optional headers/cookie if required by IMDb
# IMDB_THEME_GQL_HEADERS={\"x-imdb-client-name\":\"imdb-web-next-localized\",\"x-imdb-user-country\":\"US\"}
# IMDB_THEME_COOKIE=your_cookie_value
```

Run dev server:
```bash
npm run dev
```

## How it works
- **Title resolution:** TMDB search → canonical IMDb ID + poster/year. Falls back to OMDb with key rotation.
- **Wikidata lookup:** Fetches slugs for RT, Metacritic, Letterboxd, Mubi, Douban by IMDb ID.
- **Sources:**
  - IMDb: OMDB API with key rotation → direct HTML scrape fallback
  - Rotten Tomatoes: Verified audience preferred, falls back to all audience
  - Metacritic, Letterboxd, Mubi, Douban: HTML scrape with Wikidata slugs
- **Normalization:** Each score mapped to 0–100 in `src/lib/normalize.ts`
- **Scoring:** Bloc-based weighted average (Mainstream 20%, Cinephiles 35%, Critics 45%)
- **API:** POST `/api/score` with `{ tmdbId }` → movie metadata, per-source scores, composite
- **Caching:** In-memory 5-minute cache per IMDb ID

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
