// src/lib/parsers.ts

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

export function parseMubiHtml(html: string): ParsedRating {
  const ratingMatch = html.match(/Average rating:\s*([\d.]+)\/10/);
  const countMatch = html.match(/out of\s+([\d,]+)\s*ratings/i);

  const value = ratingMatch?.[1] ? parseFloat(ratingMatch[1]) : null;
  const count = countMatch?.[1] ? parseInt(countMatch[1].replace(/,/g, ''), 10) : null;

  return { value: Number.isFinite(value) ? value : null, count };
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

  return { value, count };
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
