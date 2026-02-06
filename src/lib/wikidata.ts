import { fetchJson } from "./http";
import { LRUCache } from "./cache";
import type { WikidataIds } from "./types";

type SparqlResponse = {
  results: {
    bindings: Array<{
      rt?: { value: string };
      mc?: { value: string };
      lb?: { value: string };
      db?: { value: string };
      allocineFilm?: { value: string };
      allocineSeries?: { value: string };
    }>;
  };
};

const ENDPOINT = "https://query.wikidata.org/sparql";
let wikidataCache = new LRUCache<WikidataIds>(24 * 60 * 60 * 1000, 500); // 24h TTL

// Looks up Wikidata entity by IMDb ID (P345) and returns platform IDs
export async function fetchWikidataIds(
  imdbId: string,
  signal?: AbortSignal,
): Promise<WikidataIds> {
  const cached = wikidataCache.get(imdbId);
  if (cached) return cached;

  const query = `SELECT ?rt ?mc ?lb ?db ?allocineFilm ?allocineSeries WHERE {
    ?item wdt:P345 "${imdbId}" .
    OPTIONAL { ?item wdt:P1258 ?rt }
    OPTIONAL { ?item wdt:P1712 ?mc }
    OPTIONAL { ?item wdt:P6127 ?lb }
    OPTIONAL { ?item wdt:P4529 ?db }
    OPTIONAL { ?item wdt:P1265 ?allocineFilm }
    OPTIONAL { ?item wdt:P1267 ?allocineSeries }
  } LIMIT 1`;

  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const data = await fetchJson<SparqlResponse>(url, {
    headers: {
      "user-agent":
        "movies-ranking/1.0 (+https://movies-ranking-rho.vercel.app)",
      accept: "application/sparql-results+json",
    },
    signal,
  });

  const hit = data.results.bindings[0];
  const result: WikidataIds = {
    rottenTomatoes: hit?.rt?.value,
    metacritic: hit?.mc?.value,
    letterboxd: hit?.lb?.value,
    douban: hit?.db?.value,
    allocineFilm: hit?.allocineFilm?.value,
    allocineSeries: hit?.allocineSeries?.value,
  };

  wikidataCache.set(imdbId, result);
  return result;
}

export function _resetWikidataCache(): void {
  wikidataCache = new LRUCache<WikidataIds>(24 * 60 * 60 * 1000, 500);
}
