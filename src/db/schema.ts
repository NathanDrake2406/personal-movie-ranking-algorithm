import {
  pgTable,
  text,
  integer,
  smallint,
  real,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Movies table ─────────────────────────────────────────────────────────────

export const movies = pgTable('movies', {
  imdbId: text('imdb_id').primaryKey(),
  tmdbId: integer('tmdb_id'),
  title: text('title').notNull(),
  year: smallint('year'),
  poster: text('poster'),
  overview: text('overview'),
  runtime: smallint('runtime'),
  rating: text('rating'),
  genres: text('genres').array(),
  director: text('director'),
  directors: text('directors').array(),
  writers: text('writers').array(),
  cinematographer: text('cinematographer'),
  composer: text('composer'),
  castMembers: text('cast_members').array(),
  overallScore: real('overall_score'),
  coverage: real('coverage'),
  disagreement: real('disagreement'),
  sourcesCount: smallint('sources_count').notNull().default(0),
  isComplete: boolean('is_complete').notNull().default(false),
  scoreVersion: smallint('score_version').notNull().default(1),
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Full indexes
  index('idx_movies_year').on(table.year),
  index('idx_movies_genres_gin').using('gin', table.genres),
  index('idx_movies_last_fetched').on(table.lastFetchedAt),
  index('idx_movies_score_version').on(table.scoreVersion),
  uniqueIndex('idx_movies_tmdb_id').on(table.tmdbId).where(sql`${table.tmdbId} is not null`),

  // Partial indexes for ranked list queries (quality gate in predicate)
  index('idx_movies_top').on(table.overallScore)
    .where(sql`${table.overallScore} is not null and ${table.coverage} >= 0.70`),
  index('idx_movies_divisive').on(table.disagreement)
    .where(sql`${table.overallScore} is not null and ${table.coverage} >= 0.70`),
]);

// ─── Scores table ─────────────────────────────────────────────────────────────

export const scores = pgTable('scores', {
  imdbId: text('imdb_id').notNull().references(() => movies.imdbId, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  label: text('label').notNull(),
  normalized: real('normalized'),
  rawValue: real('raw_value'),
  rawScale: text('raw_scale'),
  count: integer('count'),
  url: text('url'),
  error: text('error'),
  fromFallback: boolean('from_fallback').default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.imdbId, table.source] }),
  index('idx_scores_imdb_id').on(table.imdbId),
  check('source_check', sql`${table.source} in ('allocine_press','allocine_user','douban','imdb','letterboxd','metacritic','rotten_tomatoes','rotten_tomatoes_all','rotten_tomatoes_audience','rotten_tomatoes_top')`),
]);

// ─── Type exports ─────────────────────────────────────────────────────────────

export type Movie = typeof movies.$inferSelect;
export type NewMovie = typeof movies.$inferInsert;
export type Score = typeof scores.$inferSelect;
export type NewScore = typeof scores.$inferInsert;
