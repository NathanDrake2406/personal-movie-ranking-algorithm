// src/lib/parsers.ts

import type { ImdbTheme } from './types';

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
  const noteMatches = [...html.matchAll(/class="stareval-note"[^>]*>([^<]+)</g)];

  // Check if "Presse" section exists (indicates first rating is press)
  const hasPress = html.includes('> Presse <') || html.includes('>Presse<');

  const parseNote = (text?: string): number | null => {
    if (!text) return null;
    const num = parseFloat(text.replace(',', '.').trim());
    return Number.isFinite(num) ? num : null;
  };

  if (hasPress && noteMatches.length >= 2) {
    return {
      press: { value: parseNote(noteMatches[0]?.[1]), count: null },
      user: { value: parseNote(noteMatches[1]?.[1]), count: null },
    };
  }

  // No press section - first rating is user only
  return {
    press: { value: null, count: null },
    user: { value: parseNote(noteMatches[0]?.[1]), count: null },
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

export function parseMetacriticHtml(html: string): ParsedRating {
  // Try new HTML format first
  const valueMatch = html.match(/title="Metascore (\d+) out of 100"/);
  const countMatch = html.match(/Based on (\d+) Critic/);

  // Fallback to legacy JSON-LD format
  const legacyValueMatch = html.match(/"ratingValue"\s*:\s*(\d+)/);
  const legacyCountMatch = html.match(/"reviewCount"\s*:\s*(\d+)/);

  const value = valueMatch?.[1]
    ? Number(valueMatch[1])
    : (legacyValueMatch?.[1] ? Number(legacyValueMatch[1]) : null);

  const count = countMatch?.[1]
    ? parseInt(countMatch[1], 10)
    : (legacyCountMatch?.[1] ? parseInt(legacyCountMatch[1], 10) : null);

  return { value: Number.isFinite(value) ? value : null, count };
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
export function parseRTApiResponse(json: { meterScore?: number }): { tomatometer: number | null } {
  return { tomatometer: json.meterScore ?? null };
}

// RT Critics HTML parser
export type ParsedRTCritics = {
  tomatometer: number | null;
  criticsAvgAll: number | null;
  criticsAvgTop: number | null;
  allCriticsCount: number | null;
  topCriticsCount: number | null;
};

export function parseRTCriticsHtml(html: string): ParsedRTCritics {
  const matchScore = html.match(/"criticsAll"[^}]*"score"\s*:\s*"(\d+)"/);
  const matchAll = html.match(/"criticsAll"[^}]*"averageRating"\s*:\s*"([\d.]+)"/);
  const matchTop = html.match(/"criticsTop"[^}]*"averageRating"\s*:\s*"([\d.]+)"/);
  const matchAllCount = html.match(/"criticsAll"[^}]*"ratingCount"\s*:\s*(\d+)/);
  const matchTopCount = html.match(/"criticsTop"[^}]*"ratingCount"\s*:\s*(\d+)/);

  return {
    tomatometer: matchScore?.[1] ? Number(matchScore[1]) : null,
    criticsAvgAll: matchAll?.[1] ? Number(matchAll[1]) * 10 : null,
    criticsAvgTop: matchTop?.[1] ? Number(matchTop[1]) * 10 : null,
    allCriticsCount: matchAllCount?.[1] ? parseInt(matchAllCount[1], 10) : null,
    topCriticsCount: matchTopCount?.[1] ? parseInt(matchTopCount[1], 10) : null,
  };
}

// RT Audience HTML parser
export type ParsedRTAudience = {
  audienceAvg: number | null;
  isVerifiedAudience: boolean;
  audienceCount: number | null;
};

export function parseRTAudienceHtml(html: string): ParsedRTAudience {
  const matchVerified = html.match(/"audienceVerified"[^}]*"averageRating"\s*:\s*"([\d.]+)"/);
  const matchAll = html.match(/"audienceAll"[^}]*"averageRating"\s*:\s*"([\d.]+)"/);
  const matchVerifiedCount = html.match(/"audienceVerified"[^}]*"reviewCount"\s*:\s*(\d+)/);
  const matchAllCount = html.match(/"audienceAll"[^}]*"reviewCount"\s*:\s*(\d+)/);

  const isVerifiedAudience = matchVerified?.[1] != null;
  const audienceAvg = matchVerified?.[1]
    ? Number(matchVerified[1])
    : (matchAll?.[1] ? Number(matchAll[1]) : null);
  const audienceCount = isVerifiedAudience
    ? (matchVerifiedCount?.[1] ? parseInt(matchVerifiedCount[1], 10) : null)
    : (matchAllCount?.[1] ? parseInt(matchAllCount[1], 10) : null);

  return { audienceAvg, isVerifiedAudience, audienceCount };
}

export function parseImdbThemes(html: string): ImdbTheme[] {
  const matches = html.matchAll(/aria-label="([^"]+) (positive|negative) sentiment"/g);
  const themes: ImdbTheme[] = [];

  for (const match of matches) {
    themes.push({
      label: match[1],
      sentiment: match[2] as 'positive' | 'negative',
    });
  }

  return themes;
}
