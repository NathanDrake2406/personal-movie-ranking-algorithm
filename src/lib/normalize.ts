import type { SourceScore } from './types';

const clamp = (value: number) => Math.min(100, Math.max(0, value));

// Convert each source's native scale to 0-100.
export function normalizeScore(source: SourceScore): SourceScore {
  const { source: name, raw } = source;
  if (!raw || raw.value == null) return { ...source, normalized: null };

  const v = raw.value;
  let normalized: number | null = null;

  switch (name) {
    case 'douban':
      // Douban ratings are 0-10
      normalized = clamp((v / 10) * 100);
      break;
    case 'imdb':
      // IMDb ratings are 0-10
      normalized = clamp((v / 10) * 100);
      break;
    case 'letterboxd':
      // Letterboxd ratings are 0-5
      normalized = clamp((v / 5) * 100);
      break;
    case 'metacritic':
      // Metascore already 0-100
      normalized = clamp(v);
      break;
    case 'mubi':
      // Mubi ratings are 0-10
      normalized = clamp((v / 10) * 100);
      break;
    case 'rotten_tomatoes':
    case 'rotten_tomatoes_all':
    case 'rotten_tomatoes_top':
      // RT percent already 0-100
      normalized = clamp(v);
      break;
    case 'rotten_tomatoes_audience':
      // RT Audience average rating is 0-5
      normalized = clamp((v / 5) * 100);
      break;
    default:
      normalized = null;
  }

  return { ...source, normalized };
}
