import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "The Film Index — Aggregated movie ratings from 6 platforms";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(145deg, #0a0a0a 0%, #141414 50%, #0d0d0d 100%)",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <div
            style={{
              fontSize: "18px",
              fontWeight: 400,
              letterSpacing: "0.25em",
              textTransform: "uppercase" as const,
              color: "#666",
            }}
          >
            The Film Index
          </div>
          <div
            style={{
              fontSize: "64px",
              fontWeight: 700,
              lineHeight: 1.1,
              textAlign: "center" as const,
              maxWidth: "900px",
              background: "linear-gradient(135deg, #f0c040 0%, #e07020 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            One Score from Six Platforms
          </div>
          <div
            style={{
              fontSize: "24px",
              color: "#777",
              textAlign: "center" as const,
              maxWidth: "800px",
              lineHeight: 1.5,
            }}
          >
            IMDb · Rotten Tomatoes · Metacritic · Letterboxd · Douban · AlloCiné
          </div>
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "22px",
              fontWeight: 600,
              color: "#e0a030",
              letterSpacing: "0.02em",
            }}
          >
            Search any movie →
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "16px",
            color: "#444",
          }}
        >
          moviesranking.com
        </div>
      </div>
    ),
    { ...size },
  );
}
