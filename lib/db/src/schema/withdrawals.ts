import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { virtualCardsTable } from "./virtual_cards";
import { loansTable } from "./loans";

export const withdrawalStatuses = [
  "pending_verification",
  "disbursed",
  "failed",
  "locked",
] as const;

export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  mpesaPhone: varchar("mpesa_phone").notNull(),
  virtualCardId: varchar("virtual_card_id")
    .notNull()
    .references(() => virtualCardsTable.id, { onDelete: "restrict" }),
  status: varchar("status", { enum: withdrawalStatuses })
    .notNull()
    .default("pending_verification"),
  otpVerified: boolean("otp_verified").notNull().default(false),
  verificationAttempts: integer("verification_attempts").notNull().default(0),
  loanId: varchar("loan_id").references(() => loansTable.id, { onDelete: "set null" }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WithdrawalRequest = typeof withdrawalRequestsTable.$inferSelect;
