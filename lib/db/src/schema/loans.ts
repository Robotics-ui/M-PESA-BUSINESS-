import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, numeric, integer, text, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const loanApplicationStatuses = [
  "pending",
  "approved",
  "rejected",
  "hold",
] as const;

export const loanApplicationsTable = pgTable("loan_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  purpose: text("purpose").notNull(),
  loanType: varchar("loan_type").notNull().default("business"),
  termMonths: integer("term_months").notNull(),
  status: varchar("status", { enum: loanApplicationStatuses }).notNull().default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertLoanApplicationSchema = createInsertSchema(loanApplicationsTable).omit({
  id: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLoanApplication = z.infer<typeof insertLoanApplicationSchema>;
export type LoanApplication = typeof loanApplicationsTable.$inferSelect;

export const loanStatuses = ["active", "repaid", "overdue", "defaulted", "cancelled"] as const;

export const loansTable = pgTable("loans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id")
    .notNull()
    .references(() => loanApplicationsTable.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  principal: numeric("principal", { precision: 12, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
  termMonths: integer("term_months").notNull(),
  status: varchar("status", { enum: loanStatuses }).notNull().default("active"),
  disbursedAt: timestamp("disbursed_at", { withTimezone: true }).notNull().defaultNow(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertLoanSchema = createInsertSchema(loansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type Loan = typeof loansTable.$inferSelect;

export const repaymentStatuses = ["pending", "paid", "overdue", "cancelled"] as const;

export const repaymentsTable = pgTable("repayments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: varchar("loan_id")
    .notNull()
    .references(() => loansTable.id, { onDelete: "cascade" }),
  installmentNumber: integer("installment_number").notNull(),
  amountDue: numeric("amount_due", { precision: 12, scale: 2 }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  status: varchar("status", { enum: repaymentStatuses }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRepaymentSchema = createInsertSchema(repaymentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRepayment = z.infer<typeof insertRepaymentSchema>;
export type Repayment = typeof repaymentsTable.$inferSelect;
