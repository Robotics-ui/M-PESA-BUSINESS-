import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const virtualCardStatuses = ["pending", "approved", "rejected"] as const;

export const virtualCardsTable = pgTable("virtual_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  cardNumber: varchar("card_number").notNull(),
  cardHolderName: varchar("card_holder_name").notNull(),
  bank: varchar("bank"),
  status: varchar("status", { enum: virtualCardStatuses }).notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  approvedBy: varchar("approved_by").references(() => usersTable.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVirtualCardSchema = createInsertSchema(virtualCardsTable).omit({
  id: true,
  status: true,
  rejectionReason: true,
  approvedBy: true,
  approvedAt: true,
  createdAt: true,
});
export type InsertVirtualCard = z.infer<typeof insertVirtualCardSchema>;
export type VirtualCard = typeof virtualCardsTable.$inferSelect;
