import { Suspense } from "react";
import Link from "next/link";
import { getTopMovies, type TopSort } from "@/db/queries";
import { NavTabs } from "../NavTabs";
import { PosterThumbnail } from "./PosterThumbnail";
import { TopFilters } from "./TopFilters";
import { ScrollToTop } from "./ScrollToTop";
import styles from "./top.module.css";

export const revalidate = 3600;

type SearchParams = Promise<{ limit?: string; sources?: string; sort?: string }>;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function parseSort(value: string | undefined): TopSort {
  return value === "divisive" ? "divisive" : "top";
}

export default async function TopPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const sort = parseSort(params.sort);
  const limit = parsePositiveInt(params.limit, 10);
  const minSources =
    params.sources != null && params.sources !== ""
      ? parsePositiveInt(params.sources, undefined as unknown as number)
      : undefined;

  const isDivisive = sort === "divisive";
  const movies = await getTopMovies({ limit, minSources, sort });

  const headline = isDivisive ? `Most Divisive ${limit}` : `Top ${limit}`;
  const subhead = isDivisive
    ? "Films where critics and audiences disagree the most"
    : "Highest-rated films scored so far";

  // Dense ranking: movies with identical primary scores (to 1 d.p.) share the same rank
  type Movie = (typeof movies)[number];
  const primaryScore = isDivisive
    ? (m: Movie) => m.disagreement ?? 0
    : (m: Movie) => m.overallScore;

  const ranks: number[] = [];
  for (let i = 0; i < movies.length; i++) {
    if (i === 0) {
      ranks.push(1);
    } else {
      const tied =
        primaryScore(movies[i]).toFixed(1) ===
        primaryScore(movies[i - 1]).toFixed(1);
      ranks.push(tied ? ranks[i - 1] : i + 1);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.mastheadTitle}>
          The Film Index
        </Link>
        <NavTabs />
      </header>

      <section className={styles.hero}>
        <h1 className={styles.headline}>{headline}</h1>
        <p className={styles.subhead}>{subhead}</p>
        <Suspense>
          <TopFilters />
        </Suspense>
      </section>

      {movies.length > 0 ? (
        <ol className={styles.list}>
          {movies.map((movie, i) => (
            <li key={movie.imdbId}>
              <Link href={`/?tmdbId=${movie.tmdbId}`} className={styles.row}>
                <span className={styles.rank}>{ranks[i]}</span>
                <div className={styles.posterThumbContainer}>
                  {movie.poster ? (
                    <PosterThumbnail src={movie.poster} alt={movie.title} />
                  ) : (
                    <div className={styles.posterEmpty} />
                  )}
                </div>
                <div className={styles.info}>
                  <p className={styles.movieTitle}>{movie.title}</p>
                  <p className={styles.movieMeta}>
                    {[movie.year, movie.director]
                      .filter(Boolean)
                      .join(" \u00b7 ")}
                  </p>
                </div>
                <div className={styles.scoreCol}>
                  <span className={styles.scoreValue}>
                    {movie.overallScore.toFixed(1)}
                  </span>
                  {isDivisive ? (
                    <p className={styles.scoreDivisive}>
                      <span className={styles.scoreDivisiveValue}>
                        ±{(movie.disagreement ?? 0).toFixed(1)}
                      </span>
                      {" spread"}
                    </p>
                  ) : (
                    <p className={styles.scoreSources}>
                      {movie.sourcesCount}/9 sources
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            No films match these filters yet. Search for a movie to get started.
          </p>
          <Link href="/" className={styles.emptyLink}>
            Score a film
          </Link>
        </div>
      )}
      <ScrollToTop />
    </div>
  );
}
