import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const violationTypes = ["warning", "violation"] as const;

export const violationsTable = pgTable("violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  issuedBy: varchar("issued_by")
    .notNull()
    .references(() => usersTable.id),
  type: varchar("type", { enum: violationTypes }).notNull().default("warning"),
  reason: text("reason").notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Violation = typeof violationsTable.$inferSelect;
