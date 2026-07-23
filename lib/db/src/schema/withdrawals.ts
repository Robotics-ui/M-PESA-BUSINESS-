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
  "expired",
] as const;

export const withdrawalReceiptStatuses = ["pending", "confirmed", "not_received"] as const;

export const withdrawalResolutionTypes = [
  "rejected",
  "new_card_required",
  "retry",
  "reversed",
] as const;

export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  mpesaPhone: varchar("mpesa_phone").notNull(),
  /** Null for trial withdrawals (no virtual card required). */
  virtualCardId: varchar("virtual_card_id")
    .references(() => virtualCardsTable.id, { onDelete: "restrict" }),
  /** True for the up-to-2 trial withdrawals of KES 15 allowed before card approval. */
  isTrial: boolean("is_trial").notNull().default(false),
  status: varchar("status", { enum: withdrawalStatuses })
    .notNull()
    .default("pending_verification"),
  otpVerified: boolean("otp_verified").notNull().default(false),
  verificationAttempts: integer("verification_attempts").notNull().default(0),
  loanId: varchar("loan_id").references(() => loansTable.id, { onDelete: "set null" }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  retryAfterDays: integer("retry_after_days"),
  receiptStatus: varchar("receipt_status", { enum: withdrawalReceiptStatuses })
    .notNull()
    .default("pending"),
  issueReportedAt: timestamp("issue_reported_at", { withTimezone: true }),
  adminResponse: varchar("admin_response", { length: 2000 }),
  resolutionType: varchar("resolution_type", { enum: withdrawalResolutionTypes }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: varchar("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WithdrawalRequest = typeof withdrawalRequestsTable.$inferSelect;
