import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const guarantorsTable = pgTable("guarantors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** One company guarantor per customer (unique constraint). */
  customerId: varchar("customer_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  companyRegistration: varchar("company_registration", { length: 100 }),
  contactPerson: varchar("contact_person", { length: 255 }),
  phone: varchar("phone", { length: 30 }),
  address: text("address"),
  /** Staff member who added/last updated this guarantor record. */
  addedBy: varchar("added_by")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Guarantor = typeof guarantorsTable.$inferSelect;
