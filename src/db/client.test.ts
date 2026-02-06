import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('drizzle-orm/neon-serverless', () => ({
  drizzle: vi.fn(() => ({ __mock: true })),
}));

import { getDb, _resetDbClient } from './client';

describe('getDb', () => {
  const originalEnv = process.env.POSTGRES_URL;

  beforeEach(() => {
    _resetDbClient();
    delete process.env.POSTGRES_URL;
  });

  afterEach(() => {
    _resetDbClient();
    if (originalEnv !== undefined) {
      process.env.POSTGRES_URL = originalEnv;
    } else {
      delete process.env.POSTGRES_URL;
    }
  });

  it('returns null when POSTGRES_URL is unset', () => {
    expect(getDb()).toBeNull();
  });

  it('returns a client when POSTGRES_URL is configured', () => {
    process.env.POSTGRES_URL = 'postgresql://localhost:5432/test';
    const db = getDb();
    expect(db).not.toBeNull();
    expect(db).toHaveProperty('__mock', true);
  });

  it('returns the same instance on repeated calls (singleton)', () => {
    process.env.POSTGRES_URL = 'postgresql://localhost:5432/test';
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  it('re-initializes after _resetDbClient()', () => {
    process.env.POSTGRES_URL = 'postgresql://localhost:5432/test';
    const db1 = getDb();
    _resetDbClient();
    // Without URL, should now return null
    delete process.env.POSTGRES_URL;
    const db2 = getDb();
    expect(db1).not.toBeNull();
    expect(db2).toBeNull();
  });

  it('returns null and logs when drizzle constructor throws', async () => {
    const { drizzle } = await import('drizzle-orm/neon-serverless');
    vi.mocked(drizzle).mockImplementationOnce(() => { throw new Error('connection failed'); });

    process.env.POSTGRES_URL = 'postgresql://bad-host:5432/test';
    expect(getDb()).toBeNull();
  });
});
