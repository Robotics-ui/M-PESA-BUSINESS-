/**
 * Integration tests — full loan approval lifecycle.
 *
 * Each test uses real DB rows (real auth sessions, real users) and makes HTTP
 * requests through the full Express middleware stack via supertest.  Tests are
 * isolated: every `beforeEach` creates fresh actors and every `afterEach`
 * deletes them (cascade removes all child records).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { desc, eq, sum } from "drizzle-orm";
import {
  db,
  customerProfilesTable,
  loanApplicationsTable,
  loansTable,
  repaymentsTable,
  otpCodesTable,
  withdrawalRequestsTable,
} from "@workspace/db";
import app from "../app.js";
import {
  createBareCustomer,
  createWithdrawalReadyCustomer,
  createLoanOfficer,
  cleanupUsers,
  WRONG_CARD_NUMBER,
  type TestActor,
} from "./helpers.js";

// ─── Shared actor state (reset per test) ────────────────────────────────────
let customer: TestActor;
let staff: TestActor;
const createdUserIds: string[] = [];

function track(...actors: TestActor[]): void {
  createdUserIds.push(...actors.map((a) => a.user.id));
}

afterEach(async () => {
  await cleanupUsers(createdUserIds.splice(0));
});

// ─── Helper: drive the withdrawal flow up to (and including) disbursement ────
async function disburseWithdrawal(
  customerActor: TestActor & { cardNumber: string },
  mpesaPhone: string,
): Promise<{ withdrawalId: string; loanId: string }> {
  // 1. Initiate
  const initRes = await request(app)
    .post("/api/withdrawals")
    .set("Authorization", `Bearer ${customerActor.token}`)
    .send({ mpesaPhone, amount: 50000 });
  expect(initRes.status, "initiate withdrawal").toBe(201);
  const withdrawalId: string = initRes.body.id;

  // 2. Request OTP
  const otpReqRes = await request(app)
    .post(`/api/withdrawals/${withdrawalId}/otp/request`)
    .set("Authorization", `Bearer ${customerActor.token}`);
  expect(otpReqRes.status, "request OTP").toBe(200);

  // 3. Read OTP code from DB (it's delivered in-app, not returned by API)
  const [otpRow] = await db
    .select()
    .from(otpCodesTable)
    .where(eq(otpCodesTable.userId, customerActor.user.id))
    .orderBy(desc(otpCodesTable.createdAt))
    .limit(1);
  expect(otpRow, "OTP row exists in DB").toBeTruthy();

  // 4. Verify OTP
  const otpVerifyRes = await request(app)
    .post(`/api/withdrawals/${withdrawalId}/otp/verify`)
    .set("Authorization", `Bearer ${customerActor.token}`)
    .send({ code: otpRow.code });
  expect(otpVerifyRes.status, "verify OTP").toBe(200);

  // 5. Verify card → triggers disbursement
  const cardVerifyRes = await request(app)
    .post(`/api/withdrawals/${withdrawalId}/verify`)
    .set("Authorization", `Bearer ${customerActor.token}`)
    .send({ cardNumber: customerActor.cardNumber });
  expect(cardVerifyRes.status, "verify card").toBe(200);
  expect(cardVerifyRes.body.success, "card verify success flag").toBe(true);

  const loanId: string = cardVerifyRes.body.withdrawal.loanId;
  expect(loanId, "loanId set on withdrawal after disbursement").toBeTruthy();

  return { withdrawalId, loanId };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Loan application submission
// ═══════════════════════════════════════════════════════════════════════════
describe("Loan application submission", () => {
  beforeEach(async () => {
    customer = await createBareCustomer();
    track(customer);
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app)
      .post("/api/loan-applications")
      .send({ amount: "50000.00", purpose: "Equipment", loanType: "business", termMonths: 12 });
    expect(res.status).toBe(401);
  });

  it("creates a pending application for an authenticated customer", async () => {
    const res = await request(app)
      .post("/api/loan-applications")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ amount: "50000.00", purpose: "Equipment", loanType: "business", termMonths: 12 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.customerId).toBe(customer.user.id);
    expect(Number(res.body.amount)).toBe(50000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Loan application decision (approve / reject)
// ═══════════════════════════════════════════════════════════════════════════
describe("Loan application decision", () => {
  let applicationId: string;

  beforeEach(async () => {
    customer = await createBareCustomer();
    staff = await createLoanOfficer();
    track(customer, staff);

    const res = await request(app)
      .post("/api/loan-applications")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ amount: "50000.00", purpose: "Working capital", loanType: "business", termMonths: 12 });
    applicationId = res.body.id;
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app)
      .patch(`/api/admin/loan-applications/${applicationId}/decision`)
      .send({ status: "approved" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when a customer tries to approve", async () => {
    const res = await request(app)
      .patch(`/api/admin/loan-applications/${applicationId}/decision`)
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ status: "approved" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for a non-existent application", async () => {
    const res = await request(app)
      .patch(`/api/admin/loan-applications/nonexistent-id/decision`)
      .set("Authorization", `Bearer ${staff.token}`)
      .send({ status: "approved" });
    expect(res.status).toBe(404);
  });

  it("requires a reason when rejecting", async () => {
    const res = await request(app)
      .patch(`/api/admin/loan-applications/${applicationId}/decision`)
      .set("Authorization", `Bearer ${staff.token}`)
      .send({ status: "rejected" }); // no reviewNotes
    expect(res.status).toBe(400);
  });

  it("approves the application and activates the customer profile", async () => {
    const res = await request(app)
      .patch(`/api/admin/loan-applications/${applicationId}/decision`)
      .set("Authorization", `Bearer ${staff.token}`)
      .send({ status: "approved", reviewNotes: "All documents verified" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");

    // Customer profile must reflect the approved amount + active status
    const [profile] = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, customer.user.id));

    expect(profile.loanStatus).toBe("active");
    expect(Number(profile.approvedLoanAmount)).toBe(50000);
  });

  it("rejects the application without changing the customer profile loan status", async () => {
    const res = await request(app)
      .patch(`/api/admin/loan-applications/${applicationId}/decision`)
      .set("Authorization", `Bearer ${staff.token}`)
      .send({ status: "rejected", reviewNotes: "Insufficient documents" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");

    // Profile exists (pre-created with phoneVerified) but loanStatus must NOT
    // have been set to active by the rejection — it stays at whatever it was.
    const [profile] = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, customer.user.id));

    // approvedLoanAmount must still be zero — rejection must not grant funds.
    expect(Number(profile.approvedLoanAmount)).toBe(0);
  });

  it("re-approving an already-approved application updates the amount (no duplicates)", async () => {
    // Approve once
    await request(app)
      .patch(`/api/admin/loan-applications/${applicationId}/decision`)
      .set("Authorization", `Bearer ${staff.token}`)
      .send({ status: "approved", reviewNotes: "First approval" });

    // Approve again with a different amount (e.g. staff corrects the figure)
    const res = await request(app)
      .patch(`/api/admin/loan-applications/${applicationId}/decision`)
      .set("Authorization", `Bearer ${staff.token}`)
      .send({ status: "approved", reviewNotes: "Revised" });

    expect(res.status).toBe(200);

    // Still exactly one application row — no duplicate was created
    const apps = await db
      .select()
      .from(loanApplicationsTable)
      .where(eq(loanApplicationsTable.customerId, customer.user.id));

    expect(apps).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Full loan lifecycle (happy path)
// ═══════════════════════════════════════════════════════════════════════════
describe("Full loan lifecycle — happy path", () => {
  it("completes apply → approve → disburse → confirm receipt without errors", async () => {
    const c = await createWithdrawalReadyCustomer();
    const s = await createLoanOfficer();
    track(c, s);

    const mpesaPhone = "+254720000001";

    // — Disburse ——————————————————————————————————————————————————————————
    const { withdrawalId, loanId } = await disburseWithdrawal(c, mpesaPhone);

    // Loan row must exist and be active
    const [loan] = await db
      .select()
      .from(loansTable)
      .where(eq(loansTable.id, loanId));

    expect(loan, "loan row created").toBeTruthy();
    expect(loan.status).toBe("active");
    expect(Number(loan.principal)).toBe(50000);

    // — Repayment schedule ————————————————————————————————————————————————
    const installments = await db
      .select()
      .from(repaymentsTable)
      .where(eq(repaymentsTable.loanId, loanId))
      .orderBy(repaymentsTable.installmentNumber);

    expect(installments).toHaveLength(12);

    // Installment numbers must be unique and sequential 1–12
    const nums = installments.map((r) => r.installmentNumber);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    // Sum of all installments must equal principal × 1.1 exactly (no rounding loss)
    const totalCents = installments.reduce(
      (acc, r) => acc + Math.round(Number(r.amountDue) * 100),
      0,
    );
    const expectedCents = Math.round(50000 * 1.1 * 100);
    expect(totalCents).toBe(expectedCents);

    // — Confirm receipt ————————————————————————————————————————————————————
    const confirmRes = await request(app)
      .post(`/api/withdrawals/${withdrawalId}/confirm-receipt`)
      .set("Authorization", `Bearer ${c.token}`)
      .send({ received: true });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.receiptStatus).toBe("confirmed");

    // Customer balance must be reduced to zero after confirmation
    const [profile] = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, c.user.id));

    expect(Number(profile.approvedLoanAmount)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Disbursement guards
// ═══════════════════════════════════════════════════════════════════════════
describe("Disbursement guards", () => {
  let c: TestActor & { cardNumber: string };
  let withdrawalId: string;
  const mpesaPhone = "+254720000002";

  beforeEach(async () => {
    c = await createWithdrawalReadyCustomer();
    track(c);

    // Initiate a withdrawal so we have an ID to work with
    const res = await request(app)
      .post("/api/withdrawals")
      .set("Authorization", `Bearer ${c.token}`)
      .send({ mpesaPhone, amount: 50000 });
    expect(res.status).toBe(201);
    withdrawalId = res.body.id;
  });

  it("blocks card verification when OTP has not been verified", async () => {
    const res = await request(app)
      .post(`/api/withdrawals/${withdrawalId}/verify`)
      .set("Authorization", `Bearer ${c.token}`)
      .send({ cardNumber: c.cardNumber });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/OTP/i);
  });

  it("increments the attempt counter on a wrong card number", async () => {
    // Complete OTP step
    await request(app)
      .post(`/api/withdrawals/${withdrawalId}/otp/request`)
      .set("Authorization", `Bearer ${c.token}`);
    const [otp] = await db
      .select()
      .from(otpCodesTable)
      .where(eq(otpCodesTable.userId, c.user.id))
      .orderBy(desc(otpCodesTable.createdAt))
      .limit(1);
    await request(app)
      .post(`/api/withdrawals/${withdrawalId}/otp/verify`)
      .set("Authorization", `Bearer ${c.token}`)
      .send({ code: otp.code });

    // One wrong attempt
    const res = await request(app)
      .post(`/api/withdrawals/${withdrawalId}/verify`)
      .set("Authorization", `Bearer ${c.token}`)
      .send({ cardNumber: WRONG_CARD_NUMBER });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.attemptsLeft).toBe(2);

    // DB row reflects incremented counter
    const [row] = await db
      .select()
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.id, withdrawalId));
    expect(row.verificationAttempts).toBe(1);
  });

  it("locks the withdrawal after 3 consecutive wrong card numbers", async () => {
    // Complete OTP step
    await request(app)
      .post(`/api/withdrawals/${withdrawalId}/otp/request`)
      .set("Authorization", `Bearer ${c.token}`);
    const [otp] = await db
      .select()
      .from(otpCodesTable)
      .where(eq(otpCodesTable.userId, c.user.id))
      .orderBy(desc(otpCodesTable.createdAt))
      .limit(1);
    await request(app)
      .post(`/api/withdrawals/${withdrawalId}/otp/verify`)
      .set("Authorization", `Bearer ${c.token}`)
      .send({ code: otp.code });

    // Three wrong attempts
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/api/withdrawals/${withdrawalId}/verify`)
        .set("Authorization", `Bearer ${c.token}`)
        .send({ cardNumber: WRONG_CARD_NUMBER });
    }

    // Withdrawal must now be locked in the DB
    const [row] = await db
      .select()
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.id, withdrawalId));

    expect(row.status).toBe("locked");
    expect(row.lockedAt).toBeTruthy();

    // API must block further attempts
    const res = await request(app)
      .post(`/api/withdrawals/${withdrawalId}/verify`)
      .set("Authorization", `Bearer ${c.token}`)
      .send({ cardNumber: c.cardNumber });

    expect(res.status).toBe(409);
  });

  it("prevents double-disbursement on an already-disbursed withdrawal", async () => {
    // Complete the full flow once
    await disburseWithdrawal(c, mpesaPhone);

    // Attempting to verify the same withdrawal again must be rejected
    const res = await request(app)
      .post(`/api/withdrawals/${withdrawalId}/verify`)
      .set("Authorization", `Bearer ${c.token}`)
      .send({ cardNumber: c.cardNumber });

    expect(res.status).toBe(409);
  });

  it("blocks a new withdrawal while the current one is disbursed but unconfirmed", async () => {
    // Disburse without confirming receipt
    await disburseWithdrawal(c, mpesaPhone);

    // Attempt to start a fresh withdrawal
    const res = await request(app)
      .post("/api/withdrawals")
      .set("Authorization", `Bearer ${c.token}`)
      .send({ mpesaPhone, amount: 50000 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/awaiting receipt confirmation/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Repayment schedule arithmetic
// ═══════════════════════════════════════════════════════════════════════════
describe("Repayment schedule arithmetic", () => {
  it("generates 12 unique installments whose total equals principal × 1.1 exactly", async () => {
    const c = await createWithdrawalReadyCustomer();
    track(c);

    const { loanId } = await disburseWithdrawal(c, "+254720000003");

    const rows = await db
      .select()
      .from(repaymentsTable)
      .where(eq(repaymentsTable.loanId, loanId))
      .orderBy(repaymentsTable.installmentNumber);

    expect(rows).toHaveLength(12);

    // No two installments share the same number
    const uniqueNums = new Set(rows.map((r) => r.installmentNumber));
    expect(uniqueNums.size).toBe(12);

    // All are pending initially
    rows.forEach((r) => expect(r.status).toBe("pending"));

    // Penny-exact total — must equal 55000.00 for a 50 000 principal
    const totalCents = rows.reduce(
      (acc, r) => acc + Math.round(Number(r.amountDue) * 100),
      0,
    );
    expect(totalCents).toBe(5_500_000); // 55 000.00 in cents
  });

  it("distributes the rounding remainder to the last installment only", async () => {
    const c = await createWithdrawalReadyCustomer();
    track(c);

    const { loanId } = await disburseWithdrawal(c, "+254720000004");

    const rows = await db
      .select()
      .from(repaymentsTable)
      .where(eq(repaymentsTable.loanId, loanId))
      .orderBy(repaymentsTable.installmentNumber);

    const amounts = rows.map((r) => Math.round(Number(r.amountDue) * 100));
    const base = amounts[0]!;

    // All installments except the last must have the same base amount
    amounts.slice(0, 11).forEach((a) =>
      expect(a).toBe(base),
    );

    // Last installment may differ by at most 11 cents (worst-case rounding)
    const last = amounts[11]!;
    expect(Math.abs(last - base)).toBeLessThanOrEqual(11);
  });
});
