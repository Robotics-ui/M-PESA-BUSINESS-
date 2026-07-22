/**
 * Test helpers — create isolated DB fixtures and clean them up after each test.
 *
 * Auth strategy: the real authMiddleware reads a session ID from the
 * `Authorization: Bearer <sid>` header, looks it up in the sessions table, then
 * loads the user from the users table.  We insert both rows directly so the
 * full middleware chain works without mocking anything.
 */

import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  sessionsTable,
  customerProfilesTable,
  virtualCardsTable,
} from "@workspace/db";
import type { User } from "@workspace/db";

// ─── Stable test card numbers ──────────────────────────────────────────────
export const CARD_NUMBER_1 = "4111111111111111";
export const CARD_NUMBER_2 = "4222222222222222";
export const WRONG_CARD_NUMBER = "9999999999999999";

// ─── Types ─────────────────────────────────────────────────────────────────
export interface TestActor {
  user: User;
  /** Value to use as `Authorization: Bearer <token>` */
  token: string;
}

// ─── User / session factory ─────────────────────────────────────────────────

async function createUser(
  overrides: Partial<User> & { email?: string } = {},
): Promise<TestActor> {
  const id = crypto.randomUUID();
  const email = overrides.email ?? `test-${id}@test.internal`;

  const [user] = await db
    .insert(usersTable)
    .values({
      id,
      email,
      firstName: "Test",
      lastName: "User",
      role: "customer",
      accountStatus: "active",
      mustChangePassword: false,
      ...overrides,
    })
    .returning();

  const sid = crypto.randomUUID();
  await db.insert(sessionsTable).values({
    sid,
    sess: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: null,
        role: user.role,
        accountStatus: user.accountStatus,
        mustChangePassword: user.mustChangePassword,
      },
    },
    expire: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { user, token: sid };
}

// ─── Pre-built actor helpers ────────────────────────────────────────────────

/**
 * A customer with verified phones but no approved loan amount yet.
 * Use this when you want to drive the full apply → approve flow in the test.
 */
export async function createBareCustomer(): Promise<TestActor> {
  const actor = await createUser({ role: "customer" });

  const suffix = actor.user.id.replace(/-/g, "").slice(0, 9);
  await db.insert(customerProfilesTable).values({
    userId: actor.user.id,
    phone: `+254700${suffix}`,
    phoneVerified: true,
    phone2: `+254711${suffix}`,
    phone2Verified: true,
    approvedLoanAmount: "0",
    loanStatus: "active",
  });

  return actor;
}

/**
 * A customer who is already approved and ready to initiate a withdrawal.
 * Has two approved virtual cards and an active loan of KES 50,000.
 */
export async function createWithdrawalReadyCustomer(): Promise<
  TestActor & { cardNumber: string }
> {
  const actor = await createUser({ role: "customer" });

  const suffix = actor.user.id.replace(/-/g, "").slice(0, 9);
  await db.insert(customerProfilesTable).values({
    userId: actor.user.id,
    phone: `+254720${suffix}`,
    phoneVerified: true,
    phone2: `+254733${suffix}`,
    phone2Verified: true,
    approvedLoanAmount: "50000.00",
    loanStatus: "active",
  });

  await db.insert(virtualCardsTable).values([
    {
      customerId: actor.user.id,
      cardNumber: CARD_NUMBER_1,
      cardHolderName: "Test Customer",
      status: "approved",
    },
    {
      customerId: actor.user.id,
      cardNumber: CARD_NUMBER_2,
      cardHolderName: "Test Customer",
      status: "approved",
    },
  ]);

  return { ...actor, cardNumber: CARD_NUMBER_1 };
}

/** A loan-officer (staff) actor who can approve/reject applications. */
export async function createLoanOfficer(): Promise<TestActor> {
  return createUser({ role: "loan_officer" });
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Delete test users by ID.  Because most child tables have `ON DELETE CASCADE`
 * from `users.id`, this removes applications, loans, repayments, withdrawals,
 * virtual cards, profiles, and OTP codes in one shot.
 * Sessions have no FK to users so they linger, but that is harmless in dev.
 */
export async function cleanupUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(usersTable).where(inArray(usersTable.id, ids));
}
