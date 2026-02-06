import { drizzle } from "drizzle-orm/neon-serverless";
import { log } from "@/lib/logger";
import * as schema from "./schema";

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

// undefined = not initialized, null = disabled, DbClient = active
let dbClient: DbClient | null | undefined;

export function getDb(): DbClient | null {
  if (dbClient !== undefined) return dbClient;

  const url = process.env.POSTGRES_URL;
  if (!url) {
    log.info("db_disabled", { reason: "Missing POSTGRES_URL env var" });
    dbClient = null;
    return null;
  }

  try {
    dbClient = drizzle(url, { schema });
    log.info("db_enabled");
    return dbClient;
  } catch (err) {
    log.warn("db_init_failed", { error: (err as Error).message });
    dbClient = null;
    return null;
  }
}

/** Reset client for testing — allows re-initialization after env var changes. */
export function _resetDbClient(): void {
  dbClient = undefined;
}
