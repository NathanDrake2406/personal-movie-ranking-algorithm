// src/lib/parsers.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseLetterboxdHtml,
  parseMubiHtml,
  parseImdbHtml,
  parseMetacriticHtml,
  parseDoubanSubjectSearchHtml,
  parseDoubanGlobalSearchHtml,
  parseGoogleDoubanSearchHtml,
} from './parsers';

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

  describe('parseMetacriticHtml', () => {
    it('extracts score from new HTML format', () => {
      const html = 'title="Metascore 85 out of 100"  Based on 42 Critic';
      const result = parseMetacriticHtml(html);
      expect(result.value).toBe(85);
      expect(result.count).toBe(42);
    });

    it('falls back to JSON-LD format', () => {
      const html = '"ratingValue": 73,"reviewCount": 35';
      const result = parseMetacriticHtml(html);
      expect(result.value).toBe(73);
      expect(result.count).toBe(35);
    });

    it('prefers new format over legacy', () => {
      const html = 'title="Metascore 90 out of 100" "ratingValue": 85 Based on 50 Critic "reviewCount": 40';
      const result = parseMetacriticHtml(html);
      expect(result.value).toBe(90);
      expect(result.count).toBe(50);
    });
  });

  describe('Douban ID extractors', () => {
    describe('parseDoubanSubjectSearchHtml', () => {
      it('extracts subject ID', () => {
        const html = '<a href="/subject/1291546/">Movie</a>';
        expect(parseDoubanSubjectSearchHtml(html)).toBe('1291546');
      });

      it('returns null when no subject found', () => {
        expect(parseDoubanSubjectSearchHtml('<html>No results</html>')).toBeNull();
      });
    });

    describe('parseDoubanGlobalSearchHtml', () => {
      it('extracts ID from URL-encoded onclick', () => {
        const html = 'subject%2F26636712';
        expect(parseDoubanGlobalSearchHtml(html)).toBe('26636712');
      });

      it('extracts ID from direct movie URL', () => {
        const html = 'movie.douban.com/subject/1292052/';
        expect(parseDoubanGlobalSearchHtml(html)).toBe('1292052');
      });
    });

    describe('parseGoogleDoubanSearchHtml', () => {
      it('extracts Douban ID from Google results', () => {
        const html = 'href="https://movie.douban.com/subject/1292720/"';
        expect(parseGoogleDoubanSearchHtml(html)).toBe('1292720');
      });

      it('returns null when no Douban link found', () => {
        expect(parseGoogleDoubanSearchHtml('<html>No results</html>')).toBeNull();
      });
    });
  });
});
