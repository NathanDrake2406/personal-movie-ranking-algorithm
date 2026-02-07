import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://moviesranking.com",
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://moviesranking.com/top",
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];
}
