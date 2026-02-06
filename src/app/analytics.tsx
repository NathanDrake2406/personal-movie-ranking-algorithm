"use client";

import dynamic from "next/dynamic";

// Defer analytics loading until after hydration (reduces initial bundle)
const VercelAnalytics = dynamic(
  () => import("@vercel/analytics/react").then((m) => m.Analytics),
  { ssr: false },
);

const VercelSpeedInsights = dynamic(
  () => import("@vercel/speed-insights/react").then((m) => m.SpeedInsights),
  { ssr: false },
);

export function Analytics() {
  return <VercelAnalytics />;
}

export function SpeedInsights() {
  return <VercelSpeedInsights />;
}
