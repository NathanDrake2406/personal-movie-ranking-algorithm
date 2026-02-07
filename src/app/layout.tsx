import type { Metadata } from "next";
import { Source_Serif_4, DM_Sans } from "next/font/google";
import { Analytics, SpeedInsights } from "./analytics";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const title =
  "Movie Ratings from IMDb, Rotten Tomatoes, Metacritic & More";
const description =
  "Search any film and instantly compare ratings from IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Douban, and AlloCiné — all aggregated into one score.";

export const metadata: Metadata = {
  metadataBase: new URL("https://moviesranking.com"),
  title: {
    default: title,
    template: "%s | The Film Index",
  },
  description,
  openGraph: {
    type: "website",
    siteName: "The Film Index",
    title,
    description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  alternates: {
    canonical: "/",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "The Film Index",
  url: "https://moviesranking.com",
  description,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://moviesranking.com/?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sourceSerif.variable} ${dmSans.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <main>{children}</main>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
