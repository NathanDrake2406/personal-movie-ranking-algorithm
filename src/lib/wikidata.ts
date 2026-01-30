import { fetchJson } from './http';
import type { WikidataIds } from './types';

type SparqlResponse = {
  results: {
    bindings: Array<{
      rt?: { value: string };
      mc?: { value: string };
      lb?: { value: string };
      db?: { value: string };
      mubi?: { value: string };
    }>;
  };
};

const ENDPOINT = 'https://query.wikidata.org/sparql';

// Looks up Wikidata entity by IMDb ID (P345) and returns RT (P1258), Metacritic (P1712), Letterboxd (P6127), Douban (P4529), and Mubi (P7299) slugs/IDs.
export async function fetchWikidataIds(imdbId: string): Promise<WikidataIds> {
  const query = `SELECT ?rt ?mc ?lb ?db ?mubi WHERE {
    ?item wdt:P345 "${imdbId}" .
    OPTIONAL { ?item wdt:P1258 ?rt }
    OPTIONAL { ?item wdt:P1712 ?mc }
    OPTIONAL { ?item wdt:P6127 ?lb }
    OPTIONAL { ?item wdt:P4529 ?db }
    OPTIONAL { ?item wdt:P7299 ?mubi }
  } LIMIT 1`;

  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const data = await fetchJson<SparqlResponse>(url, {
    headers: {
      'user-agent': 'movies-ranking/0.1 (https://example.com)',
      accept: 'application/sparql-results+json',
    },
  });

  const hit = data.results.bindings[0];
  return {
    rottenTomatoes: hit?.rt?.value,
    metacritic: hit?.mc?.value,
    letterboxd: hit?.lb?.value,
    douban: hit?.db?.value,
    mubi: hit?.mubi?.value,
  };
}
