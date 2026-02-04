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
