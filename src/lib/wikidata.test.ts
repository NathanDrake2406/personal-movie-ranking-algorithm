import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./http", () => ({
  fetchJson: vi.fn(),
}));

import { fetchWikidataIds, _resetWikidataCache } from "./wikidata";
import { fetchJson } from "./http";

const SPARQL_RESPONSE = {
  results: {
    bindings: [
      {
        rt: { value: "the_matrix" },
        mc: { value: "the-matrix" },
        lb: { value: "the-matrix" },
        db: { value: "1291546" },
      },
    ],
  },
};

describe("fetchWikidataIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetWikidataCache();
  });

  it("fetches from SPARQL on first call", async () => {
    vi.mocked(fetchJson).mockResolvedValue(SPARQL_RESPONSE);
    const result = await fetchWikidataIds("tt0133093");
    expect(result.rottenTomatoes).toBe("the_matrix");
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("returns cached result on second call without hitting SPARQL", async () => {
    vi.mocked(fetchJson).mockResolvedValue(SPARQL_RESPONSE);
    await fetchWikidataIds("tt0133093");
    const result = await fetchWikidataIds("tt0133093");
    expect(result.rottenTomatoes).toBe("the_matrix");
    expect(fetchJson).toHaveBeenCalledTimes(1); // only one network call
  });

  it("caches different IMDb IDs independently", async () => {
    vi.mocked(fetchJson).mockResolvedValue(SPARQL_RESPONSE);
    await fetchWikidataIds("tt0133093");
    await fetchWikidataIds("tt0000001");
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });
});
