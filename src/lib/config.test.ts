import { describe, it, expect } from "vitest";
import { getApiKeys } from "./config";

describe("getApiKeys", () => {
  it("returns tmdbKey from env when provided", () => {
    const keys = getApiKeys({ TMDB_API_KEY: "test-tmdb-key" });
    expect(keys.tmdbKey).toBe("test-tmdb-key");
  });

  it("returns undefined tmdbKey when not in env", () => {
    const keys = getApiKeys({});
    expect(keys.tmdbKey).toBeUndefined();
  });

  it("returns omdbKeys array from single env key", () => {
    const keys = getApiKeys({ OMDB_API_KEY: "test-omdb-key" });
    expect(keys.omdbKeys).toEqual(["test-omdb-key"]);
  });

  it("returns empty omdbKeys when not in env", () => {
    const keys = getApiKeys({});
    expect(keys.omdbKeys).toEqual([]);
  });

  it("returns omdbKey for backwards compat", () => {
    const keys = getApiKeys({ OMDB_API_KEY: "test-omdb" });
    expect(keys.omdbKey).toBe("test-omdb");
  });
});
