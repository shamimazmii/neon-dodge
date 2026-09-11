import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const leaderboardScores = sqliteTable(
  "leaderboard_scores",
  {
    playerKey: text("player_key").primaryKey(),
    name: text("name").notNull(),
    score: integer("score").notNull(),
    seconds: real("seconds").notNull(),
    updatedAt: integer("updated_at").notNull()
  },
  table => [index("idx_leaderboard_scores_rank").on(table.score, table.seconds)]
);
