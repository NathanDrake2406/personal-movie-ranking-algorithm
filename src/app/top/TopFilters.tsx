"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { GENRES } from "./genres";
import styles from "./top.module.css";

const sortOptions = [
  { value: "top", label: "Highest Rated" },
  { value: "divisive", label: "Most Divisive" },
] as const;

const limitOptions = [
  { value: "10", label: "Top 10" },
  { value: "100", label: "Top 100" },
  { value: "1000", label: "Top 1000" },
] as const;

const sourceOptions = [
  { value: "", label: "7+ sources" },
  { value: "8", label: "8+ sources" },
  { value: "9", label: "9/9 sources" },
] as const;

export function TopFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSort = searchParams.get("sort") ?? "top";
  const currentGenre = searchParams.get("genre") ?? "";
  const currentSources = searchParams.get("sources") ?? "";

  const rawLimit = searchParams.get("limit") ?? "10";
  const currentLimit =
    currentSort === "divisive" && rawLimit === "1000" ? "500" : rawLimit;

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (
        value === "" ||
        (key === "limit" && value === "10") ||
        (key === "sort" && value === "top")
      ) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      router.push(qs ? `/top?${qs}` : "/top");
    },
    [router, searchParams],
  );

  return (
    <div className={styles.filters}>
      <select
        className={styles.filterSelect}
        value={currentSort}
        onChange={(e) => updateParams("sort", e.target.value)}
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {!currentGenre && (
        <select
          className={styles.filterSelect}
          value={currentLimit}
          onChange={(e) => updateParams("limit", e.target.value)}
        >
          {limitOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      <select
        className={styles.filterSelect}
        value={currentGenre}
        onChange={(e) => updateParams("genre", e.target.value)}
      >
        <option value="">All Genres</option>
        {GENRES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <select
        className={styles.filterSelect}
        value={currentSources}
        onChange={(e) => updateParams("sources", e.target.value)}
      >
        {sourceOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
