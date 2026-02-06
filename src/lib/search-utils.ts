import { distance } from "fastest-levenshtein";

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
  vote_count?: number;
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
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Remove leading articles
      .replace(/^(the|a|an)\s+/i, "")
      // Remove punctuation
      .replace(/[^\w\s]/g, "")
      // Collapse whitespace
      .replace(/\s+/g, " ")
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
      .replace(/ph/g, "f")
      .replace(/gh/g, "g")
      .replace(/th/g, "t")
      .replace(/wh/g, "w")
      // Remove standalone h (often silent or misplaced in typos)
      .replace(/h/g, "")
      // Map similar consonants
      .replace(/[ck]/g, "k")
      .replace(/[sz]/g, "s")
      .replace(/[dt]/g, "t")
      .replace(/[bp]/g, "p")
      .replace(/[fvw]/g, "f")
      .replace(/[gj]/g, "g")
      .replace(/[mn]/g, "n")
      .replace(/[lr]/g, "r")
      // Remove vowels (except first char) - helps with typos like "Godfahter"
      .replace(/(?!^)[aeiou]/g, "")
      // Collapse repeated characters
      .replace(/(.)\1+/g, "$1")
      // Remove spaces
      .replace(/\s/g, "")
  );
}

/**
 * Split a normalized string into word tokens.
 */
function tokenize(normalized: string): string[] {
  return normalized.split(/\s+/).filter(Boolean);
}

/**
 * Calculate similarity between query and title (0-1 scale)
 * Uses Levenshtein distance normalized by max length
 */
export function similarity(query: string, title: string): number {
  const normQuery = normalizeTitle(query);
  const normTitle = normalizeTitle(title);

  return similarityNormalized(normQuery, normTitle);
}

/**
 * Similarity on pre-normalized strings (avoids redundant normalizeTitle calls)
 */
function similarityNormalized(normQuery: string, normTitle: string): number {
  if (normQuery === normTitle) return 1;
  if (normQuery.length === 0 || normTitle.length === 0) return 0;

  const dist = distance(normQuery, normTitle);
  const maxLen = Math.max(normQuery.length, normTitle.length);

  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Token-level similarity on pre-normalized strings.
 * For each query word, finds the best-matching title word (by Levenshtein).
 * Averages the per-token best matches. Handles word transpositions naturally:
 * "knight dark" vs "dark knight" → each word matches perfectly → 1.0
 */
function tokenSimilarityNormalized(
  normQuery: string,
  normTitle: string,
): number {
  const queryTokens = tokenize(normQuery);
  const titleTokens = tokenize(normTitle);

  if (queryTokens.length === 0 || titleTokens.length === 0) return 0;

  let totalSim = 0;
  for (const qt of queryTokens) {
    let bestSim = 0;
    for (const tt of titleTokens) {
      const sim = similarityNormalized(qt, tt);
      if (sim > bestSim) bestSim = sim;
      if (bestSim === 1) break; // Can't do better
    }
    totalSim += bestSim;
  }

  return totalSim / queryTokens.length;
}

/**
 * Token-level similarity between query and title (0-1 scale).
 * Matches individual words, so word order doesn't matter.
 */
export function tokenSimilarity(query: string, title: string): number {
  return tokenSimilarityNormalized(
    normalizeTitle(query),
    normalizeTitle(title),
  );
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
  SIMILARITY_BASE: 0.2, // 20% base weight for title similarity
  NEAR_EXACT_BONUS: 10, // Bonus for >0.9 similarity
  PREFIX_MATCH_BONUS: 20, // Bonus when query is prefix of title (franchise/sequels)
  YEAR_MATCH_BONUS: 10, // Bonus for matching requested year
  PHONETIC_BONUS: 8, // Bonus for phonetic match (full-string)
  TOKEN_SIMILARITY: 0.15, // 15% for token-level similarity (word transpositions)
  TOKEN_PHONETIC_BONUS: 6, // Max bonus for per-token phonetic matches
  RECENCY_BONUS: 5, // Max bonus for recent movies (decays over 20 years)
  POPULARITY_WEIGHT: 0.25, // 25% for popularity
  VOTE_COUNT_MAX: 52, // Max bonus for high vote counts (log-scaled)
};

const CURRENT_YEAR = new Date().getFullYear();
const RECENCY_DECAY_YEARS = 20; // Full bonus for current year, decays to 0 over 20 years

function isPrefixMatchNormalized(
  normQuery: string,
  normTitle: string,
): boolean {
  return normTitle.startsWith(normQuery) && normTitle.length > normQuery.length;
}

/**
 * Calculate recency bonus (0 to RECENCY_BONUS points)
 * Full bonus for current year, linear decay over RECENCY_DECAY_YEARS
 */
function getRecencyBonus(releaseDate: string | undefined): number {
  if (!releaseDate) return 0;

  const year = parseInt(releaseDate.split("-")[0], 10);
  if (isNaN(year)) return 0;

  const yearsAgo = CURRENT_YEAR - year;
  if (yearsAgo < 0) return WEIGHTS.RECENCY_BONUS; // Future releases get full bonus
  if (yearsAgo >= RECENCY_DECAY_YEARS) return 0;

  return WEIGHTS.RECENCY_BONUS * (1 - yearsAgo / RECENCY_DECAY_YEARS);
}

/** Precomputed query values to avoid redundant normalization per candidate */
type PrecomputedQuery = {
  normQuery: string;
  queryPhonetic: string;
  queryTokens: string[];
  queryTokenPhonetics: string[];
};

/**
 * Calculate ranking score for a single result
 */
function calculateScore(
  result: SearchResult,
  precomputed: PrecomputedQuery,
  queryYear: number | null,
  maxPopularity: number,
): number {
  let score = 0;

  const normTitle = normalizeTitle(result.title);

  // Title similarity (0-40 points base)
  const sim = similarityNormalized(precomputed.normQuery, normTitle);
  score += sim * 100 * WEIGHTS.SIMILARITY_BASE;

  // Near-exact match bonus
  if (sim > 0.9) {
    score += WEIGHTS.NEAR_EXACT_BONUS;
  }

  // Prefix match bonus (query "Dune" matches "Dune: Part Two")
  if (isPrefixMatchNormalized(precomputed.normQuery, normTitle)) {
    score += WEIGHTS.PREFIX_MATCH_BONUS;
  }

  // Phonetic match bonus (helps with typos — full-string)
  const titlePhonetic = phoneticKey(result.title);
  if (precomputed.queryPhonetic === titlePhonetic) {
    score += WEIGHTS.PHONETIC_BONUS;
  }

  // Token-level similarity (handles word transpositions and per-word matching)
  const tokenSim = tokenSimilarityNormalized(precomputed.normQuery, normTitle);
  score += tokenSim * 100 * WEIGHTS.TOKEN_SIMILARITY;

  // Token-level phonetic matching (per-word typo tolerance)
  if (precomputed.queryTokens.length > 0) {
    const titleTokens = tokenize(normTitle);
    const titleTokenPhonetics = titleTokens.map((t) => phoneticKey(t));

    let matched = 0;
    for (const qp of precomputed.queryTokenPhonetics) {
      if (titleTokenPhonetics.includes(qp)) matched++;
    }
    score +=
      (matched / precomputed.queryTokens.length) * WEIGHTS.TOKEN_PHONETIC_BONUS;
  }

  // Year match bonus (when user specifies a year)
  if (queryYear && result.release_date) {
    const resultYear = parseInt(result.release_date.split("-")[0], 10);
    if (resultYear === queryYear) {
      score += WEIGHTS.YEAR_MATCH_BONUS;
    }
  }

  // Recency bonus (0-20 points, favors recent movies)
  score += getRecencyBonus(result.release_date);

  // Popularity (0-20 points)
  const popularity = result.popularity ?? 0;
  const normalizedPopularity =
    maxPopularity > 0 ? popularity / maxPopularity : 0;
  score += normalizedPopularity * 100 * WEIGHTS.POPULARITY_WEIGHT;

  // Vote count (0-20 points, log-scaled for cultural significance)
  // log10(1000) ≈ 3, log10(10000) ≈ 4, log10(100000) ≈ 5
  // Scale so 10k+ votes gets near-max, 1k gets ~60%, 100 gets ~40%
  const voteCount = result.vote_count ?? 0;
  if (voteCount > 0) {
    const logVotes = Math.log10(voteCount);
    const normalizedVotes = Math.min(logVotes / 5, 1); // Cap at 100k votes (log10 = 5)
    score += normalizedVotes * WEIGHTS.VOTE_COUNT_MAX;
  }

  return score;
}

/**
 * Re-rank TMDB results based on similarity, year match, and popularity.
 * When limit is specified, uses a min-heap for O(n log k) top-K selection
 * instead of a full O(n log n) sort.
 */
export function rankResults(
  results: SearchResult[],
  queryTitle: string,
  queryYear: number | null,
  limit?: number,
): SearchResult[] {
  if (results.length === 0) return [];

  // Precompute query values once instead of per-candidate
  const normQuery = normalizeTitle(queryTitle);
  const queryTokens = tokenize(normQuery);
  const precomputed: PrecomputedQuery = {
    normQuery,
    queryPhonetic: phoneticKey(queryTitle),
    queryTokens,
    queryTokenPhonetics: queryTokens.map((t) => phoneticKey(t)),
  };

  // Find max popularity for normalization
  const maxPopularity = Math.max(...results.map((r) => r.popularity ?? 0), 1);

  const scored = results.map((result) => ({
    result,
    score: calculateScore(result, precomputed, queryYear, maxPopularity),
  }));

  // Use top-K selection when limit is set and smaller than the full array
  if (limit != null && limit < scored.length) {
    return topK(scored, limit).map((s) => s.result);
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.result);
}

/**
 * Min-heap based top-K selection — O(n log k) instead of O(n log n) full sort.
 * Returns the top k items sorted descending by score.
 */
function topK<T extends { score: number }>(items: T[], k: number): T[] {
  // Min-heap: root is the smallest score in the current top-k
  const heap: T[] = [];

  const swap = (i: number, j: number) => {
    const t = heap[i];
    heap[i] = heap[j];
    heap[j] = t;
  };

  const siftUp = (i: number) => {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].score <= heap[i].score) break;
      swap(parent, i);
      i = parent;
    }
  };

  const siftDown = (i: number) => {
    const n = heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && heap[left].score < heap[smallest].score) smallest = left;
      if (right < n && heap[right].score < heap[smallest].score)
        smallest = right;
      if (smallest === i) break;
      swap(i, smallest);
      i = smallest;
    }
  };

  for (const item of items) {
    if (heap.length < k) {
      heap.push(item);
      siftUp(heap.length - 1);
    } else if (item.score > heap[0].score) {
      heap[0] = item;
      siftDown(0);
    }
  }

  // Sort the k winners descending
  heap.sort((a, b) => b.score - a.score);
  return heap;
}

/**
 * Cardinal ↔ ordinal number swaps.
 * Handles "Eight Grade" → "Eighth Grade", "Third Man" → "Three Man", etc.
 */
const NUMBER_VARIANTS: ReadonlyMap<string, string> = new Map([
  ["one", "first"],
  ["first", "one"],
  ["two", "second"],
  ["second", "two"],
  ["three", "third"],
  ["third", "three"],
  ["four", "fourth"],
  ["fourth", "four"],
  ["five", "fifth"],
  ["fifth", "five"],
  ["six", "sixth"],
  ["sixth", "six"],
  ["seven", "seventh"],
  ["seventh", "seven"],
  ["eight", "eighth"],
  ["eighth", "eight"],
  ["nine", "ninth"],
  ["ninth", "nine"],
  ["ten", "tenth"],
  ["tenth", "ten"],
  ["eleven", "eleventh"],
  ["eleventh", "eleven"],
  ["twelve", "twelfth"],
  ["twelfth", "twelve"],
  ["thirteen", "thirteenth"],
  ["thirteenth", "thirteen"],
]);

/**
 * Generate query variants for fallback search when TMDB returns empty.
 * Handles common substitutions that TMDB may not fuzzy-match.
 */
export function generateVariants(query: string): string[] {
  const variants = new Set<string>();
  const trimmed = query.trim();

  // & ↔ and swaps
  if (trimmed.includes("&")) {
    variants.add(trimmed.replace(/\s*&\s*/g, " and "));
  }
  if (/\band\b/i.test(trimmed)) {
    variants.add(trimmed.replace(/\band\b/gi, "&"));
  }

  // Remove apostrophes
  if (trimmed.includes("'")) {
    variants.add(trimmed.replace(/'/g, ""));
  }

  // Remove hyphens (two variants: with space, without space)
  if (trimmed.includes("-")) {
    variants.add(trimmed.replace(/-/g, " "));
    variants.add(trimmed.replace(/-/g, ""));
  }

  // Cardinal ↔ ordinal number swaps (e.g., "Eight Grade" → "Eighth Grade")
  const words = trimmed.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const replacement = NUMBER_VARIANTS.get(words[i].toLowerCase());
    if (replacement) {
      const swapped = [...words];
      // Preserve original casing style (capitalized vs lowercase)
      swapped[i] =
        words[i][0] === words[i][0].toUpperCase()
          ? replacement[0].toUpperCase() + replacement.slice(1)
          : replacement;
      variants.add(swapped.join(" "));
    }
  }

  // Remove original query and empty strings
  variants.delete(trimmed);
  variants.delete("");

  return Array.from(variants);
}
