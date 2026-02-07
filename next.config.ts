import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects: async () => [
    {
      source: "/:path*",
      has: [{ type: "host", value: "movies-ranking-rho.vercel.app" }],
      destination: "https://moviesranking.com/:path*",
      permanent: true,
    },
  ],
};

export default nextConfig;
