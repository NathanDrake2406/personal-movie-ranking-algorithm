import styles from "./top.module.css";

type PosterThumbnailProps = {
  src: string;
  alt: string;
};

/** Downsize TMDB poster URL from w500 to w92 for thumbnails. */
function thumbUrl(src: string): string {
  return src.replace("/w500/", "/w92/");
}

export function PosterThumbnail({ src, alt }: PosterThumbnailProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(src)}
      alt={alt}
      width={56}
      height={84}
      loading="lazy"
      decoding="async"
      className={styles.posterThumb}
    />
  );
}
