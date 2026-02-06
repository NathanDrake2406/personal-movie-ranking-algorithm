import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeKvTtl, kvGet, kvSet, _resetKvClient } from "./kv";
import type { ScorePayload } from "./types";

const ONE_DAY = 24 * 60 * 60;
const SIXTY_DAYS = 60 * 24 * 60 * 60;

// ─── TTL (pure) ──────────────────────────────────────────────────────────────

describe("computeKvTtl", () => {
  const now = new Date("2026-02-06T00:00:00Z");

  describe("with exact release date", () => {
    it("returns null for films released less than 4 months ago (fresh scrape)", () => {
      expect(computeKvTtl("2025-12-01", undefined, now)).toBeNull(); // ~2 months ago
      expect(computeKvTtl("2026-01-15", undefined, now)).toBeNull(); // ~3 weeks ago
      expect(computeKvTtl("2025-10-10", undefined, now)).toBeNull(); // ~4 months ago (under)
    });

    it("returns 1 day for films released 4 months to 1 year ago", () => {
      expect(computeKvTtl("2025-09-01", undefined, now)).toBe(ONE_DAY); // ~5 months ago
      expect(computeKvTtl("2025-04-01", undefined, now)).toBe(ONE_DAY); // ~10 months ago
    });

    it("returns 60 days for films released over 1 year ago", () => {
      expect(computeKvTtl("2025-01-01", undefined, now)).toBe(SIXTY_DAYS); // ~13 months ago
      expect(computeKvTtl("2020-06-15", undefined, now)).toBe(SIXTY_DAYS); // ~5.6 years ago
      expect(computeKvTtl("1994-09-23", undefined, now)).toBe(SIXTY_DAYS); // Shawshank
    });

    it("ignores invalid release date and falls back to year", () => {
      expect(computeKvTtl("not-a-date", "2020", now)).toBe(SIXTY_DAYS);
      expect(computeKvTtl("not-a-date", undefined, now)).toBeNull();
    });
  });

  describe("year-only fallback", () => {
    it("returns null for current-year films (fresh scrape)", () => {
      expect(computeKvTtl(undefined, "2026", now)).toBeNull(); // age 0
    });

    it("returns 1 day for last-year films", () => {
      expect(computeKvTtl(undefined, "2025", now)).toBe(ONE_DAY); // age 1
    });

    it("returns 60 days for films 2+ years old", () => {
      expect(computeKvTtl(undefined, "2024", now)).toBe(SIXTY_DAYS); // age 2
      expect(computeKvTtl(undefined, "1994", now)).toBe(SIXTY_DAYS); // age 32
    });

    it("returns null when year is undefined or invalid", () => {
      expect(computeKvTtl(undefined, undefined, now)).toBeNull();
      expect(computeKvTtl(undefined, "", now)).toBeNull();
      expect(computeKvTtl(undefined, "abc", now)).toBeNull();
    });
  });
});

// ─── kvGet / kvSet (mocked Redis) ────────────────────────────────────────────

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({ get: mockGet, set: mockSet })),
}));

const samplePayload: ScorePayload = {
  movie: {
    imdbId: "tt0111161",
    title: "The Shawshank Redemption",
    year: "1994",
  },
  sources: [],
  overall: { score: 91, coverage: 0.95, disagreement: 3.2 },
};

function clearRedisEnv() {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

describe("kvGet", () => {
  beforeEach(() => {
    _resetKvClient();
    mockGet.mockReset();
    clearRedisEnv();
    process.env.KV_REST_API_URL = "https://fake.upstash.io";
    process.env.KV_REST_API_TOKEN = "fake-token";
  });
  afterEach(() => {
    clearRedisEnv();
    _resetKvClient();
  });

  it("returns cached payload on KV hit (without _v field)", async () => {
    mockGet.mockResolvedValue({ ...samplePayload, _v: 1 });
    const result = await kvGet("tt0111161");
    expect(result).toEqual(samplePayload);
    expect(result).not.toHaveProperty("_v");
    expect(mockGet).toHaveBeenCalledWith("score:tt0111161");
  });

  it("returns null on KV miss", async () => {
    mockGet.mockResolvedValue(null);
    expect(await kvGet("tt9999999")).toBeNull();
  });

  it("returns null for stale schema version", async () => {
    mockGet.mockResolvedValue({ ...samplePayload, _v: 0 });
    expect(await kvGet("tt0111161")).toBeNull();
  });

  it("returns null when env vars are missing", async () => {
    clearRedisEnv();
    _resetKvClient();
    expect(await kvGet("tt0111161")).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns null on Redis error (graceful degradation)", async () => {
    mockGet.mockRejectedValue(new Error("connection refused"));
    expect(await kvGet("tt0111161")).toBeNull();
  });

  it("falls back to UPSTASH_REDIS_REST_* env vars", async () => {
    clearRedisEnv();
    _resetKvClient();
    process.env.UPSTASH_REDIS_REST_URL = "https://native.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "native-token";
    mockGet.mockResolvedValue({ ...samplePayload, _v: 1 });
    const result = await kvGet("tt0111161");
    expect(result).toEqual(samplePayload);
    expect(result).not.toHaveProperty("_v");
  });
});

describe("kvSet", () => {
  beforeEach(() => {
    _resetKvClient();
    mockSet.mockReset();
    clearRedisEnv();
    process.env.KV_REST_API_URL = "https://fake.upstash.io";
    process.env.KV_REST_API_TOKEN = "fake-token";
  });
  afterEach(() => {
    clearRedisEnv();
    _resetKvClient();
  });

  it("writes with 60-day TTL for old films (exact date)", async () => {
    mockSet.mockResolvedValue(undefined);
    await kvSet("tt0111161", samplePayload, "1994-09-23", "1994");
    expect(mockSet).toHaveBeenCalledWith(
      "score:tt0111161",
      { ...samplePayload, _v: 1 },
      { ex: SIXTY_DAYS },
    );
  });

  it("writes with 1-day TTL for mid-age films (exact date)", async () => {
    mockSet.mockResolvedValue(undefined);
    await kvSet("tt1234567", samplePayload, "2025-09-01", "2025");
    expect(mockSet).toHaveBeenCalledWith(
      "score:tt1234567",
      { ...samplePayload, _v: 1 },
      { ex: ONE_DAY },
    );
  });

  it("skips write for recent films (fresh scrape)", async () => {
    await kvSet("tt0000001", samplePayload, "2025-12-01", "2025");
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("falls back to year when releaseDate is undefined", async () => {
    mockSet.mockResolvedValue(undefined);
    await kvSet("tt0000001", samplePayload, undefined, "2025");
    expect(mockSet).toHaveBeenCalledWith(
      "score:tt0000001",
      { ...samplePayload, _v: 1 },
      { ex: ONE_DAY },
    );
  });

  it("skips write when both releaseDate and year are undefined", async () => {
    await kvSet("tt0000001", samplePayload, undefined, undefined);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("does not throw on Redis error", async () => {
    mockSet.mockRejectedValue(new Error("rate limited"));
    await expect(
      kvSet("tt0111161", samplePayload, "1994-09-23", "1994"),
    ).resolves.toBeUndefined();
  });
});
