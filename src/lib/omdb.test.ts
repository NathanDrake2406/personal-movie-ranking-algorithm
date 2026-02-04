import { parseOmdbRatings } from './omdb';

describe('parseOmdbRatings', () => {
  describe('handles N/A values gracefully', () => {
    it('returns null for Metascore when OMDB returns "N/A"', () => {
      const movie = {
        Title: 'Test Movie',
        imdbID: 'tt1234567',
        Metascore: 'N/A',
        imdbRating: '7.5',
      };

      const result = parseOmdbRatings(movie);

      expect(result.metacritic).toBeNull();
    });

    it('returns null for imdbRating when OMDB returns "N/A"', () => {
      const movie = {
        Title: 'Test Movie',
        imdbID: 'tt1234567',
        imdbRating: 'N/A',
        Metascore: '75',
      };

      const result = parseOmdbRatings(movie);

      expect(result.imdb).toBeNull();
    });

    it('returns null for imdbVotes when OMDB returns "N/A"', () => {
      const movie = {
        Title: 'Test Movie',
        imdbID: 'tt1234567',
        imdbRating: '7.5',
        imdbVotes: 'N/A',
      };

      const result = parseOmdbRatings(movie);

      expect(result.imdbVotes).toBeNull();
    });
  });

  describe('parses valid values correctly', () => {
    it('parses numeric Metascore', () => {
      const movie = {
        Title: 'Test Movie',
        imdbID: 'tt1234567',
        Metascore: '85',
      };

      const result = parseOmdbRatings(movie);

      expect(result.metacritic).toBe(85);
    });

    it('parses numeric imdbRating', () => {
      const movie = {
        Title: 'Test Movie',
        imdbID: 'tt1234567',
        imdbRating: '8.2',
      };

      const result = parseOmdbRatings(movie);

      expect(result.imdb).toBe(8.2);
    });

    it('parses comma-formatted imdbVotes', () => {
      const movie = {
        Title: 'Test Movie',
        imdbID: 'tt1234567',
        imdbVotes: '1,234,567',
      };

      const result = parseOmdbRatings(movie);

      expect(result.imdbVotes).toBe(1234567);
    });

    it('parses Rotten Tomatoes percentage from Ratings array', () => {
      const movie = {
        Title: 'Test Movie',
        imdbID: 'tt1234567',
        Ratings: [
          { Source: 'Internet Movie Database', Value: '8.2/10' },
          { Source: 'Rotten Tomatoes', Value: '92%' },
        ],
      };

      const result = parseOmdbRatings(movie);

      expect(result.rottenTomatoes).toBe(92);
    });
  });

  describe('handles missing fields', () => {
    it('returns nulls for missing optional fields', () => {
      const movie = {
        Title: 'Test Movie',
        imdbID: 'tt1234567',
      };

      const result = parseOmdbRatings(movie);

      expect(result.imdb).toBeNull();
      expect(result.imdbVotes).toBeNull();
      expect(result.metacritic).toBeNull();
      expect(result.rottenTomatoes).toBeNull();
    });
  });
});
