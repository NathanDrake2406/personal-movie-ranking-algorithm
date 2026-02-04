import { describe, it, expect } from 'vitest';
import {
  parseQuery,
  normalizeTitle,
  phoneticKey,
  similarity,
  phoneticMatch,
  rankResults,
  type SearchResult,
} from './search-utils';

describe('parseQuery', () => {
  it('extracts year from "Title 2021" format', () => {
    expect(parseQuery('Dune 2021')).toEqual({ title: 'Dune', year: 2021 });
  });

  it('extracts year from "Title (2021)" format', () => {
    expect(parseQuery('Dune (2021)')).toEqual({ title: 'Dune', year: 2021 });
  });

  it('extracts year from "Title (2021" format (missing paren)', () => {
    expect(parseQuery('Dune (2021')).toEqual({ title: 'Dune', year: 2021 });
  });

  it('does NOT extract year from "2001: A Space Odyssey"', () => {
    // Year-like number at start of title should be kept as title
    expect(parseQuery('2001: A Space Odyssey')).toEqual({
      title: '2001: A Space Odyssey',
      year: null,
    });
  });

  it('does NOT extract year from "1984" (title is just a year)', () => {
    expect(parseQuery('1984')).toEqual({ title: '1984', year: null });
  });

  it('handles multi-word titles with year', () => {
    expect(parseQuery('The Dark Knight 2008')).toEqual({
      title: 'The Dark Knight',
      year: 2008,
    });
  });

  it('returns null year when no year present', () => {
    expect(parseQuery('The Godfather')).toEqual({
      title: 'The Godfather',
      year: null,
    });
  });

  it('handles year in title like "Blade Runner 2049 2017"', () => {
    // Should extract 2017 as year, keep "Blade Runner 2049" as title
    expect(parseQuery('Blade Runner 2049 2017')).toEqual({
      title: 'Blade Runner 2049',
      year: 2017,
    });
  });

  it('rejects years outside valid movie range', () => {
    expect(parseQuery('Future Movie 2099')).toEqual({
      title: 'Future Movie 2099',
      year: null,
    });
    expect(parseQuery('Ancient Movie 1800')).toEqual({
      title: 'Ancient Movie 1800',
      year: null,
    });
  });

  it('handles whitespace correctly', () => {
    expect(parseQuery('  Dune  2021  ')).toEqual({ title: 'Dune', year: 2021 });
  });
});

describe('normalizeTitle', () => {
  it('converts to lowercase', () => {
    expect(normalizeTitle('THE MATRIX')).toBe('matrix');
  });

  it('removes leading article "The"', () => {
    expect(normalizeTitle('The Godfather')).toBe('godfather');
  });

  it('removes leading article "A"', () => {
    expect(normalizeTitle('A Quiet Place')).toBe('quiet place');
  });

  it('removes leading article "An"', () => {
    expect(normalizeTitle('An American Werewolf')).toBe('american werewolf');
  });

  it('removes diacritics', () => {
    expect(normalizeTitle('Amélie')).toBe('amelie');
    expect(normalizeTitle('Léon')).toBe('leon');
    expect(normalizeTitle('Crème Brûlée')).toBe('creme brulee');
  });

  it('removes punctuation', () => {
    expect(normalizeTitle("Ocean's Eleven")).toBe('oceans eleven');
    expect(normalizeTitle('Spider-Man: Homecoming')).toBe('spiderman homecoming');
  });

  it('collapses whitespace', () => {
    expect(normalizeTitle('The  Dark   Knight')).toBe('dark knight');
  });

  it('handles mixed scenarios', () => {
    expect(normalizeTitle('The Crème de la Crème!')).toBe('creme de la creme');
  });
});

describe('phoneticKey', () => {
  it('produces same key for similar-sounding words', () => {
    // "Godfather" and "Godfahter" should have same phonetic key
    expect(phoneticKey('Godfather')).toBe(phoneticKey('Godfahter'));
  });

  it('maps similar consonants', () => {
    // c/k sound the same
    expect(phoneticKey('cat')).toBe(phoneticKey('kat'));
    // s/z sound similar
    expect(phoneticKey('fries')).toBe(phoneticKey('friez'));
  });

  it('collapses repeated characters', () => {
    // Both should collapse to similar keys
    const key1 = phoneticKey('Mississippi');
    const key2 = phoneticKey('Missisipi'); // Common misspelling
    expect(key1).toBe(key2);
  });

  it('handles The Matrix vs Matrix the same (after article removal)', () => {
    expect(phoneticKey('The Matrix')).toBe(phoneticKey('Matrix'));
  });
});

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('Matrix', 'Matrix')).toBe(1);
  });

  it('returns 1 for strings that normalize the same', () => {
    expect(similarity('The Matrix', 'matrix')).toBe(1);
  });

  it('returns high score for similar strings', () => {
    const sim = similarity('Godfather', 'The Godfather');
    expect(sim).toBe(1); // After normalization, both become "godfather"
  });

  it('returns lower score for different strings', () => {
    const sim = similarity('Matrix', 'Inception');
    expect(sim).toBeLessThan(0.5);
  });

  it('handles typos with reasonable similarity', () => {
    const sim = similarity('Godfahter', 'Godfather');
    expect(sim).toBeGreaterThan(0.7); // 2-char difference in 9-char word
  });

  it('returns 0 for empty strings', () => {
    expect(similarity('', 'Matrix')).toBe(0);
    expect(similarity('Matrix', '')).toBe(0);
  });
});

describe('phoneticMatch', () => {
  it('returns true for phonetically similar titles', () => {
    expect(phoneticMatch('Godfather', 'Godfahter')).toBe(true);
  });

  it('returns false for different titles', () => {
    expect(phoneticMatch('Matrix', 'Inception')).toBe(false);
  });

  it('handles The prefix', () => {
    expect(phoneticMatch('The Matrix', 'Matrix')).toBe(true);
  });
});

describe('rankResults', () => {
  const baseResults: SearchResult[] = [
    { id: 1, title: 'Dune', release_date: '1984-12-14', popularity: 50 },
    { id: 2, title: 'Dune', release_date: '2021-10-22', popularity: 200 },
    { id: 3, title: 'Dune: Part Two', release_date: '2024-03-01', popularity: 300 },
  ];

  it('ranks exact year match higher', () => {
    const ranked = rankResults(baseResults, 'Dune', 2021);
    expect(ranked[0].id).toBe(2); // 2021 Dune should be first
  });

  it('uses popularity as tiebreaker when no year specified', () => {
    const ranked = rankResults(baseResults, 'Dune', null);
    // "Dune" (exact) beats "Dune: Part Two" (partial) despite lower popularity
    // Both "Dune" entries tie on similarity, so 2021 wins on popularity
    expect(ranked[0].id).toBe(2); // 2021 Dune wins (exact match + higher popularity than 1984)
  });

  it('ranks typo-tolerant matches appropriately', () => {
    const results: SearchResult[] = [
      { id: 1, title: 'The Godfather', release_date: '1972-03-24', popularity: 100 },
      { id: 2, title: 'God Father XXX', release_date: '2010-01-01', popularity: 10 },
    ];
    const ranked = rankResults(results, 'Godfahter', null);
    expect(ranked[0].id).toBe(1); // The Godfather should win due to phonetic match
  });

  it('handles empty results', () => {
    expect(rankResults([], 'Dune', 2021)).toEqual([]);
  });

  it('prioritizes near-exact matches', () => {
    const results: SearchResult[] = [
      { id: 1, title: 'The Matrix', release_date: '1999-03-31', popularity: 100 },
      { id: 2, title: 'Matrix Reloaded', release_date: '2003-05-15', popularity: 80 },
      { id: 3, title: 'Matrix Revolutions', release_date: '2003-11-05', popularity: 70 },
    ];
    const ranked = rankResults(results, 'Matrix', null);
    expect(ranked[0].id).toBe(1); // "Matrix" most similar to "The Matrix"
  });

  it('combines year match with similarity for best ranking', () => {
    const results: SearchResult[] = [
      { id: 1, title: 'Avatar', release_date: '2009-12-18', popularity: 200 },
      { id: 2, title: 'Avatar: The Way of Water', release_date: '2022-12-16', popularity: 300 },
      { id: 3, title: 'Avatar: The Last Airbender', release_date: '2024-02-22', popularity: 100 },
    ];
    const ranked = rankResults(results, 'Avatar', 2009);
    expect(ranked[0].id).toBe(1); // 2009 Avatar should be first due to year match + high similarity
  });

  it('boosts recent movies in franchise searches', () => {
    const results: SearchResult[] = [
      { id: 1, title: 'Dune', release_date: '1984-12-14', popularity: 50, vote_count: 800 },
      { id: 2, title: 'Dune', release_date: '2021-10-22', popularity: 200, vote_count: 12000 },
      { id: 3, title: 'Dune: Part Two', release_date: '2024-03-01', popularity: 300, vote_count: 8000 },
    ];
    const ranked = rankResults(results, 'Dune', null);
    // Recent + popular + high vote count movies should rank higher
    // Dune: Part Two (2024) and Dune (2021) should beat Dune (1984)
    expect(ranked[0].release_date).toMatch(/202[0-9]/);
    expect(ranked[1].release_date).toMatch(/202[0-9]/);
    expect(ranked[2].id).toBe(1); // 1984 should be last
  });

  it('ranks sequels/prequels when query is prefix of title', () => {
    const results: SearchResult[] = [
      { id: 1, title: 'Dune', release_date: '2021-10-22', popularity: 200, vote_count: 12000 },
      { id: 2, title: 'Dune: Part Two', release_date: '2024-03-01', popularity: 300, vote_count: 8000 },
      { id: 3, title: 'The Dune Sea', release_date: '2015-01-01', popularity: 10, vote_count: 50 },
    ];
    const ranked = rankResults(results, 'Dune', null);
    // "Dune: Part Two" should rank high because "Dune" is a prefix and it's recent+popular+high votes
    const top2Ids = [ranked[0].id, ranked[1].id];
    expect(top2Ids).toContain(1);
    expect(top2Ids).toContain(2);
  });
});
