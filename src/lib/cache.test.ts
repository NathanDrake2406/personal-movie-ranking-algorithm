import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache } from './cache';

describe('LRUCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values', () => {
    const cache = new LRUCache<string>(1000, 10);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns null for missing keys', () => {
    const cache = new LRUCache<string>(1000, 10);
    expect(cache.get('missing')).toBeNull();
  });

  it('expires entries after TTL', () => {
    const cache = new LRUCache<string>(1000, 10);
    cache.set('key1', 'value1');

    vi.advanceTimersByTime(500);
    expect(cache.get('key1')).toBe('value1');

    vi.advanceTimersByTime(600);
    expect(cache.get('key1')).toBeNull();
  });

  it('evicts oldest entry when max size exceeded', () => {
    const cache = new LRUCache<string>(10000, 3);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4'); // should evict 'a'

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
  });

  it('refreshes LRU order on get', () => {
    const cache = new LRUCache<string>(10000, 3);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    cache.get('a'); // refresh 'a' to most recent
    cache.set('d', '4'); // should evict 'b' (oldest)

    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBeNull();
  });

  it('handles empty string keys without hanging', () => {
    const cache = new LRUCache<string>(10000, 2);
    cache.set('', 'empty-key-value');
    cache.set('a', '1');
    cache.set('b', '2'); // should evict '' (oldest)

    expect(cache.get('')).toBeNull();
    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBe('2');
  });
});
