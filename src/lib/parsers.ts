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
