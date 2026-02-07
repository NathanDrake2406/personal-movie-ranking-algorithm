import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({
  getDb: vi.fn(),
}));

vi.mock("./persist", () => ({
  CURRENT_SCORE_VERSION: 2,
}));

import { getTopMovies } from "./queries";
import { getDb } from "./client";

describe("getTopMovies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when database is not available", async () => {
    vi.mocked(getDb).mockReturnValue(null);

    const result = await getTopMovies();

    expect(result).toEqual([]);
  });

  it("calls the database with correct query shape", async () => {
    const mockRows = [
      {
        imdbId: "tt0111161",
        tmdbId: 278,
        title: "The Shawshank Redemption",
        year: 1994,
        poster: "https://image.tmdb.org/poster.jpg",
        director: "Frank Darabont",
        overallScore: 92.5,
        disagreement: 8.3,
        coverage: 0.89,
        sourcesCount: 8,
      },
    ];

    const mockLimit = vi.fn().mockResolvedValue(mockRows);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    vi.mocked(getDb).mockReturnValue({ select: mockSelect } as never);

    const result = await getTopMovies();

    expect(result).toEqual(mockRows);
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it("respects custom limit parameter", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    vi.mocked(getDb).mockReturnValue({ select: mockSelect } as never);

    await getTopMovies({ limit: 5 });

    expect(mockLimit).toHaveBeenCalledWith(5);
  });

  it("passes minSources filter when provided", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    vi.mocked(getDb).mockReturnValue({ select: mockSelect } as never);

    await getTopMovies({ limit: 20, minSources: 9 });

    expect(mockLimit).toHaveBeenCalledWith(20);
    // where() was called (verifying it doesn't throw with extra conditions)
    expect(mockWhere).toHaveBeenCalled();
  });

  it("uses divisive sort when sort option is provided", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    vi.mocked(getDb).mockReturnValue({ select: mockSelect } as never);

    await getTopMovies({ sort: "divisive" });

    expect(mockSelect).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(10);
  });
});
