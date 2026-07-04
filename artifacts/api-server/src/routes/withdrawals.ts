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
  otpCodesTable,
} from "@workspace/db";
import {
  ListMyWithdrawalsResponse,
  InitiateWithdrawalBody,
  InitiateWithdrawalResponse,
  RequestWithdrawalOtpResponse,
  VerifyWithdrawalOtpBody,
  VerifyWithdrawalOtpResponse,
  VerifyWithdrawalCardParams,
  VerifyWithdrawalCardBody,
  VerifyWithdrawalCardResponse,
  ListAllWithdrawalsResponse,
  UnlockWithdrawalParams,
  UnlockWithdrawalResponse,
  ConfirmWithdrawalReceiptParams,
  ConfirmWithdrawalReceiptBody,
  ConfirmWithdrawalReceiptResponse,
  ResolveWithdrawalIssueParams,
  ResolveWithdrawalIssueBody,
  ResolveWithdrawalIssueResponse,
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
  if (req.user!.accountStatus === "suspended") {
    res.status(403).json({ error: "Account suspended" });
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
 * Initiate a loan withdrawal with a Safaricom (M-Pesa) number supplied by the
 * customer. Checks eligibility, returns existing pending_verification
 * request if one already exists (updating its phone number if it changed and
 * resetting OTP verification), otherwise creates a new one. Blocks
 * initiation if the most-recent request is locked.
 */
router.post("/withdrawals", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const userId = req.user!.id;

  const parsed = InitiateWithdrawalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const mpesaPhone = parsed.data.mpesaPhone.trim();

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
      if (latest.mpesaPhone !== mpesaPhone) {
        // Phone changed — update it and reset OTP verification for this request
        const [updated] = await db
          .update(withdrawalRequestsTable)
          .set({ mpesaPhone, otpVerified: false })
          .where(eq(withdrawalRequestsTable.id, latest.id))
          .returning();
        res.status(201).json(InitiateWithdrawalResponse.parse(updated));
        return;
      }
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
      mpesaPhone,
      virtualCardId: card.id,
      status: "pending_verification",
      otpVerified: false,
      verificationAttempts: 0,
    })
    .returning();

  await db.insert(auditLogsTable).values({
    userId,
    action: "withdrawal.initiated",
    entityType: "withdrawal_request",
    entityId: withdrawal.id,
    details: `amount=${profile.approvedLoanAmount}, phone=${mpesaPhone}`,
  });

  res.status(201).json(InitiateWithdrawalResponse.parse(withdrawal));
});

/**
 * POST /withdrawals/:id/otp/request
 * Send a fresh in-app OTP code to verify the Safaricom number attached to
 * this withdrawal request.
 */
router.post(
  "/withdrawals/:id/otp/request",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const params = VerifyWithdrawalCardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
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
      res.status(409).json({ error: `Withdrawal is already ${withdrawal.status}.` });
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpCodesTable).values({
      userId: req.user!.id,
      phone: withdrawal.mpesaPhone,
      code,
      expiresAt,
    });

    await db.insert(notificationsTable).values({
      userId: req.user!.id,
      channel: "in_app",
      title: "Your withdrawal verification code",
      message: `Your verification code for withdrawing to ${withdrawal.mpesaPhone} is ${code}. It expires in 10 minutes.`,
      status: "sent",
    });

    req.log.info(
      { userId: req.user!.id, withdrawalId: withdrawal.id },
      "OTP generated for withdrawal phone verification",
    );

    res.json(
      RequestWithdrawalOtpResponse.parse({
        message: "Verification code sent — check your in-app notifications.",
      }),
    );
  },
);

/**
 * POST /withdrawals/:id/otp/verify
 * Verify the OTP code for the Safaricom number attached to this withdrawal
 * request. Must succeed before card verification can proceed.
 */
router.post(
  "/withdrawals/:id/otp/verify",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const params = VerifyWithdrawalCardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = VerifyWithdrawalOtpBody.safeParse(req.body);
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
      res.status(409).json({ error: `Withdrawal is already ${withdrawal.status}.` });
      return;
    }

    const [otp] = await db
      .select()
      .from(otpCodesTable)
      .where(
        and(
          eq(otpCodesTable.userId, req.user!.id),
          eq(otpCodesTable.phone, withdrawal.mpesaPhone),
          eq(otpCodesTable.code, parsed.data.code),
        ),
      )
      .orderBy(desc(otpCodesTable.createdAt));

    if (!otp || otp.expiresAt < new Date() || otp.verified) {
      res.status(400).json({ error: "Invalid or expired code" });
      return;
    }

    await db
      .update(otpCodesTable)
      .set({ verified: true })
      .where(eq(otpCodesTable.id, otp.id));

    const [updated] = await db
      .update(withdrawalRequestsTable)
      .set({ otpVerified: true })
      .where(eq(withdrawalRequestsTable.id, withdrawal.id))
      .returning();

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "withdrawal.otp_verified",
      entityType: "withdrawal_request",
      entityId: withdrawal.id,
      details: `phone=${withdrawal.mpesaPhone}`,
    });

    res.json(
      VerifyWithdrawalOtpResponse.parse({ verified: true, withdrawal: updated }),
    );
  },
);

/**
 * POST /withdrawals/:id/verify
 * Verify the virtual card number. Requires the withdrawal's Safaricom
 * number to have already been OTP-verified.
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

    if (!withdrawal.otpVerified) {
      res.status(409).json({
        error: "Verify your Safaricom number with the OTP code before continuing.",
      });
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

      // If loanId is already set this is a retry after an admin-approved dispute.
      // The loan already exists — skip creation and just re-disburse the transfer.
      const isRetry = withdrawal.loanId != null;

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

          if (isRetry) {
            // Loan already exists from the original disbursement — reuse it.
            loanId = withdrawal.loanId!;
          } else {
            // First-time disbursement: create loan application, loan, and repayments.
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
          }
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
 * POST /withdrawals/:id/confirm-receipt
 * Customer confirms whether they received the disbursed funds.
 * - received: true  → receiptStatus = "confirmed"
 * - received: false → receiptStatus = "not_received", issueReportedAt = now, notifies staff
 */
router.post(
  "/withdrawals/:id/confirm-receipt",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const params = ConfirmWithdrawalReceiptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = ConfirmWithdrawalReceiptBody.safeParse(req.body);
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

    if (withdrawal.status !== "disbursed") {
      res.status(409).json({ error: "Withdrawal has not been disbursed." });
      return;
    }

    if (withdrawal.receiptStatus !== "pending") {
      res.status(409).json({ error: `Receipt already ${withdrawal.receiptStatus === "confirmed" ? "confirmed" : "reported as not received"}.` });
      return;
    }

    const newReceiptStatus = parsed.data.received ? "confirmed" : "not_received";

    // Conditional update guards against concurrent requests: only proceeds if
    // receiptStatus is still "pending", preventing double-confirmation races.
    const [updated] = await db
      .update(withdrawalRequestsTable)
      .set({
        receiptStatus: newReceiptStatus,
        ...(newReceiptStatus === "not_received" ? { issueReportedAt: new Date() } : {}),
      })
      .where(
        and(
          eq(withdrawalRequestsTable.id, withdrawal.id),
          eq(withdrawalRequestsTable.receiptStatus, "pending"),
        ),
      )
      .returning();

    if (!updated) {
      res.status(409).json({ error: "Receipt confirmation was already recorded." });
      return;
    }

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: newReceiptStatus === "confirmed" ? "withdrawal.receipt_confirmed" : "withdrawal.issue_reported",
      entityType: "withdrawal_request",
      entityId: withdrawal.id,
      details: `receiptStatus=${newReceiptStatus}`,
    });

    if (newReceiptStatus === "not_received") {
      // Notify the customer their report was received
      await db.insert(notificationsTable).values({
        userId: req.user!.id,
        channel: "in_app",
        title: "Issue reported",
        message: "We've received your report that funds were not received. Our team will review and respond to your dashboard shortly.",
        status: "sent",
      });
    }

    res.json(ConfirmWithdrawalReceiptResponse.parse(updated));
  },
);

/**
 * PATCH /admin/withdrawals/:id/resolve
 * Staff resolves a customer's "funds not received" report.
 * resolution types:
 *   - "rejected"         → closes the issue; customer sees rejection reason
 *   - "new_card_required"→ asks customer to add a new virtual card
 *   - "retry"            → resets the withdrawal to pending_verification so customer can retry
 */
router.patch(
  "/admin/withdrawals/:id/resolve",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;

    const params = ResolveWithdrawalIssueParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = ResolveWithdrawalIssueBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [withdrawal] = await db
      .select()
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.id, params.data.id));

    if (!withdrawal) {
      res.status(404).json({ error: "Withdrawal request not found." });
      return;
    }

    if (withdrawal.receiptStatus !== "not_received") {
      res.status(409).json({ error: "No unresolved 'not received' issue on this withdrawal." });
      return;
    }

    if (withdrawal.resolvedAt) {
      res.status(409).json({ error: "This issue has already been resolved." });
      return;
    }

    const { resolution, reason } = parsed.data;

    // Build the update payload.
    // For "retry": reset transfer-verification state so the customer can re-attempt
    // the M-Pesa transfer, but deliberately keep loanId intact — the loan record
    // already exists and must not be duplicated. The verify handler skips loan
    // creation when loanId is already set.
    const updatePayload: Partial<typeof withdrawal> & Record<string, unknown> = {
      adminResponse: reason,
      resolutionType: resolution,
      resolvedAt: new Date(),
      resolvedBy: req.user!.id,
    };

    if (resolution === "retry") {
      updatePayload.status = "pending_verification";
      updatePayload.receiptStatus = "pending";
      updatePayload.verificationAttempts = 0;
      updatePayload.otpVerified = false;
      updatePayload.lockedAt = null;
      // loanId intentionally NOT reset — loan already exists; verify will skip re-creation
    }

    // Conditional update guard: only proceed if resolvedAt is still NULL
    const [updated] = await db
      .update(withdrawalRequestsTable)
      .set(updatePayload)
      .where(
        and(
          eq(withdrawalRequestsTable.id, withdrawal.id),
          sql`${withdrawalRequestsTable.resolvedAt} IS NULL`,
        ),
      )
      .returning();

    if (!updated) {
      res.status(409).json({ error: "This issue has already been resolved by another request." });
      return;
    }

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "withdrawal.issue_resolved",
      entityType: "withdrawal_request",
      entityId: withdrawal.id,
      details: `resolution=${resolution}`,
    });

    // Build a customer-facing notification message per resolution type
    const notifMessages: Record<string, string> = {
      rejected: `Your withdrawal dispute has been reviewed. Admin response: "${reason}"`,
      new_card_required: `Please add a new virtual card and retry your withdrawal. Admin note: "${reason}"`,
      retry: `Your withdrawal has been reset. You can now retry the withdrawal process. Admin note: "${reason}"`,
    };

    await db.insert(notificationsTable).values({
      userId: withdrawal.customerId,
      channel: "in_app",
      title: "Withdrawal dispute resolved",
      message: notifMessages[resolution] ?? reason,
      status: "sent",
    });

    res.json(ResolveWithdrawalIssueResponse.parse(updated));
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
        otpVerified: withdrawalRequestsTable.otpVerified,
        verificationAttempts: withdrawalRequestsTable.verificationAttempts,
        loanId: withdrawalRequestsTable.loanId,
        lockedAt: withdrawalRequestsTable.lockedAt,
        receiptStatus: withdrawalRequestsTable.receiptStatus,
        issueReportedAt: withdrawalRequestsTable.issueReportedAt,
        adminResponse: withdrawalRequestsTable.adminResponse,
        resolutionType: withdrawalRequestsTable.resolutionType,
        resolvedAt: withdrawalRequestsTable.resolvedAt,
        resolvedBy: withdrawalRequestsTable.resolvedBy,
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

/**
 * PATCH /admin/withdrawals/:id/unlock
 * Unlock a locked withdrawal request so the customer can retry card
 * verification (staff only). Resets the attempt counter and clears lockedAt.
 */
router.patch(
  "/admin/withdrawals/:id/unlock",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;

    const params = UnlockWithdrawalParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [withdrawal] = await db
      .select()
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.id, params.data.id));

    if (!withdrawal) {
      res.status(404).json({ error: "Withdrawal request not found." });
      return;
    }

    if (withdrawal.status !== "locked") {
      res.status(409).json({ error: `Withdrawal is not locked (status: ${withdrawal.status}).` });
      return;
    }

    const [updated] = await db
      .update(withdrawalRequestsTable)
      .set({
        status: "pending_verification",
        verificationAttempts: 0,
        lockedAt: null,
      })
      .where(eq(withdrawalRequestsTable.id, withdrawal.id))
      .returning();

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "withdrawal.unlocked",
      entityType: "withdrawal_request",
      entityId: withdrawal.id,
      details: null,
    });

    await db.insert(notificationsTable).values({
      userId: withdrawal.customerId,
      channel: "in_app",
      title: "Withdrawal unlocked",
      message: "Your withdrawal has been unlocked by our support team. You can now retry verifying your virtual card.",
      status: "sent",
    });

    res.json(UnlockWithdrawalResponse.parse(updated));
  },
);

export default router;
