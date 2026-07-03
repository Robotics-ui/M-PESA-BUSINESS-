import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, date, boolean, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const customerProfilesTable = pgTable("customer_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  phone: varchar("phone").unique(),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  address: text("address"),
  city: varchar("city"),
  nationalIdNumber: varchar("national_id_number"),
  idFrontUrl: varchar("id_front_url"),
  idBackUrl: varchar("id_back_url"),
  selfieUrl: varchar("selfie_url"),
  profileComplete: boolean("profile_complete").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertCustomerProfileSchema = createInsertSchema(customerProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomerProfile = z.infer<typeof insertCustomerProfileSchema>;
export type CustomerProfile = typeof customerProfilesTable.$inferSelect;

export const otpCodesTable = pgTable("otp_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  phone: varchar("phone").notNull(),
  code: varchar("code").notNull(),
  verified: boolean("verified").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOtpCodeSchema = createInsertSchema(otpCodesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOtpCode = z.infer<typeof insertOtpCodeSchema>;
export type OtpCode = typeof otpCodesTable.$inferSelect;
