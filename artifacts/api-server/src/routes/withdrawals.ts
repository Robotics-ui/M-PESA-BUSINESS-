import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  withdrawalRequestsTable,
  virtualCardsTable,
  customerProfilesTable,
  loanApplicationsTable,
  loansTable,
  repaymentsTable,
  auditLogsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import {
  ListMyWithdrawalsResponse,
  InitiateWithdrawalResponse,
  VerifyWithdrawalCardParams,
  VerifyWithdrawalCardBody,
  VerifyWithdrawalCardResponse,
  ListAllWithdrawalsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const MAX_VERIFY_ATTEMPTS = 3;

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user!.accountStatus === "suspended") {
    res.status(403).json({ error: "Account suspended" });
    return false;
  }
  return true;
}

function requireStaff(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const role = req.user!.role;
  if (role !== "super_admin" && role !== "loan_officer") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

/**
 * GET /withdrawals
 * List withdrawal requests for the authenticated customer.
 */
router.get("/withdrawals", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const withdrawals = await db
    .select()
    .from(withdrawalRequestsTable)
    .where(eq(withdrawalRequestsTable.customerId, req.user!.id))
    .orderBy(desc(withdrawalRequestsTable.createdAt));

  res.json(ListMyWithdrawalsResponse.parse(withdrawals));
});

/**
 * POST /withdrawals
 * Initiate a loan withdrawal. Checks eligibility, returns existing
 * pending_verification request if one already exists, otherwise creates a new
 * one. Blocks initiation if the most-recent request is locked.
 */
router.post("/withdrawals", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const userId = req.user!.id;

  // 1. Verify customer profile eligibility
  const [profile] = await db
    .select()
    .from(customerProfilesTable)
    .where(eq(customerProfilesTable.userId, userId));

  if (!profile || profile.loanStatus !== "active") {
    res.status(409).json({ error: "Loan is not active. Contact support." });
    return;
  }

  const approvedAmount = Number(profile.approvedLoanAmount ?? "0");
  if (approvedAmount <= 0) {
    res.status(409).json({ error: "No approved loan amount set by admin." });
    return;
  }

  if (!profile.phone || !profile.phoneVerified) {
    res.status(409).json({
      error: "Your phone number must be verified before withdrawing.",
    });
    return;
  }

  // 2. Get most-recent approved virtual card
  const [card] = await db
    .select()
    .from(virtualCardsTable)
    .where(
      and(
        eq(virtualCardsTable.customerId, userId),
        eq(virtualCardsTable.status, "approved"),
      ),
    )
    .orderBy(desc(virtualCardsTable.createdAt))
    .limit(1);

  if (!card) {
    res.status(409).json({ error: "No approved virtual card found." });
    return;
  }

  // 3. Check the most-recent withdrawal request for this customer
  const [latest] = await db
    .select()
    .from(withdrawalRequestsTable)
    .where(eq(withdrawalRequestsTable.customerId, userId))
    .orderBy(desc(withdrawalRequestsTable.createdAt))
    .limit(1);

  if (latest) {
    if (latest.status === "locked") {
      res.status(409).json({
        error:
          "Your withdrawal is locked due to too many failed card verification attempts. Please contact support to unlock it.",
      });
      return;
    }
    if (latest.status === "pending_verification") {
      // Return the existing in-progress request
      res.status(201).json(InitiateWithdrawalResponse.parse(latest));
      return;
    }
  }

  // 4. Create new withdrawal request
  const [withdrawal] = await db
    .insert(withdrawalRequestsTable)
    .values({
      customerId: userId,
      amount: profile.approvedLoanAmount,
      mpesaPhone: profile.phone,
      virtualCardId: card.id,
      status: "pending_verification",
      verificationAttempts: 0,
    })
    .returning();

  await db.insert(auditLogsTable).values({
    userId,
    action: "withdrawal.initiated",
    entityType: "withdrawal_request",
    entityId: withdrawal.id,
    details: `amount=${profile.approvedLoanAmount}`,
  });

  res.status(201).json(InitiateWithdrawalResponse.parse(withdrawal));
});

/**
 * POST /withdrawals/:id/verify
 * Verify the virtual card number.
 *
 * On match: atomically claim the disbursement slot, then create loan +
 * repayment records inside a transaction. On mismatch: increment attempt
 * counter and lock after MAX_VERIFY_ATTEMPTS failures.
 */
router.post(
  "/withdrawals/:id/verify",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const params = VerifyWithdrawalCardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = VerifyWithdrawalCardBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [withdrawal] = await db
      .select()
      .from(withdrawalRequestsTable)
      .where(
        and(
          eq(withdrawalRequestsTable.id, params.data.id),
          eq(withdrawalRequestsTable.customerId, req.user!.id),
        ),
      );

    if (!withdrawal) {
      res.status(404).json({ error: "Withdrawal request not found." });
      return;
    }

    if (withdrawal.status !== "pending_verification") {
      res
        .status(409)
        .json({ error: `Withdrawal is already ${withdrawal.status}.` });
      return;
    }

    // Re-validate that the linked virtual card is still approved
    const [card] = await db
      .select()
      .from(virtualCardsTable)
      .where(eq(virtualCardsTable.id, withdrawal.virtualCardId));

    if (!card || card.status !== "approved") {
      res.status(409).json({
        error:
          "The virtual card associated with this withdrawal is no longer approved. Please contact support.",
      });
      return;
    }

    // Compare card numbers (strip spaces)
    const submitted = parsed.data.cardNumber.replace(/\s+/g, "");
    const actual = card.cardNumber.replace(/\s+/g, "");
    const match = submitted === actual;
    const newAttempts = withdrawal.verificationAttempts + 1;

    if (match) {
      // ── Atomically disburse ────────────────────────────────────────────────
      let updatedWithdrawal: typeof withdrawal;
      let loanId: string;

      try {
        await db.transaction(async (tx) => {
          // Conditional update: only proceed if still pending_verification.
          // This is the race-condition guard — whichever request wins the
          // UPDATE first is the one that disburses.
          const [claimed] = await tx
            .update(withdrawalRequestsTable)
            .set({ status: "disbursed", verificationAttempts: newAttempts })
            .where(
              and(
                eq(withdrawalRequestsTable.id, withdrawal.id),
                eq(withdrawalRequestsTable.status, "pending_verification"),
              ),
            )
            .returning();

          if (!claimed) {
            throw new Error("ALREADY_PROCESSED");
          }

          updatedWithdrawal = claimed;

          // Create an auto-approved loan application for audit trail
          const [application] = await tx
            .insert(loanApplicationsTable)
            .values({
              customerId: req.user!.id,
              amount: withdrawal.amount,
              purpose: "Loan withdrawal (auto-approved)",
              loanType: "business",
              termMonths: 12,
              status: "approved",
              reviewedBy: req.user!.id,
              reviewedAt: new Date(),
              reviewNotes: "Auto-approved on successful virtual card verification.",
            })
            .returning();

          // Due date = 12 months from today
          const dueDate = new Date();
          dueDate.setMonth(dueDate.getMonth() + 12);

          const [loan] = await tx
            .insert(loansTable)
            .values({
              applicationId: application.id,
              customerId: req.user!.id,
              principal: withdrawal.amount,
              interestRate: "10.00",
              termMonths: 12,
              status: "active",
              disbursedAt: new Date(),
              dueDate: dueDate.toISOString().split("T")[0],
            })
            .returning();

          loanId = loan.id;

          // Update withdrawal with loanId
          await tx
            .update(withdrawalRequestsTable)
            .set({ loanId: loan.id })
            .where(eq(withdrawalRequestsTable.id, withdrawal.id));

          // Generate monthly repayment schedule (10% flat interest)
          const principal = Number(withdrawal.amount);
          const total = principal * 1.1;
          const monthly = (total / 12).toFixed(2);
          const repayments = Array.from({ length: 12 }, (_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() + i + 1);
            return {
              loanId: loan.id,
              installmentNumber: i + 1,
              amountDue: monthly,
              dueDate: d.toISOString().split("T")[0],
              status: "pending" as const,
            };
          });
          await tx.insert(repaymentsTable).values(repayments);
        });
      } catch (err: any) {
        if (err?.message === "ALREADY_PROCESSED") {
          res.status(409).json({ error: "Withdrawal is already being processed." });
          return;
        }
        throw err;
      }

      // Post-transaction: notifications and audit (non-critical, outside tx)
      await Promise.all([
        db.insert(notificationsTable).values({
          userId: req.user!.id,
          channel: "in_app",
          title: "Loan disbursed",
          message: `KSh ${Number(withdrawal.amount).toLocaleString("en-KE")} has been sent to ${withdrawal.mpesaPhone}. Your first repayment is due in 30 days.`,
          status: "sent",
        }),
        db.insert(auditLogsTable).values({
          userId: req.user!.id,
          action: "withdrawal.disbursed",
          entityType: "withdrawal_request",
          entityId: withdrawal.id,
          details: `loan_id=${loanId!}`,
        }),
      ]);

      // Fetch the final state (with loanId set) to return in response
      const [finalWithdrawal] = await db
        .select()
        .from(withdrawalRequestsTable)
        .where(eq(withdrawalRequestsTable.id, withdrawal.id));

      res.json(
        VerifyWithdrawalCardResponse.parse({
          success: true,
          message: "Verification successful. Your loan has been disbursed.",
          attemptsLeft: MAX_VERIFY_ATTEMPTS - newAttempts,
          withdrawal: finalWithdrawal,
        }),
      );
      return;
    }

    // ── Verification failed ──────────────────────────────────────────────────
    const attemptsLeft = MAX_VERIFY_ATTEMPTS - newAttempts;

    if (newAttempts >= MAX_VERIFY_ATTEMPTS) {
      const [locked] = await db
        .update(withdrawalRequestsTable)
        .set({
          status: "locked",
          verificationAttempts: newAttempts,
          lockedAt: new Date(),
        })
        .where(
          and(
            eq(withdrawalRequestsTable.id, withdrawal.id),
            eq(withdrawalRequestsTable.status, "pending_verification"),
          ),
        )
        .returning();

      await db.insert(auditLogsTable).values({
        userId: req.user!.id,
        action: "withdrawal.locked",
        entityType: "withdrawal_request",
        entityId: withdrawal.id,
        details: `Too many failed card verification attempts (${newAttempts})`,
      });

      res.json(
        VerifyWithdrawalCardResponse.parse({
          success: false,
          message:
            "Card verification failed too many times. Your withdrawal has been locked — please contact support.",
          attemptsLeft: 0,
          withdrawal: locked ?? withdrawal,
        }),
      );
      return;
    }

    const [updated] = await db
      .update(withdrawalRequestsTable)
      .set({ verificationAttempts: newAttempts })
      .where(
        and(
          eq(withdrawalRequestsTable.id, withdrawal.id),
          eq(withdrawalRequestsTable.status, "pending_verification"),
        ),
      )
      .returning();

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "withdrawal.verify_failed",
      entityType: "withdrawal_request",
      entityId: withdrawal.id,
      details: `attempt=${newAttempts}`,
    });

    res.json(
      VerifyWithdrawalCardResponse.parse({
        success: false,
        message: `Card number does not match. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`,
        attemptsLeft,
        withdrawal: updated ?? withdrawal,
      }),
    );
  },
);

/**
 * GET /admin/withdrawals
 * List all withdrawal requests (staff only).
 */
router.get(
  "/admin/withdrawals",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;

    const withdrawals = await db
      .select({
        id: withdrawalRequestsTable.id,
        customerId: withdrawalRequestsTable.customerId,
        amount: withdrawalRequestsTable.amount,
        mpesaPhone: withdrawalRequestsTable.mpesaPhone,
        virtualCardId: withdrawalRequestsTable.virtualCardId,
        status: withdrawalRequestsTable.status,
        verificationAttempts: withdrawalRequestsTable.verificationAttempts,
        loanId: withdrawalRequestsTable.loanId,
        lockedAt: withdrawalRequestsTable.lockedAt,
        createdAt: withdrawalRequestsTable.createdAt,
        customerName: sql<string>`concat(coalesce(${usersTable.firstName},''), ' ', coalesce(${usersTable.lastName},''))`,
        customerEmail: usersTable.email,
      })
      .from(withdrawalRequestsTable)
      .innerJoin(usersTable, eq(withdrawalRequestsTable.customerId, usersTable.id))
      .orderBy(desc(withdrawalRequestsTable.createdAt));

    res.json(ListAllWithdrawalsResponse.parse(withdrawals));
  },
);

export default router;
