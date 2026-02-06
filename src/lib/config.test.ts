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

  it("parses comma-separated TMDB keys into tmdbKeys array", () => {
    const keys = getApiKeys({ TMDB_API_KEY: "key1, key2" });
    expect(keys.tmdbKeys).toEqual(["key1", "key2"]);
    expect(keys.tmdbKey).toBe("key1");
  });

  it("returns single-element tmdbKeys for a single key", () => {
    const keys = getApiKeys({ TMDB_API_KEY: "only-key" });
    expect(keys.tmdbKeys).toEqual(["only-key"]);
    expect(keys.tmdbKey).toBe("only-key");
  });

  it("returns empty tmdbKeys when not in env", () => {
    const keys = getApiKeys({});
    expect(keys.tmdbKeys).toEqual([]);
    expect(keys.tmdbKey).toBeUndefined();
  });
});
