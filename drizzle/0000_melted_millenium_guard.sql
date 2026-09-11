CREATE TABLE `leaderboard_scores` (
	`player_key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`score` integer NOT NULL,
	`seconds` real NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leaderboard_scores_rank` ON `leaderboard_scores` (`score`,`seconds`);