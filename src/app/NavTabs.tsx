"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./NavTabs.module.css";

const tabs = [
  { label: "Search", href: "/" },
  { label: "The List", href: "/top" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs}>
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}
            className={`${styles.pill} ${isActive ? styles.pillActive : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
