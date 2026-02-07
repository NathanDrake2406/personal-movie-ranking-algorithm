"use client";

import { Poster } from "../Poster";

type PosterThumbnailProps = {
  src: string;
  alt: string;
  className?: string;
};

export function PosterThumbnail({ src, alt, className }: PosterThumbnailProps) {
  return (
    <Poster
      src={src}
      alt={alt}
      width={56}
      height={84}
      className={className}
    />
  );
}
