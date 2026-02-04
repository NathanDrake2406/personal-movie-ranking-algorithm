import { distance } from 'fastest-levenshtein';

/**
 * Parsed query result with optional year extraction
 */
export type ParsedQuery = {
  title: string;
  year: number | null;
};

/**
 * TMDB search result for re-ranking
 */
export type SearchResult = {
  id: number;
  title: string;
  release_date?: string;
  popularity?: number;
};

/**
 * Extract year from query like "Dune 2021" or "Dune (2021)"
 * Avoids false positives for titles like "2001: A Space Odyssey" or "1984"
 */
export function parseQuery(query: string): ParsedQuery {
  const trimmed = query.trim();

  // Pattern: year at end with optional parentheses, e.g., "Dune 2021" or "Dune (2021)"
  // Must have a title before the year (at least 2 chars)
  const yearAtEndPattern = /^(.{2,}?)\s*\(?(\d{4})\)?$/;
  const match = trimmed.match(yearAtEndPattern);

  if (match) {
    const [, titlePart, yearPart] = match;
    const year = parseInt(yearPart, 10);

    // Only accept years in reasonable movie range (1880-2030)
    if (year >= 1880 && year <= 2030) {
      // Avoid extracting year from titles where it's integral
      // e.g., "2001: A Space Odyssey" → title starts with the year
      // e.g., "1984" → entire title is the year
      const cleanTitle = titlePart.trim();
      if (cleanTitle.length > 0 && !cleanTitle.match(/^\d{4}/)) {
        return { title: cleanTitle, year };
      }
    }
  }

  return { title: trimmed, year: null };
}

/**
 * Normalize title for comparison:
 * - Lowercase
 * - Remove diacritics (Amélie → Amelie)
 * - Strip leading articles (The, A, An)
 * - Remove punctuation
 * - Collapse whitespace
 */
export function normalizeTitle(title: string): string {
  return (
    title
      .toLowerCase()
      // Remove diacritics
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Remove leading articles
      .replace(/^(the|a|an)\s+/i, '')
      // Remove punctuation
      .replace(/[^\w\s]/g, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Generate a simplified phonetic key for typo matching.
 * This is a lightweight Soundex-inspired approach:
 * - Handle common digraphs (th, ph, gh)
 * - Remove silent/weak consonants (h)
 * - Collapse repeated consonants
 * - Map similar-sounding letters
 * - Remove vowels (except leading)
 */
export function phoneticKey(str: string): string {
  const normalized = normalizeTitle(str);

  return (
    normalized
      // Handle common digraphs first
      .replace(/ph/g, 'f')
      .replace(/gh/g, 'g')
      .replace(/th/g, 't')
      .replace(/wh/g, 'w')
      // Remove standalone h (often silent or misplaced in typos)
      .replace(/h/g, '')
      // Map similar consonants
      .replace(/[ck]/g, 'k')
      .replace(/[sz]/g, 's')
      .replace(/[dt]/g, 't')
      .replace(/[bp]/g, 'p')
      .replace(/[fvw]/g, 'f')
      .replace(/[gj]/g, 'g')
      .replace(/[mn]/g, 'n')
      .replace(/[lr]/g, 'r')
      // Remove vowels (except first char) - helps with typos like "Godfahter"
      .replace(/(?!^)[aeiou]/g, '')
      // Collapse repeated characters
      .replace(/(.)\1+/g, '$1')
      // Remove spaces
      .replace(/\s/g, '')
  );
}

/**
 * Calculate similarity between query and title (0-1 scale)
 * Uses Levenshtein distance normalized by max length
 */
export function similarity(query: string, title: string): number {
  const normQuery = normalizeTitle(query);
  const normTitle = normalizeTitle(title);

  if (normQuery === normTitle) return 1;
  if (normQuery.length === 0 || normTitle.length === 0) return 0;

  const dist = distance(normQuery, normTitle);
  const maxLen = Math.max(normQuery.length, normTitle.length);

  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Check if two strings are phonetically similar (typo tolerance)
 */
export function phoneticMatch(a: string, b: string): boolean {
  return phoneticKey(a) === phoneticKey(b);
}

/**
 * Score weights for ranking
 */
const WEIGHTS = {
  SIMILARITY_BASE: 0.35, // 35% base weight for title similarity
  NEAR_EXACT_BONUS: 20, // Bonus for >0.9 similarity
  PREFIX_MATCH_BONUS: 25, // Bonus when query is prefix of title (franchise/sequels)
  YEAR_MATCH_BONUS: 20, // Bonus for matching requested year
  PHONETIC_BONUS: 10, // Bonus for phonetic match
  RECENCY_BONUS: 10, // Max bonus for recent movies (decays over 20 years)
  POPULARITY_WEIGHT: 0.25, // 25% for popularity
};

const CURRENT_YEAR = new Date().getFullYear();
const RECENCY_DECAY_YEARS = 20; // Full bonus for current year, decays to 0 over 20 years

/**
 * Check if query is a prefix of title (for franchise/sequel matching)
 */
function isPrefixMatch(query: string, title: string): boolean {
  const normQuery = normalizeTitle(query);
  const normTitle = normalizeTitle(title);
  return normTitle.startsWith(normQuery) && normTitle.length > normQuery.length;
}

/**
 * Calculate recency bonus (0 to RECENCY_BONUS points)
 * Full bonus for current year, linear decay over RECENCY_DECAY_YEARS
 */
function getRecencyBonus(releaseDate: string | undefined): number {
  if (!releaseDate) return 0;

  const year = parseInt(releaseDate.split('-')[0], 10);
  if (isNaN(year)) return 0;

  const yearsAgo = CURRENT_YEAR - year;
  if (yearsAgo < 0) return WEIGHTS.RECENCY_BONUS; // Future releases get full bonus
  if (yearsAgo >= RECENCY_DECAY_YEARS) return 0;

  return WEIGHTS.RECENCY_BONUS * (1 - yearsAgo / RECENCY_DECAY_YEARS);
}

/**
 * Calculate ranking score for a single result
 */
function calculateScore(
  result: SearchResult,
  queryTitle: string,
  queryYear: number | null,
  maxPopularity: number,
): number {
  let score = 0;

  // Title similarity (0-40 points base)
  const sim = similarity(queryTitle, result.title);
  score += sim * 100 * WEIGHTS.SIMILARITY_BASE;

  // Near-exact match bonus
  if (sim > 0.9) {
    score += WEIGHTS.NEAR_EXACT_BONUS;
  }

  // Prefix match bonus (query "Dune" matches "Dune: Part Two")
  if (isPrefixMatch(queryTitle, result.title)) {
    score += WEIGHTS.PREFIX_MATCH_BONUS;
  }

  // Phonetic match bonus (helps with typos)
  if (phoneticMatch(queryTitle, result.title)) {
    score += WEIGHTS.PHONETIC_BONUS;
  }

  // Year match bonus (when user specifies a year)
  if (queryYear && result.release_date) {
    const resultYear = parseInt(result.release_date.split('-')[0], 10);
    if (resultYear === queryYear) {
      score += WEIGHTS.YEAR_MATCH_BONUS;
    }
  }

  // Recency bonus (0-20 points, favors recent movies)
  score += getRecencyBonus(result.release_date);

  // Popularity (0-25 points)
  const popularity = result.popularity ?? 0;
  const normalizedPopularity = maxPopularity > 0 ? popularity / maxPopularity : 0;
  score += normalizedPopularity * 100 * WEIGHTS.POPULARITY_WEIGHT;

  return score;
}

/**
 * Re-rank TMDB results based on similarity, year match, and popularity
 */
export function rankResults(
  results: SearchResult[],
  queryTitle: string,
  queryYear: number | null,
): SearchResult[] {
  if (results.length === 0) return [];

  // Find max popularity for normalization
  const maxPopularity = Math.max(...results.map((r) => r.popularity ?? 0), 1);

  // Calculate scores and sort
  const scored = results.map((result) => ({
    result,
    score: calculateScore(result, queryTitle, queryYear, maxPopularity),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.result);
}
