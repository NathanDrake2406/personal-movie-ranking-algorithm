// src/lib/parsers.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseLetterboxdHtml,
  parseImdbHtml,
  parseMetacriticHtml,
  parseDoubanSubjectSearchHtml,
  parseDoubanGlobalSearchHtml,
  parseGoogleDoubanSearchHtml,
  parseRTApiResponse,
  parseRTCriticsHtml,
  parseRTAudienceHtml,
  parseAllocineHtml,
  parseImdbThemes,
  parseImdbThemeSummaryResponse,
  parseRTConsensus,
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

  describe('parseAllocineHtml', () => {
    it('extracts both press and user ratings', () => {
      const html = `
        <div>Presse</div>
        <span class="stareval-note">3,8</span>
        <span class="stareval-note">4,2</span>
      `;
      const result = parseAllocineHtml(html);
      expect(result.press.value).toBe(3.8);
      expect(result.user.value).toBe(4.2);
    });

    it('extracts user rating only when no press section', () => {
      const html = `
        <span class="stareval-note">4,5</span>
      `;
      const result = parseAllocineHtml(html);
      expect(result.press.value).toBeNull();
      expect(result.user.value).toBe(4.5);
    });

    it('handles > Presse < with spaces', () => {
      const html = `
        <div>> Presse <</div>
        <span class="stareval-note">2,9</span>
        <span class="stareval-note">3,1</span>
      `;
      const result = parseAllocineHtml(html);
      expect(result.press.value).toBe(2.9);
      expect(result.user.value).toBe(3.1);
    });

    it('returns nulls for page without ratings', () => {
      const html = '<html>No ratings</html>';
      const result = parseAllocineHtml(html);
      expect(result.press.value).toBeNull();
      expect(result.user.value).toBeNull();
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

  describe('parseRTApiResponse', () => {
    it('extracts meterScore', () => {
      expect(parseRTApiResponse({ meterScore: 86 }).tomatometer).toBe(86);
    });

    it('returns null for missing meterScore', () => {
      expect(parseRTApiResponse({}).tomatometer).toBeNull();
    });
  });

  describe('parseRTCriticsHtml', () => {
    it('extracts all critic scores', () => {
      const html = '"criticsAll":{"score":"92","averageRating":"8.1","ratingCount":245},"criticsTop":{"averageRating":"7.9","ratingCount":52}';
      const result = parseRTCriticsHtml(html);
      expect(result.tomatometer).toBe(92);
      expect(result.criticsAvgAll).toBeCloseTo(81);
      expect(result.criticsAvgTop).toBeCloseTo(79);
      expect(result.allCriticsCount).toBe(245);
      expect(result.topCriticsCount).toBe(52);
    });

    it('handles missing top critics', () => {
      const html = '"criticsAll":{"score":"75","averageRating":"6.5","ratingCount":100}';
      const result = parseRTCriticsHtml(html);
      expect(result.tomatometer).toBe(75);
      expect(result.criticsAvgTop).toBeNull();
    });

    it('returns nulls for page without critic data', () => {
      const html = '<html>No critic data</html>';
      const result = parseRTCriticsHtml(html);
      expect(result.tomatometer).toBeNull();
      expect(result.criticsAvgAll).toBeNull();
    });
  });

  describe('parseRTAudienceHtml', () => {
    it('extracts verified audience score', () => {
      const html = '"audienceVerified":{"averageRating":"4.2","reviewCount":10000},"audienceAll":{"averageRating":"3.8"}';
      const result = parseRTAudienceHtml(html);
      expect(result.audienceAvg).toBe(4.2);
      expect(result.isVerifiedAudience).toBe(true);
      expect(result.audienceCount).toBe(10000);
    });

    it('falls back to audienceAll', () => {
      const html = '"audienceAll":{"averageRating":"3.5","reviewCount":5000}';
      const result = parseRTAudienceHtml(html);
      expect(result.audienceAvg).toBe(3.5);
      expect(result.isVerifiedAudience).toBe(false);
      expect(result.audienceCount).toBe(5000);
    });

    it('returns nulls for page without audience data', () => {
      const html = '<html>No audience data</html>';
      const result = parseRTAudienceHtml(html);
      expect(result.audienceAvg).toBeNull();
      expect(result.isVerifiedAudience).toBe(false);
    });
  });

  describe('parseImdbThemes', () => {
    it('extracts themes with positive sentiment', () => {
      const html = `
        <button aria-label="Authentic emotion positive sentiment">
          <span class="ipc-chip__text">Authentic emotion</span>
        </button>
        <button aria-label="Cinematography positive sentiment">
          <span class="ipc-chip__text">Cinematography</span>
        </button>
      `;
      const result = parseImdbThemes(html);
      expect(result).toEqual([
        { id: 'authentic-emotion', label: 'Authentic emotion', sentiment: 'positive' },
        { id: 'cinematography', label: 'Cinematography', sentiment: 'positive' },
      ]);
    });

    it('extracts themes with mixed sentiment', () => {
      const html = `
        <button aria-label="Performance positive sentiment"></button>
        <button aria-label="Pacing negative sentiment"></button>
      `;
      const result = parseImdbThemes(html);
      expect(result).toEqual([
        { id: 'performance', label: 'Performance', sentiment: 'positive' },
        { id: 'pacing', label: 'Pacing', sentiment: 'negative' },
      ]);
    });

    it('prefers __NEXT_DATA__ theme metadata when available', () => {
      const data = {
        props: {
          pageProps: {
            mainColumnData: {
              reviewSummary: {
                themes: [
                  { id: 'theme-123', label: 'Cinematography', sentiment: 'POSITIVE' },
                ],
              },
            },
          },
        },
      };
      const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
      const result = parseImdbThemes(html);
      expect(result).toEqual([{ id: 'theme-123', label: 'Cinematography', sentiment: 'positive' }]);
    });

    it('uses __NEXT_DATA__ theme id to enrich aria-label chips', () => {
      const data = {
        props: {
          pageProps: {
            mainColumnData: {
              reviewSummary: {
                themes: [
                  { themeId: 'theme-456', label: 'Cinematography' },
                ],
              },
            },
          },
        },
      };
      const html = `
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>
        <button aria-label="Cinematography positive sentiment"></button>
      `;
      const result = parseImdbThemes(html);
      expect(result).toEqual([{ id: 'theme-456', label: 'Cinematography', sentiment: 'positive' }]);
    });

    it('returns empty array when no themes found', () => {
      const html = '<html>No themes here</html>';
      const result = parseImdbThemes(html);
      expect(result).toEqual([]);
    });
  });

  describe('parseImdbThemeSummaryResponse', () => {
    it('extracts summary tied to theme id', () => {
      const data = {
        data: {
          themeSummary: {
            id: 'theme-123',
            plaidHtml: 'Reviewers say the cinematography dazzles. AI-generated from user reviews',
          },
        },
      };
      const result = parseImdbThemeSummaryResponse(data, 'theme-123');
      expect(result).toBe('The cinematography dazzles.');
    });

    it('extracts summary from nested value object', () => {
      const data = {
        data: {
          title: {
            reviewSummary: {
              themes: [
                {
                  themeId: 'musical-score',
                  summary: {
                    value: {
                      plaidHtml: 'Reviewers say the score is exceptional.',
                    },
                  },
                },
              ],
            },
          },
        },
      };
      const result = parseImdbThemeSummaryResponse(data, 'musical-score');
      expect(result).toBe('The score is exceptional.');
    });
  });

  describe('parseRTConsensus', () => {
    it('extracts both critics and audience consensus', () => {
      const html = `
        <div id="critics-consensus" class="consensus">
          <rt-text>Critics Consensus</rt-text>
          <p>A thrilling masterpiece that redefines the genre.</p>
        </div>
        <div id="audience-consensus" class="consensus">
          <rt-text>Audience Says</rt-text>
          <p>Fans loved the epic scope and emotional depth.</p>
        </div>
      `;
      const result = parseRTConsensus(html);
      expect(result).toEqual({
        critics: 'A thrilling masterpiece that redefines the genre.',
        audience: 'Fans loved the epic scope and emotional depth.',
      });
    });

    it('extracts critics only when no audience consensus', () => {
      const html = `
        <div id="critics-consensus" class="consensus">
          <p>Smart, innovative, and thrilling.</p>
        </div>
      `;
      const result = parseRTConsensus(html);
      expect(result).toEqual({
        critics: 'Smart, innovative, and thrilling.',
        audience: undefined,
      });
    });

    it('handles HTML entities and em tags', () => {
      const html = `
        <div id="critics-consensus" class="consensus">
          <p>A film that&#39;s both <em>beautiful</em> and bold.</p>
        </div>
      `;
      const result = parseRTConsensus(html);
      expect(result.critics).toBe("A film that's both beautiful and bold.");
    });

    it('returns empty object when no consensus found', () => {
      const html = '<html>No consensus</html>';
      const result = parseRTConsensus(html);
      expect(result).toEqual({});
    });
  });
});
