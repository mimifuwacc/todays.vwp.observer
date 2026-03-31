import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const songs = sqliteTable("songs", {
  videoId: text("video_id").primaryKey(),
  selectedDate: text("selected_date").notNull(),
});
