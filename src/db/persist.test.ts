import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScorePayload, SourceScore } from "@/lib/types";
import {
  parseYear,
  payloadToMovieRow,
  sourceToScoreRow,
  CURRENT_SCORE_VERSION,
  persistScores,
} from "./persist";

// ─── parseYear ────────────────────────────────────────────────────────────────

describe("parseYear", () => {
  it("parses a valid year", () => {
    expect(parseYear("2024")).toBe(2024);
  });

  it('returns null for empty string (guards against Number("") → 0)', () => {
    expect(parseYear("")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseYear(undefined)).toBeNull();
  });

  it("returns null for non-integer float", () => {
    expect(parseYear("2024.5")).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(parseYear("abc")).toBeNull();
  });

  it("returns null for year before 1888 (earliest known film)", () => {
    expect(parseYear("1887")).toBeNull();
  });

  it("accepts 1888 (earliest known film year)", () => {
    expect(parseYear("1888")).toBe(1888);
  });

  it("returns null for year after 2100", () => {
    expect(parseYear("2101")).toBeNull();
  });

  it("accepts 2100 (boundary)", () => {
    expect(parseYear("2100")).toBe(2100);
  });
});

// ─── payloadToMovieRow ────────────────────────────────────────────────────────

const makePayload = (overrides: Partial<ScorePayload> = {}): ScorePayload => ({
  movie: {
    imdbId: "tt1234567",
    title: "Test Movie",
    year: "2024",
    tmdbId: 42,
    poster: "https://example.com/poster.jpg",
    overview: "A test movie",
    runtime: 120,
    rating: "PG-13",
    genres: ["Drama", "Thriller"],
    director: "Test Director",
    directors: ["Test Director"],
    writers: ["Writer A"],
    cinematographer: "DP Person",
    composer: "Composer Person",
    cast: ["Actor A", "Actor B"],
  },
  sources: [
    {
      source: "imdb",
      label: "IMDb",
      normalized: 85,
      raw: { value: 8.5, scale: "0-10" },
      count: 100000,
    },
    { source: "rotten_tomatoes_top", label: "RT Top", normalized: 90 },
    { source: "rotten_tomatoes_all", label: "RT All", normalized: 88 },
    {
      source: "rotten_tomatoes_audience",
      label: "RT Audience",
      normalized: 82,
    },
    { source: "metacritic", label: "Metacritic", normalized: 75 },
    { source: "letterboxd", label: "Letterboxd", normalized: 80 },
    { source: "allocine_press", label: "AlloCiné Press", normalized: 78 },
    { source: "allocine_user", label: "AlloCiné User", normalized: 72 },
    { source: "douban", label: "Douban", normalized: 88 },
  ],
  overall: { score: 83.5, coverage: 1.0, disagreement: 5.2 },
  ...overrides,
});

const testDate = new Date("2024-06-15T12:00:00Z");

describe("payloadToMovieRow", () => {
  it("counts only weighted sources (excludes rotten_tomatoes)", () => {
    const payload = makePayload({
      sources: [
        { source: "imdb", label: "IMDb", normalized: 85 },
        { source: "rotten_tomatoes", label: "RT", normalized: 86 },
        { source: "metacritic", label: "MC", normalized: 73 },
        { source: "letterboxd", label: "LB", normalized: null },
      ],
    });
    const row = payloadToMovieRow(payload, testDate);
    // rotten_tomatoes is NOT in WEIGHTED_SOURCE_KEYS, letterboxd has null normalized
    expect(row.sourcesCount).toBe(2); // imdb + metacritic
  });

  it("sets isComplete to true when all 9 weighted sources have scores", () => {
    const row = payloadToMovieRow(makePayload(), testDate);
    expect(row.isComplete).toBe(true);
    expect(row.sourcesCount).toBe(9);
  });

  it("sets isComplete to false when some sources are missing", () => {
    const row = payloadToMovieRow(
      makePayload({
        sources: [
          { source: "imdb", label: "IMDb", normalized: 85 },
          { source: "metacritic", label: "MC", normalized: 73 },
        ],
      }),
      testDate,
    );
    expect(row.isComplete).toBe(false);
    expect(row.sourcesCount).toBe(2);
  });

  it("stores null for overall_score, coverage, disagreement when overall is null", () => {
    const row = payloadToMovieRow(makePayload({ overall: null }), testDate);
    expect(row.overallScore).toBeNull();
    expect(row.coverage).toBeNull();
    expect(row.disagreement).toBeNull();
  });

  it("populates score_version from CURRENT_SCORE_VERSION", () => {
    const row = payloadToMovieRow(makePayload(), testDate);
    expect(row.scoreVersion).toBe(CURRENT_SCORE_VERSION);
  });

  it("maps all movie metadata fields", () => {
    const row = payloadToMovieRow(makePayload(), testDate);
    expect(row.imdbId).toBe("tt1234567");
    expect(row.tmdbId).toBe(42);
    expect(row.title).toBe("Test Movie");
    expect(row.year).toBe(2024);
    expect(row.genres).toEqual(["Drama", "Thriller"]);
    expect(row.castMembers).toEqual(["Actor A", "Actor B"]);
  });

  it("handles missing optional movie fields with null", () => {
    const row = payloadToMovieRow(
      makePayload({
        movie: { imdbId: "tt999", title: "Minimal" },
      }),
      testDate,
    );
    expect(row.tmdbId).toBeNull();
    expect(row.year).toBeNull();
    expect(row.poster).toBeNull();
    expect(row.genres).toBeNull();
    expect(row.castMembers).toBeNull();
  });
});

// ─── sourceToScoreRow ─────────────────────────────────────────────────────────

describe("sourceToScoreRow", () => {
  it("maps all source fields", () => {
    const source: SourceScore = {
      source: "imdb",
      label: "IMDb",
      normalized: 85,
      raw: { value: 8.5, scale: "0-10" },
      count: 100000,
      url: "https://imdb.com/title/tt1234567",
      error: undefined,
      fromFallback: false,
    };
    const row = sourceToScoreRow("tt1234567", source, testDate);
    expect(row.imdbId).toBe("tt1234567");
    expect(row.source).toBe("imdb");
    expect(row.label).toBe("IMDb");
    expect(row.normalized).toBe(85);
    expect(row.rawValue).toBe(8.5);
    expect(row.rawScale).toBe("0-10");
    expect(row.count).toBe(100000);
    expect(row.url).toBe("https://imdb.com/title/tt1234567");
    expect(row.error).toBeNull();
    expect(row.fromFallback).toBe(false);
  });

  it("stores error string for failed sources", () => {
    const source: SourceScore = {
      source: "douban",
      label: "Douban",
      normalized: null,
      error: "Fetch failed: 403",
    };
    const row = sourceToScoreRow("tt1", source, testDate);
    expect(row.normalized).toBeNull();
    expect(row.error).toBe("Fetch failed: 403");
  });
});

// ─── persistScores (transaction behavior) ────────────────────────────────────

vi.mock("./client", () => ({
  getDb: vi.fn(),
}));

describe("persistScores", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when getDb returns null (graceful degradation)", async () => {
    const { getDb } = await import("./client");
    vi.mocked(getDb).mockReturnValue(null);

    // Should not throw
    await persistScores(makePayload());
  });

  it("calls transaction with movie upsert, score delete, and score insert", async () => {
    const mockInsertValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    });
    const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
    const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
    const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });
    const mockTx = { insert: mockInsert, delete: mockDelete };
    const mockTransaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => {
        await fn(mockTx);
      });
    const mockDb = { transaction: mockTransaction };

    const { getDb } = await import("./client");
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const payload = makePayload();
    await persistScores(payload);

    expect(mockTransaction).toHaveBeenCalledOnce();
    // 1 movie upsert + 1 bulk score insert
    expect(mockInsert).toHaveBeenCalledTimes(2);
    // 1 delete of stale scores before insert
    expect(mockDelete).toHaveBeenCalledOnce();
  });

  it("deletes stale scores before inserting (prevents orphan rows)", async () => {
    const callOrder: string[] = [];
    const mockInsertValues = vi.fn().mockImplementation(() => {
      // First insert is the movie (has onConflictDoUpdate), second is bulk scores
      return { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
    });
    const mockInsert = vi.fn().mockImplementation(() => {
      callOrder.push("insert");
      return { values: mockInsertValues };
    });
    const mockDeleteWhere = vi.fn().mockImplementation(() => {
      callOrder.push("delete");
      return Promise.resolve(undefined);
    });
    const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });
    const mockTx = { insert: mockInsert, delete: mockDelete };
    const mockTransaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => {
        await fn(mockTx);
      });
    const mockDb = { transaction: mockTransaction };

    const { getDb } = await import("./client");
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    await persistScores(makePayload());

    // Order: insert movie → delete stale scores → insert current scores
    expect(callOrder).toEqual(["insert", "delete", "insert"]);
  });

  it("uses onConflictDoNothing in backfill mode (no overwrite, no delete)", async () => {
    const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const mockInsertValues = vi.fn().mockReturnValue({
      onConflictDoNothing: mockOnConflictDoNothing,
    });
    const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
    const mockDelete = vi.fn();
    const mockTx = { insert: mockInsert, delete: mockDelete };
    const mockTransaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => {
        await fn(mockTx);
      });
    const mockDb = { transaction: mockTransaction };

    const { getDb } = await import("./client");
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    await persistScores(makePayload(), { backfill: true });

    expect(mockTransaction).toHaveBeenCalledOnce();
    // 1 movie insert + 1 bulk score insert, both with onConflictDoNothing
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(2);
    // No delete in backfill mode — we don't touch existing data
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("uses stale timestamps in backfill mode so stale payloads are not marked freshly fetched", async () => {
    const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const mockInsertValues = vi.fn().mockReturnValue({
      onConflictDoNothing: mockOnConflictDoNothing,
    });
    const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
    const mockDelete = vi.fn();
    const mockTx = { insert: mockInsert, delete: mockDelete };
    const mockTransaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => {
        await fn(mockTx);
      });
    const mockDb = { transaction: mockTransaction };

    const { getDb } = await import("./client");
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    await persistScores(makePayload(), { backfill: true });

    const insertedMovieRow = mockInsertValues.mock.calls[0]?.[0] as {
      lastFetchedAt: Date;
    };
    expect(insertedMovieRow.lastFetchedAt.toISOString()).toBe(
      "1970-01-01T00:00:00.000Z",
    );

    const insertedScoreRows = mockInsertValues.mock.calls[1]?.[0] as Array<{
      updatedAt: Date;
    }>;
    expect(insertedScoreRows.length).toBeGreaterThan(0);
    expect(
      insertedScoreRows.every(
        (row) => row.updatedAt.toISOString() === "1970-01-01T00:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("does not throw when transaction fails (never-throw semantics)", async () => {
    const mockTransaction = vi
      .fn()
      .mockRejectedValue(new Error("DB connection lost"));
    const mockDb = { transaction: mockTransaction };

    const { getDb } = await import("./client");
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    // Should not throw — logs warning instead
    await expect(persistScores(makePayload())).resolves.toBeUndefined();
  });
});
