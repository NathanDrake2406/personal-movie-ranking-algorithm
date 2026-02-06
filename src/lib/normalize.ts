import type { SourceScore } from "./types";

const clamp = (value: number) => Math.min(100, Math.max(0, value));

// IMDb scores are compressed (6-9.3 practical range)
// Boost high scores so 8.5 IMDb ≈ 90, 9.0 ≈ 96
function boostImdb(raw: number): number {
  if (raw <= 7.0) {
    return raw * 10; // linear below 7
  }
  // Map 7.0-9.3 → 70-100 (stretches the top end)
  return 70 + ((raw - 7.0) / 2.3) * 30;
}

// Convert each source's native scale to 0-100.
export function normalizeScore(source: SourceScore): SourceScore {
  const { source: name, raw } = source;
  if (!raw || raw.value == null) return { ...source, normalized: null };

  const v = raw.value;
  let normalized: number | null = null;

  switch (name) {
    case "douban":
      // Douban ratings are 0-10
      normalized = clamp((v / 10) * 100);
      break;
    case "imdb":
      // IMDb ratings are compressed - boost high scores
      normalized = clamp(boostImdb(v));
      break;
    case "letterboxd":
      // Letterboxd ratings are 0-5
      normalized = clamp((v / 5) * 100);
      break;
    case "metacritic":
      // Metascore already 0-100
      normalized = clamp(v);
      break;
    case "allocine_press":
    case "allocine_user":
      // AlloCiné ratings are 0-5 stars
      normalized = clamp((v / 5) * 100);
      break;
    case "rotten_tomatoes":
    case "rotten_tomatoes_all":
    case "rotten_tomatoes_top":
      // RT percent already 0-100
      normalized = clamp(v);
      break;
    case "rotten_tomatoes_audience":
      // RT Audience average rating is 0-5
      normalized = clamp((v / 5) * 100);
      break;
    default:
      normalized = null;
  }

  return { ...source, normalized };
}
