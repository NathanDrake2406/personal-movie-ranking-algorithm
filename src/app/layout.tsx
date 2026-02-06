import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Analytics, SpeedInsights } from "./analytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Movie Rankings",
  description: "Bayesian movie scoring algorithm aggregating IMDb, Letterboxd, RT, Metacritic, Douban & Mubi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={geistSans.variable}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
