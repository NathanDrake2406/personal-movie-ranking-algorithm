CREATE TABLE "movies" (
	"imdb_id" text PRIMARY KEY NOT NULL,
	"tmdb_id" integer,
	"title" text NOT NULL,
	"year" smallint,
	"poster" text,
	"overview" text,
	"runtime" smallint,
	"rating" text,
	"genres" text[],
	"director" text,
	"directors" text[],
	"writers" text[],
	"cinematographer" text,
	"composer" text,
	"cast_members" text[],
	"overall_score" real,
	"coverage" real,
	"disagreement" real,
	"sources_count" smallint DEFAULT 0 NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"score_version" smallint DEFAULT 1 NOT NULL,
	"last_fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"imdb_id" text NOT NULL,
	"source" text NOT NULL,
	"label" text NOT NULL,
	"normalized" real,
	"raw_value" real,
	"raw_scale" text,
	"count" integer,
	"url" text,
	"error" text,
	"from_fallback" boolean DEFAULT false,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scores_imdb_id_source_pk" PRIMARY KEY("imdb_id","source"),
	CONSTRAINT "source_check" CHECK ("scores"."source" in ('allocine_press','allocine_user','douban','imdb','letterboxd','metacritic','rotten_tomatoes','rotten_tomatoes_all','rotten_tomatoes_audience','rotten_tomatoes_top'))
);
--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_imdb_id_movies_imdb_id_fk" FOREIGN KEY ("imdb_id") REFERENCES "public"."movies"("imdb_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_movies_year" ON "movies" USING btree ("year");--> statement-breakpoint
CREATE INDEX "idx_movies_genres_gin" ON "movies" USING gin ("genres");--> statement-breakpoint
CREATE INDEX "idx_movies_last_fetched" ON "movies" USING btree ("last_fetched_at");--> statement-breakpoint
CREATE INDEX "idx_movies_score_version" ON "movies" USING btree ("score_version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_movies_tmdb_id" ON "movies" USING btree ("tmdb_id") WHERE "movies"."tmdb_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_movies_top" ON "movies" USING btree ("overall_score") WHERE "movies"."overall_score" is not null and "movies"."coverage" >= 0.70;--> statement-breakpoint
CREATE INDEX "idx_movies_divisive" ON "movies" USING btree ("disagreement") WHERE "movies"."overall_score" is not null and "movies"."coverage" >= 0.70;--> statement-breakpoint
CREATE INDEX "idx_scores_imdb_id" ON "scores" USING btree ("imdb_id");