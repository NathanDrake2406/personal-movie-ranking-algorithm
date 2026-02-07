"use client";

import {
  useState,
  useRef,
  useEffect,
  memo,
  useReducer,
  useMemo,
  useCallback,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import { NavTabs } from "./NavTabs";
import { Poster } from "./Poster";
import { SearchCombobox } from "./SearchCombobox";
import { SourceIcon } from "./SourceIcon";
import dynamic from "next/dynamic";

const ThemesSection = dynamic(() =>
  import("./ThemesSection").then((m) => m.ThemesSection),
);
import type { ScorePayload, SourceScore, MovieInfo } from "@/lib/types";

// Discriminated union for fetch state - makes impossible states impossible
type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: ScorePayload }
  | { status: "error"; error: string };

type FetchAction =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; data: ScorePayload }
  | { type: "FETCH_ERROR"; error: string }
  | { type: "RESET" };

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case "FETCH_START":
      return { status: "loading" };
    case "FETCH_SUCCESS":
      return { status: "success", data: action.data };
    case "FETCH_ERROR":
      return { status: "error", error: action.error };
    case "RESET":
      return { status: "idle" };
  }
}

function formatScore(val: number | null) {
  return val == null ? "—" : val.toFixed(1);
}

const ScoreCard = memo(function ScoreCard({ score }: { score: SourceScore }) {
  return (
    <div className={styles.scoreCard}>
      <p className={styles.scoreSource}>
        <SourceIcon
          source={score.source}
          size={24}
          className={styles.sourceIcon}
        />
        {score.label}
      </p>
      <p className={styles.scoreValue}>{formatScore(score.normalized)}</p>
      {score.raw?.value != null ? (
        <p className={styles.scoreRaw}>
          {score.raw.value} out of {score.raw.scale.split("-")[1]}
        </p>
      ) : null}
      {score.fromFallback ? (
        <p className={styles.scoreMuted}>via fallback</p>
      ) : null}
      {score.error ? <p className={styles.scoreMuted}>{score.error}</p> : null}
      {score.url ? (
        <a
          href={score.url}
          target="_blank"
          rel="noreferrer"
          className={styles.scoreLink}
        >
          View source →
        </a>
      ) : null}
    </div>
  );
});

type RTScoreCardProps = {
  rtMain: SourceScore | undefined;
  rtAudience: SourceScore | undefined;
  rtAll: SourceScore | undefined;
  rtTop: SourceScore | undefined;
};

type AllocineScoreCardProps = {
  allocinePress: SourceScore | undefined;
  allocineUser: SourceScore | undefined;
};

const AllocineScoreCard = memo(function AllocineScoreCard({
  allocinePress,
  allocineUser,
}: AllocineScoreCardProps) {
  // If neither score exists, don't render
  if (!allocinePress && !allocineUser) return null;

  const url = allocinePress?.url || allocineUser?.url;
  const error = allocinePress?.error || allocineUser?.error;

  return (
    <div className={`${styles.scoreCard} ${styles.rtCard}`}>
      <p className={styles.scoreSource}>
        <SourceIcon source="allocine" size={24} className={styles.sourceIcon} />
        AlloCiné
      </p>

      {/* Press & User scores side by side */}
      <div className={styles.rtMainScores}>
        <div className={styles.rtMainScore}>
          <span className={styles.rtMainValue}>
            {formatScore(allocinePress?.normalized ?? null)}
          </span>
          {allocinePress?.raw?.value != null ? (
            <span className={styles.rtMainScale}>
              {allocinePress.raw.value} out of{" "}
              {allocinePress.raw.scale.split("-")[1]}
            </span>
          ) : null}
          <span className={styles.rtMainLabel}>Press</span>
        </div>
        <div className={styles.rtMainScore}>
          <span className={styles.rtMainValue}>
            {formatScore(allocineUser?.normalized ?? null)}
          </span>
          {allocineUser?.raw?.value != null ? (
            <span className={styles.rtMainScale}>
              {allocineUser.raw.value} out of{" "}
              {allocineUser.raw.scale.split("-")[1]}
            </span>
          ) : null}
          <span className={styles.rtMainLabel}>User</span>
        </div>
      </div>

      {error ? <p className={styles.scoreMuted}>{error}</p> : null}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={styles.scoreLink}
        >
          View source →
        </a>
      ) : null}
    </div>
  );
});

const RTScoreCard = memo(function RTScoreCard({
  rtMain,
  rtAudience,
  rtAll,
  rtTop,
}: RTScoreCardProps) {
  return (
    <div className={`${styles.scoreCard} ${styles.rtCard}`}>
      <p className={styles.scoreSource}>
        <SourceIcon
          source="rotten_tomatoes"
          size={24}
          className={styles.sourceIcon}
        />
        Rotten Tomatoes
      </p>

      {/* Main scores: Critics & Audience side by side */}
      <div className={styles.rtMainScores}>
        <div className={styles.rtMainScore}>
          <span className={styles.rtMainValue}>
            {rtMain?.raw?.value ?? "—"}
          </span>
          {rtMain?.raw?.value != null ? (
            <span className={styles.rtMainScale}>
              {rtMain.raw.value} out of {rtMain.raw.scale.split("-")[1]}
            </span>
          ) : null}
          <span className={styles.rtMainLabel}>Critics</span>
        </div>
        <div className={styles.rtMainScore}>
          <span className={styles.rtMainValue}>
            {formatScore(rtAudience?.normalized ?? null)}
          </span>
          {rtAudience?.raw?.value != null ? (
            <span className={styles.rtMainScale}>
              {rtAudience.raw.value} out of {rtAudience.raw.scale.split("-")[1]}
            </span>
          ) : null}
          <span className={styles.rtMainLabel}>Audience</span>
        </div>
      </div>

      {rtAll || rtTop ? (
        <>
          <div className={styles.rtDivider} />
          <div className={styles.rtSubScores}>
            {rtAll ? (
              <div className={styles.rtSubScore}>
                <span className={styles.rtSubLabel}>All Critics Avg</span>
                <span className={styles.rtSubValue}>
                  {rtAll.raw?.value ?? "—"}
                </span>
              </div>
            ) : null}
            {rtTop ? (
              <div className={styles.rtSubScore}>
                <span className={styles.rtSubLabel}>Top Critics Avg</span>
                <span className={styles.rtSubValue}>
                  {rtTop.raw?.value ?? "—"}
                </span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {rtMain?.fromFallback ? (
        <p className={styles.scoreMuted}>via fallback</p>
      ) : null}
      {rtMain?.url ? (
        <a
          href={rtMain.url}
          target="_blank"
          rel="noreferrer"
          className={styles.scoreLink}
        >
          View source →
        </a>
      ) : null}
    </div>
  );
});

const CreditsList = memo(function CreditsList({ movie }: { movie: MovieInfo }) {
  const credits = [
    {
      label: "Directed by",
      value: movie.directors?.join(", ") || movie.director,
    },
    { label: "Starring", value: movie.cast?.join(", ") },
    { label: "Written by", value: movie.writers?.join(", ") },
    { label: "Cinematography", value: movie.cinematographer },
    { label: "Editing", value: movie.editor },
    { label: "Music", value: movie.composer },
  ].filter((c): c is { label: string; value: string } => !!c.value);

  if (credits.length === 0) return null;

  return (
    <div className={styles.posterCredits}>
      {credits.map((c) => (
        <p key={c.label} className={styles.creditLine}>
          <span className={styles.creditLabel}>{c.label}</span>
          <span className={styles.creditNames}>{c.value}</span>
        </p>
      ))}
    </div>
  );
});

type ConsensusSectionProps = {
  consensus: { critics?: string; audience?: string };
};

const ConsensusSection = memo(function ConsensusSection({
  consensus,
}: ConsensusSectionProps) {
  if (!consensus.critics && !consensus.audience) return null;

  return (
    <div className={styles.consensusSection}>
      {consensus.critics && (
        <div className={styles.consensusBlock}>
          <p className={styles.consensusLabel}>Critics Consensus</p>
          <p className={styles.consensusText}>{consensus.critics}</p>
        </div>
      )}
      {consensus.audience && (
        <div className={styles.consensusBlock}>
          <p className={styles.consensusLabel}>Audience Consensus</p>
          <p className={styles.consensusText}>{consensus.audience}</p>
        </div>
      )}
    </div>
  );
});

function HomeContent() {
  const searchParams = useSearchParams();
  const [resetKey, setResetKey] = useState(0);
  const [fetchState, dispatch] = useReducer(fetchReducer, { status: "idle" });
  const [lastTmdbId, setLastTmdbId] = useState<number | null>(null);
  const scoreAbortController = useRef<AbortController | null>(null);
  const deepLinkHandled = useRef(false);

  // Derived state from fetchState
  const loading = fetchState.status === "loading";
  const error = fetchState.status === "error" ? fetchState.error : null;
  const data = fetchState.status === "success" ? fetchState.data : null;

  const fetchScores = useCallback(async (tmdbId: number) => {
    // Cancel any in-flight request
    scoreAbortController.current?.abort();
    scoreAbortController.current = new AbortController();

    setLastTmdbId(tmdbId);
    dispatch({ type: "FETCH_START" });
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tmdbId }),
        signal: scoreAbortController.current.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      dispatch({ type: "FETCH_SUCCESS", data: json as ScorePayload });
    } catch (err) {
      // Ignore aborted requests
      if ((err as Error).name === "AbortError") return;
      dispatch({ type: "FETCH_ERROR", error: (err as Error).message });
    }
  }, []); // dispatch and setLastTmdbId are stable; scoreAbortController is a ref

  // Deep-link: auto-fetch when ?tmdbId= is present (e.g., from /top page)
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const tmdbIdParam = searchParams.get("tmdbId");
    if (tmdbIdParam) {
      const tmdbId = Number(tmdbIdParam);
      if (Number.isInteger(tmdbId) && tmdbId > 0) {
        deepLinkHandled.current = true;
        fetchScores(tmdbId);
      }
    }
  }, [searchParams, fetchScores]);

  const handleReset = () => {
    setResetKey((k) => k + 1);
    dispatch({ type: "RESET" });
  };

  const {
    rtMain,
    rtAudience,
    rtAll,
    rtTop,
    allocinePress,
    allocineUser,
    cardDefs,
  } = useMemo(() => {
    const rtScores =
      data?.sources.filter((s) => s.source.startsWith("rotten_tomatoes")) ?? [];
    const allocineScores =
      data?.sources.filter((s) => s.source.startsWith("allocine_")) ?? [];
    const otherScores =
      data?.sources.filter(
        (s) =>
          !s.source.startsWith("rotten_tomatoes") &&
          !s.source.startsWith("allocine_"),
      ) ?? [];
    const rtMain = rtScores.find((s) => s.source === "rotten_tomatoes");
    const rtAudience = rtScores.find(
      (s) => s.source === "rotten_tomatoes_audience",
    );
    const rtAll = rtScores.find((s) => s.source === "rotten_tomatoes_all");
    const rtTop = rtScores.find((s) => s.source === "rotten_tomatoes_top");
    const allocinePress = allocineScores.find(
      (s) => s.source === "allocine_press",
    );
    const allocineUser = allocineScores.find(
      (s) => s.source === "allocine_user",
    );

    type CardDef =
      | { type: "individual"; sortKey: string; score: SourceScore }
      | { type: "rt"; sortKey: string }
      | { type: "allocine"; sortKey: string };

    const cardDefs: CardDef[] = [
      ...otherScores.map(
        (s): CardDef => ({
          type: "individual",
          sortKey: s.label.toLowerCase(),
          score: s,
        }),
      ),
      ...(rtScores.length > 0
        ? [{ type: "rt" as const, sortKey: "rotten tomatoes" }]
        : []),
      ...(allocineScores.length > 0
        ? [{ type: "allocine" as const, sortKey: "allocine" }]
        : []),
    ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    return {
      rtMain,
      rtAudience,
      rtAll,
      rtTop,
      allocinePress,
      allocineUser,
      cardDefs,
    };
  }, [data]);

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <p className={styles.mastheadTitle} onClick={handleReset}>
          The Film Index
        </p>
        <NavTabs />
      </header>

      <section className={styles.hero}>
        <h1 className={styles.headline}>One Score to Rule Them All</h1>
        <p className={styles.subhead}>
          Scores from IMDb, RT, Metacritic, Letterboxd, AlloCiné, and Douban.
          <br />
          Distilled into one score using a weighted algorithm.
        </p>

        <SearchCombobox key={resetKey} onSelect={fetchScores} />

        {error ? (
          <div className={styles.errorWrapper}>
            <div className={styles.error}>{error}</div>
            {lastTmdbId != null && (
              <button
                type="button"
                className={styles.retryBtn}
                onClick={() => fetchScores(lastTmdbId)}
              >
                Retry
              </button>
            )}
          </div>
        ) : null}

        {loading ? (
          <div className={styles.loadingWrapper}>
            <div className={styles.loadingSpinner} />
            <p className={styles.loadingText}>Fetching scores...</p>
          </div>
        ) : null}
      </section>

      {data ? (
        <section className={styles.results}>
          <div className={styles.movieHeader}>
            <div className={styles.posterWrapper}>
              {data.movie.poster ? (
                <Poster
                  src={data.movie.poster}
                  alt={data.movie.title}
                  width={360}
                  height={540}
                  className={styles.poster}
                  skeletonClassName={styles.posterSkeletonLarge}
                  responsive
                />
              ) : (
                <div className={styles.posterPlaceholder}>No poster</div>
              )}
              <CreditsList movie={data.movie} />
            </div>
            <div className={styles.movieInfo}>
              <div className={styles.movieInfoTop}>
                <h2 className={styles.movieTitle}>{data.movie.title}</h2>
                <div className={styles.movieMetaGroup}>
                  <p className={styles.movieMeta}>
                    {[
                      data.movie.year,
                      data.movie.rating,
                      data.movie.runtime &&
                        `${Math.floor(data.movie.runtime / 60)}h ${data.movie.runtime % 60}m`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {data.movie.genres && data.movie.genres.length > 0 && (
                    <p className={styles.movieMeta}>
                      {data.movie.genres.slice(0, 3).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <div className={styles.movieInfoMiddle}>
                {data.movie.overview && (
                  <p className={styles.movieOverview}>{data.movie.overview}</p>
                )}
                <div className={styles.verdictBox}>
                  <p className={styles.verdictLabel}>Our Verdict</p>
                  <p className={styles.verdictScore}>
                    {formatScore(data.overall?.score ?? null)}
                  </p>
                </div>
              </div>
              <div className={styles.movieInfoExtra}>
                {data.themes && data.themes.length > 0 && (
                  <ThemesSection
                    themes={data.themes}
                    imdbId={data.movie.imdbId}
                  />
                )}
                {data.imdbSummary && (
                  <div className={styles.imdbSummarySection}>
                    <div className={styles.consensusBlock}>
                      <p className={styles.consensusText}>{data.imdbSummary}</p>
                    </div>
                  </div>
                )}
                {data.consensus && (
                  <ConsensusSection consensus={data.consensus} />
                )}
              </div>
            </div>
          </div>

          <div className={styles.scoresSection}>
            <h3 className={styles.scoresTitle}>Individual Scores</h3>
            <div className={styles.scoresGrid}>
              {cardDefs.map((card) => {
                switch (card.type) {
                  case "individual":
                    return (
                      <ScoreCard key={card.score.source} score={card.score} />
                    );
                  case "rt":
                    return (
                      <RTScoreCard
                        key="rotten_tomatoes"
                        rtMain={rtMain}
                        rtAudience={rtAudience}
                        rtAll={rtAll}
                        rtTop={rtTop}
                      />
                    );
                  case "allocine":
                    return (
                      <AllocineScoreCard
                        key="allocine"
                        allocinePress={allocinePress}
                        allocineUser={allocineUser}
                      />
                    );
                }
              })}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
