"use client";

import { useState, memo, SyntheticEvent } from "react";
import styles from "./page.module.css";

export type PosterProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  skeletonClassName?: string;
  responsive?: boolean;
};

export const Poster = memo(function Poster({
  src,
  alt,
  width,
  height,
  className,
  skeletonClassName,
  responsive,
}: PosterProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = (_e: SyntheticEvent<HTMLImageElement>) => {
    // Small delay for smoother transition
    requestAnimationFrame(() => setLoaded(true));
  };

  // When responsive, let CSS handle sizing; otherwise use fixed dimensions
  const containerStyle = responsive ? undefined : { width, height };

  return (
    <div className={styles.posterContainer} style={containerStyle}>
      {!loaded && !error && (
        <div
          className={`${styles.posterSkeleton} ${skeletonClassName || ""}`}
        />
      )}
      {!error && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={`${className || ""} ${loaded ? styles.posterLoaded : styles.posterLoading}`}
          onLoad={handleLoad}
          onError={() => setError(true)}
        />
      )}
      {error && (
        <div className={styles.posterError}>
          <span>Unable to load</span>
        </div>
      )}
    </div>
  );
});
