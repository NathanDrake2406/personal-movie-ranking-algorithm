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
