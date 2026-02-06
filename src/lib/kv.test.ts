import { describe, it, expect } from 'vitest';
import { computeKvTtl } from './kv';

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

describe('computeKvTtl', () => {
  const now = new Date('2026-02-06T00:00:00Z');

  it('returns null for films less than 2 years old', () => {
    expect(computeKvTtl('2025', now)).toBeNull(); // age 1
    expect(computeKvTtl('2026', now)).toBeNull(); // age 0
  });

  it('returns null when year is undefined or invalid', () => {
    expect(computeKvTtl(undefined, now)).toBeNull();
    expect(computeKvTtl('', now)).toBeNull();
    expect(computeKvTtl('abc', now)).toBeNull();
  });

  it('returns 7 days for films 2-10 years old', () => {
    expect(computeKvTtl('2024', now)).toBe(SEVEN_DAYS); // age 2
    expect(computeKvTtl('2020', now)).toBe(SEVEN_DAYS); // age 6
    expect(computeKvTtl('2016', now)).toBe(SEVEN_DAYS); // age 10 (boundary)
  });

  it('returns 30 days for films older than 10 years', () => {
    expect(computeKvTtl('2015', now)).toBe(THIRTY_DAYS); // age 11
    expect(computeKvTtl('1994', now)).toBe(THIRTY_DAYS); // age 32
  });
});
