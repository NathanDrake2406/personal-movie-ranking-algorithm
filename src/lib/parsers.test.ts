// src/lib/parsers.test.ts
import { describe, it, expect } from 'vitest';
import { parseLetterboxdHtml, parseMubiHtml, parseImdbHtml } from './parsers';

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

  describe('parseMubiHtml', () => {
    it('extracts rating from meta description', () => {
      const html = 'Average rating: 8.5/10 out of 12,345 ratings';
      const result = parseMubiHtml(html);
      expect(result.value).toBe(8.5);
      expect(result.count).toBe(12345);
    });

    it('handles ratings without count', () => {
      const html = 'Average rating: 7.2/10';
      const result = parseMubiHtml(html);
      expect(result.value).toBe(7.2);
      expect(result.count).toBeNull();
    });

    it('returns null for page without rating', () => {
      const html = '<html>No ratings</html>';
      const result = parseMubiHtml(html);
      expect(result.value).toBeNull();
    });
  });

  describe('parseImdbHtml', () => {
    it('extracts rating from aggregateRating JSON-LD', () => {
      const html = '"aggregateRating":{"ratingValue":8.6,"ratingCount":1234567}';
      const result = parseImdbHtml(html);
      expect(result.value).toBe(8.6);
      expect(result.count).toBe(1234567);
    });

    it('handles fields in different order', () => {
      const html = '"aggregateRating":{"ratingCount":500000,"ratingValue":7.5}';
      const result = parseImdbHtml(html);
      expect(result.value).toBe(7.5);
      expect(result.count).toBe(500000);
    });

    it('returns null when aggregateRating missing', () => {
      const html = '<html>No rating</html>';
      const result = parseImdbHtml(html);
      expect(result.value).toBeNull();
    });
  });
});
