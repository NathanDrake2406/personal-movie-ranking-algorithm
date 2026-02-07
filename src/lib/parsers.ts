// src/lib/parsers.ts

import type { ImdbTheme, RTConsensus } from "./types";

/** Parsed rating values before normalization */
export type ParsedRating = {
  value: number | null;
  count: number | null;
};

export function parseLetterboxdHtml(html: string): ParsedRating {
  const valueMatch = html.match(/"ratingValue"\s*:\s*([\d.]+)/);
  const countMatch = html.match(/"ratingCount"\s*:\s*(\d+)/);

  const value = valueMatch?.[1] ? Number(valueMatch[1]) : null;
  const count = countMatch?.[1] ? parseInt(countMatch[1], 10) : null;

  return { value: Number.isFinite(value) ? value : null, count };
}

// AlloCiné HTML parser
export type ParsedAllocineRatings = {
  press: ParsedRating;
  user: ParsedRating;
};

export function parseAllocineHtml(html: string): ParsedAllocineRatings {
  // Find all .stareval-note values
  const noteMatches = [
    ...html.matchAll(/class="stareval-note"[^>]*>([^<]+)</g),
  ];

  // Find all .stareval-review texts (contain review/rating counts)
  const reviewMatches = [
    ...html.matchAll(/class="stareval-review[^"]*">([^<]+)/g),
  ];

  // Check if "Presse" section exists (indicates first rating is press)
  const hasPress = html.includes("> Presse <") || html.includes(">Presse<");

  const parseNote = (text?: string): number | null => {
    if (!text) return null;
    const num = parseFloat(text.replace(",", ".").trim());
    return Number.isFinite(num) ? num : null;
  };

  const parseCount = (
    text: string | undefined,
    type: "press" | "user",
  ): number | null => {
    if (!text) return null;
    const trimmed = text.trim();
    if (type === "press") {
      // Press: "15 critiques" → 15
      const match = trimmed.match(/(\d+)\s*critiques?/);
      return match?.[1] ? parseInt(match[1], 10) : null;
    }
    // User: "117136 notes, 7299 critiques" → 117136 (star ratings count)
    const match = trimmed.match(/(\d+)\s*notes?/);
    return match?.[1] ? parseInt(match[1], 10) : null;
  };

  if (hasPress && noteMatches.length >= 2) {
    return {
      press: {
        value: parseNote(noteMatches[0]?.[1]),
        count: parseCount(reviewMatches[0]?.[1], "press"),
      },
      user: {
        value: parseNote(noteMatches[1]?.[1]),
        count: parseCount(reviewMatches[1]?.[1], "user"),
      },
    };
  }

  // No press section - first rating is user only
  return {
    press: { value: null, count: null },
    user: {
      value: parseNote(noteMatches[0]?.[1]),
      count: parseCount(reviewMatches[0]?.[1], "user"),
    },
  };
}

export function parseImdbHtml(html: string): ParsedRating {
  const ratingBlock = html.match(/"aggregateRating":\{[^}]+\}/);
  if (!ratingBlock) {
    return { value: null, count: null };
  }

  const valueMatch = ratingBlock[0].match(/"ratingValue":([\d.]+)/);
  const countMatch = ratingBlock[0].match(/"ratingCount":(\d+)/);

  const value = valueMatch ? parseFloat(valueMatch[1]) : null;
  const count = countMatch ? parseInt(countMatch[1], 10) : null;

  return { value: Number.isFinite(value) ? value : null, count };
}

export function parseMetacriticBadge(html: string): string | null {
  // Metacritic "Must-See" badge appears in badge/label elements
  if (/>\s*Must[- ]?See\s*</i.test(html)) return "must_see";
  return null;
}

export function parseMetacriticHtml(html: string): ParsedRating {
  // Find the main score element by anchoring to the product score info container.
  // Metacritic pages include carousel cards with title="Metascore N out of 100"
  // for OTHER movies — an unanchored regex would match those instead of the
  // actual (possibly TBD) score.  Two-step: find the first title="Metascore ..."
  // after the anchor, then check if it contains a numeric score.
  let value: number | null = null;
  const anchorIdx = html.indexOf("c-productScoreInfo_scoreNumber");
  if (anchorIdx !== -1) {
    const firstTitle = html
      .slice(anchorIdx)
      .match(/title="Metascore ([^"]+)"/);
    const scoreMatch = firstTitle?.[1]?.match(/^(\d+) out of 100$/);
    if (scoreMatch) {
      value = Number(scoreMatch[1]);
    }
  }

  const countMatch = html.match(/Based on (\d+) Critic/);

  // Fallback to legacy JSON-LD format (older Metacritic pages)
  if (value == null) {
    const legacyValueMatch = html.match(/"ratingValue"\s*:\s*(\d+)/);
    if (legacyValueMatch?.[1]) {
      value = Number(legacyValueMatch[1]);
    }
  }

  const legacyCountMatch = html.match(/"reviewCount"\s*:\s*(\d+)/);

  const count = countMatch?.[1]
    ? parseInt(countMatch[1], 10)
    : legacyCountMatch?.[1]
      ? parseInt(legacyCountMatch[1], 10)
      : null;

  return { value: Number.isFinite(value) ? value : null, count };
}

/** Parse IMDb's /title/{id}/criticreviews page for embedded Metacritic data */
export function parseImdbCriticReviewsHtml(html: string): {
  value: number | null;
  count: number | null;
  metacriticUrl: string | null;
} {
  let value: number | null = null;
  let count: number | null = null;

  // Strategy 1: Extract from embedded JSON blob
  // IMDb embeds Next.js page data containing: "metacritic":{"metascore":{"reviewCount":22,"score":82,...}}
  const jsonMatch = html.match(
    /"metascore"\s*:\s*\{\s*"reviewCount"\s*:\s*(\d+)\s*,\s*"score"\s*:\s*(\d+)/,
  );
  if (jsonMatch) {
    count = parseInt(jsonMatch[1], 10);
    value = parseInt(jsonMatch[2], 10);
  }

  // Strategy 2: Fallback to HTML elements
  // <div data-testid="critic-reviews-title" ...><div ...>82</div>...22 reviews...
  if (value == null) {
    const htmlMatch = html.match(
      /data-testid="critic-reviews-title"[^>]*>[\s\S]*?<div[^>]*>(\d{1,3})<\/div>/,
    );
    if (htmlMatch?.[1]) {
      value = parseInt(htmlMatch[1], 10);
    }
  }
  if (count == null) {
    const countMatch = html.match(/(\d+)\s+reviews?\s*·\s*Provided by/);
    if (countMatch?.[1]) {
      count = parseInt(countMatch[1], 10);
    }
  }

  // Extract Metacritic URL from any href on the page
  const urlMatch = html.match(
    /href="(https?:\/\/www\.metacritic\.com\/movie\/[^"?]+)/,
  );
  const metacriticUrl = urlMatch?.[1] ?? null;

  return {
    value:
      Number.isFinite(value) && value! >= 0 && value! <= 100 ? value : null,
    count: Number.isFinite(count) ? count : null,
    metacriticUrl,
  };
}

export function parseDoubanSubjectSearchHtml(html: string): string | null {
  const match = html.match(/subject\/(\d+)/);
  return match?.[1] ?? null;
}

export function parseDoubanGlobalSearchHtml(html: string): string | null {
  // URL-encoded format first (from onclick handlers)
  const encodedMatch = html.match(/subject%2F(\d+)/);
  if (encodedMatch?.[1]) return encodedMatch[1];

  // Direct URL format fallback
  const directMatch = html.match(/movie\.douban\.com\/subject\/(\d+)/);
  return directMatch?.[1] ?? null;
}

export function parseGoogleDoubanSearchHtml(html: string): string | null {
  const match = html.match(/movie\.douban\.com\/subject\/(\d+)/);
  return match?.[1] ?? null;
}

// RT API response parser
export function parseRTApiResponse(json: { meterScore?: number }): {
  tomatometer: number | null;
} {
  return { tomatometer: json.meterScore ?? null };
}

// RT Critics HTML parser
export type ParsedRTCritics = {
  tomatometer: number | null;
  criticsAvgAll: number | null;
  criticsAvgTop: number | null;
  allCriticsCount: number | null;
  topCriticsCount: number | null;
  badge: "certified_fresh" | "fresh" | "rotten" | null;
};

export function parseRTCriticsHtml(html: string): ParsedRTCritics {
  const matchScore = html.match(/"criticsAll"[^}]*"score"\s*:\s*"(\d+)"/);
  const matchAll = html.match(
    /"criticsAll"[^}]*"averageRating"\s*:\s*"([\d.]+)"/,
  );
  const matchTop = html.match(
    /"criticsTop"[^}]*"averageRating"\s*:\s*"([\d.]+)"/,
  );
  const matchAllCount = html.match(
    /"criticsAll"[^}]*"ratingCount"\s*:\s*(\d+)/,
  );
  const matchTopCount = html.match(
    /"criticsTop"[^}]*"ratingCount"\s*:\s*(\d+)/,
  );

  // Extract badge from criticsScore section of embedded JSON
  const certifiedMatch = html.match(
    /"criticsScore"\s*:\s*\{[^}]*"certified"\s*:\s*(true|false)/,
  );
  const sentimentMatch = html.match(
    /"criticsScore"\s*:\s*\{[^}]*"sentiment"\s*:\s*"([^"]+)"/,
  );
  const certified = certifiedMatch?.[1] === "true";
  const sentiment = sentimentMatch?.[1]?.toUpperCase();

  let badge: ParsedRTCritics["badge"] = null;
  if (sentiment === "POSITIVE") {
    badge = certified ? "certified_fresh" : "fresh";
  } else if (sentiment === "NEGATIVE") {
    badge = "rotten";
  }

  const criticsAvgAll = matchAll?.[1] ? Number(matchAll[1]) * 10 : null;
  let criticsAvgTop = matchTop?.[1] ? Number(matchTop[1]) * 10 : null;

  // RT sometimes returns bogus averageRating for top critics (e.g., "10.00" for
  // films with universally negative top-critic reviews). Cross-validate against
  // the all-critics average: a >35-point gap is implausible and means the value
  // is a placeholder or calculation error on RT's side.
  if (
    criticsAvgTop != null &&
    criticsAvgAll != null &&
    criticsAvgTop - criticsAvgAll > 35
  ) {
    criticsAvgTop = null;
  }

  return {
    tomatometer: matchScore?.[1] ? Number(matchScore[1]) : null,
    criticsAvgAll,
    criticsAvgTop,
    allCriticsCount: matchAllCount?.[1] ? parseInt(matchAllCount[1], 10) : null,
    topCriticsCount: matchTopCount?.[1] ? parseInt(matchTopCount[1], 10) : null,
    badge,
  };
}

// RT Audience HTML parser
export type ParsedRTAudience = {
  audienceAvg: number | null;
  isVerifiedAudience: boolean;
  audienceCount: number | null;
};

export function parseRTAudienceHtml(html: string): ParsedRTAudience {
  const matchVerified = html.match(
    /"audienceVerified"[^}]*"averageRating"\s*:\s*"([\d.]+)"/,
  );
  const matchAll = html.match(
    /"audienceAll"[^}]*"averageRating"\s*:\s*"([\d.]+)"/,
  );
  const matchVerifiedCount = html.match(
    /"audienceVerified"[^}]*"reviewCount"\s*:\s*(\d+)/,
  );
  const matchAllCount = html.match(
    /"audienceAll"[^}]*"reviewCount"\s*:\s*(\d+)/,
  );

  const isVerifiedAudience = matchVerified?.[1] != null;
  const audienceAvg = matchVerified?.[1]
    ? Number(matchVerified[1])
    : matchAll?.[1]
      ? Number(matchAll[1])
      : null;
  const audienceCount = isVerifiedAudience
    ? matchVerifiedCount?.[1]
      ? parseInt(matchVerifiedCount[1], 10)
      : null
    : matchAllCount?.[1]
      ? parseInt(matchAllCount[1], 10)
      : null;

  return { audienceAvg, isVerifiedAudience, audienceCount };
}

const THEME_LABEL_KEYS = ["label", "name", "displayText", "text", "title"];
const THEME_ID_KEYS = ["id", "themeId", "topicId", "key", "slug", "value"];

function slugifyThemeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function normalizeThemeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function extractNextData(html: string): unknown | null {
  const match = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function buildThemeIdMap(data: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!data || typeof data !== "object") return map;

  const queue: unknown[] = [data];
  let head = 0;
  let inspected = 0;

  while (head < queue.length && inspected < 5000) {
    const current = queue[head++];
    inspected += 1;
    if (!current || typeof current !== "object") continue;

    const obj = current as Record<string, unknown>;
    const label = pickStringField(obj, THEME_LABEL_KEYS);
    const rawId = pickStringField(obj, THEME_ID_KEYS);
    if (label && rawId) {
      map.set(normalizeThemeLabel(label), rawId);
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return map;
}

function pickStringField(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0)
      return value.trim();
  }
  return null;
}

function normalizeSentiment(
  value: unknown,
): "positive" | "negative" | "neutral" | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("positive")) return "positive";
  if (normalized.includes("negative")) return "negative";
  if (normalized.includes("neutral")) return "neutral";
  return null;
}

function parseImdbThemesFromNextData(data: unknown): ImdbTheme[] {
  if (!data || typeof data !== "object") return [];

  const results: ImdbTheme[] = [];
  const seen = new Set<string>();
  const queue: unknown[] = [data];
  let head = 0;
  let inspected = 0;

  while (head < queue.length && inspected < 5000) {
    const current = queue[head++];
    inspected += 1;
    if (!current || typeof current !== "object") continue;

    const obj = current as Record<string, unknown>;
    const sentiment = normalizeSentiment(
      obj.sentiment ?? obj.tone ?? obj.polarity,
    );
    const label = pickStringField(obj, THEME_LABEL_KEYS);
    if (sentiment && label) {
      const rawId = pickStringField(obj, THEME_ID_KEYS);
      const id = rawId && rawId.length > 0 ? rawId : slugifyThemeLabel(label);
      if (!seen.has(id)) {
        results.push({ id, label, sentiment });
        seen.add(id);
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return results;
}

export function parseImdbThemes(html: string): ImdbTheme[] {
  const nextData = extractNextData(html);
  const themeIdMap = buildThemeIdMap(nextData);

  const matches = html.matchAll(
    /aria-label="([^"]+) (positive|negative|neutral) sentiment"/g,
  );
  const themes: ImdbTheme[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const label = match[1];
    const sentiment = match[2] as "positive" | "negative" | "neutral";
    const id =
      themeIdMap.get(normalizeThemeLabel(label)) || slugifyThemeLabel(label);
    if (seen.has(id)) continue;
    themes.push({ id, label, sentiment });
    seen.add(id);
  }

  if (themes.length > 0) return themes;

  const fromNextData = parseImdbThemesFromNextData(nextData);
  return fromNextData;
}

export function parseImdbSummary(html: string): string | null {
  // Extract __NEXT_DATA__ JSON from the page
  const nextDataMatch = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/,
  );
  if (!nextDataMatch?.[1]) return null;

  try {
    const data = JSON.parse(nextDataMatch[1]);
    const plaidHtml =
      data?.props?.pageProps?.mainColumnData?.reviewSummary?.overall?.medium
        ?.value?.plaidHtml;
    if (!plaidHtml) return null;

    // Decode HTML entities and clean up
    const cleaned = plaidHtml
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/^Reviewers say\s*/i, "")
      .trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  } catch {
    return null;
  }
}

export function parseImdbThemeSummaryResponse(
  data: unknown,
  themeId: string,
): string | null {
  if (!data || typeof data !== "object") return null;

  const cleanSummary = (raw: string): string => {
    const cleaned = decodeHtmlEntities(stripTags(raw))
      .replace(/\s*AI-generated from (?:the text of )?user reviews.*$/i, "")
      .replace(/^Reviewers say\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  };

  const summaryFromNode = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const obj = node as Record<string, unknown>;
    const candidate =
      obj.plaidHtml ??
      obj.plainText ??
      obj.text ??
      obj.value ??
      obj.summary ??
      obj.description ??
      null;
    if (typeof candidate === "string") return cleanSummary(candidate);
    if (candidate && typeof candidate === "object") {
      const inner = candidate as Record<string, unknown>;
      const innerCandidate =
        inner.plaidHtml ?? inner.plainText ?? inner.text ?? inner.value ?? null;
      if (typeof innerCandidate === "string")
        return cleanSummary(innerCandidate);
      if (innerCandidate && typeof innerCandidate === "object") {
        const deeper = innerCandidate as Record<string, unknown>;
        const deepCandidate =
          deeper.plaidHtml ?? deeper.plainText ?? deeper.text ?? null;
        if (typeof deepCandidate === "string")
          return cleanSummary(deepCandidate);
      }
    }
    return null;
  };

  const matchesThemeId = (node: Record<string, unknown>): boolean => {
    const candidates = [
      node.id,
      node.themeId,
      node.topicId,
      node.key,
      node.slug,
      node.value,
    ];
    return candidates.some((value) => {
      if (typeof value === "string") return value === themeId;
      if (typeof value === "number") return String(value) === themeId;
      return false;
    });
  };

  const queue: unknown[] = [data];
  let head = 0;
  let inspected = 0;
  while (head < queue.length && inspected < 5000) {
    const current = queue[head++];
    inspected += 1;
    if (!current || typeof current !== "object") continue;
    const obj = current as Record<string, unknown>;

    if (matchesThemeId(obj)) {
      const direct = summaryFromNode(obj);
      if (direct) return direct;

      for (const value of Object.values(obj)) {
        const nested = summaryFromNode(value);
        if (nested) return nested;
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  // Fallback: look for any "Reviewers say" string in response
  const responseText = JSON.stringify(data);
  const reviewersMatch = responseText.match(/Reviewers say[^"]{20,600}/i);
  if (reviewersMatch?.[0]) return cleanSummary(reviewersMatch[0]);

  return null;
}

export function parseRTConsensus(html: string): RTConsensus {
  const result: RTConsensus = {};

  // Extract critics consensus
  const criticsMatch = html.match(
    /<div[^>]*id="critics-consensus"[^>]*>[\s\S]*?<p>([^<]*(?:<em>[^<]*<\/em>[^<]*)*)<\/p>/,
  );
  if (criticsMatch?.[1]) {
    result.critics = decodeHtmlEntities(stripTags(criticsMatch[1]));
  }

  // Extract audience consensus
  const audienceMatch = html.match(
    /<div[^>]*id="audience-consensus"[^>]*>[\s\S]*?<p>([^<]*(?:<em>[^<]*<\/em>[^<]*)*)<\/p>/,
  );
  if (audienceMatch?.[1]) {
    result.audience = decodeHtmlEntities(stripTags(audienceMatch[1]));
  }

  return result;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
