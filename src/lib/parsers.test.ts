// src/lib/parsers.test.ts
import { describe, it, expect } from 'vitest';
import { parseLetterboxdHtml } from './parsers';

describe('parsers', () => {
  describe('parseLetterboxdHtml', () => {
    it('extracts rating and count from JSON-LD', () => {
      const html = '"ratingValue":4.1,"ratingCount":50000';
      const result = parseLetterboxdHtml(html);
      expect(result.value).toBe(4.1);
      expect(result.count).toBe(50000);
    });

    it('returns null for missing rating', () => {
      const html = '<html>No rating</html>';
      const result = parseLetterboxdHtml(html);
      expect(result.value).toBeNull();
    });
  });
});
