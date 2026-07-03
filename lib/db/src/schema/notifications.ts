import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const notificationChannels = ["sms", "email", "in_app"] as const;
export const notificationStatuses = ["sent", "pending", "failed"] as const;

export const notificationsTable = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  channel: varchar("channel", { enum: notificationChannels }).notNull().default("in_app"),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  status: varchar("status", { enum: notificationStatuses }).notNull().default("sent"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
