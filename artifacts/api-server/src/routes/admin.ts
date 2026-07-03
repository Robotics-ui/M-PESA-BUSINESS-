import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql, count } from "drizzle-orm";
import {
  db,
  usersTable,
  customerProfilesTable,
  documentsTable,
  loanApplicationsTable,
  loansTable,
  auditLogsTable,
  systemSettingsTable,
  notificationsTable,
  virtualCardsTable,
} from "@workspace/db";
import {
  GetAdminDashboardStatsResponse,
  ListCustomersResponse,
  GetCustomerDetailParams,
  GetCustomerDetailResponse,
  UpdateCustomerStatusParams,
  UpdateCustomerStatusBody,
  UpdateCustomerStatusResponse,
  ListAllLoanApplicationsResponse,
  DecideLoanApplicationParams,
  DecideLoanApplicationBody,
  DecideLoanApplicationResponse,
  EditLoanApplicationParams,
  EditLoanApplicationBody,
  EditLoanApplicationResponse,
  ListAuditLogsResponse,
  ListSystemSettingsResponse,
  UpdateSystemSettingBody,
  UpdateSystemSettingResponse,
  ListAllVirtualCardsResponse,
  DecideVirtualCardParams,
  DecideVirtualCardBody,
  DecideVirtualCardResponse,
  UpdateCustomerLoanAmountParams,
  UpdateCustomerLoanAmountBody,
  UpdateCustomerLoanAmountResponse,
  UpdateCustomerLoanStatusParams,
  UpdateCustomerLoanStatusBody,
  UpdateCustomerLoanStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function requireStaff(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user!.accountStatus === "suspended") {
    res.status(403).json({ error: "Account suspended" });
    return false;
  }
  const role = req.user!.role;
  if (role !== "super_admin" && role !== "loan_officer") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

function requireSuperAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user!.accountStatus === "suspended") {
    res.status(403).json({ error: "Account suspended" });
    return false;
  }
  if (req.user!.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

router.get(
  "/admin/dashboard/stats",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const [customerCount] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(eq(usersTable.role, "customer"));

    const [activeLoanCount] = await db
      .select({ value: count() })
      .from(loansTable)
      .where(eq(loansTable.status, "active"));

    const [pendingCount] = await db
      .select({ value: count() })
      .from(loanApplicationsTable)
      .where(eq(loanApplicationsTable.status, "pending"));

    const [disbursedSum] = await db
      .select({ value: sql<string>`coalesce(sum(${loansTable.principal}), 0)` })
      .from(loansTable);

    const [outstandingSum] = await db
      .select({
        value: sql<string>`coalesce(sum(${loansTable.principal}), 0)`,
      })
      .from(loansTable)
      .where(sql`${loansTable.status} in ('active', 'overdue')`);

    const [overdueCount] = await db
      .select({ value: count() })
      .from(loansTable)
      .where(eq(loansTable.status, "overdue"));

    const recentActivity = await db
      .select()
      .from(auditLogsTable)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(10);

    res.json(
      GetAdminDashboardStatsResponse.parse({
        totalCustomers: customerCount.value,
        activeLoans: activeLoanCount.value,
        pendingApplications: pendingCount.value,
        totalDisbursed: disbursedSum.value,
        totalOutstanding: outstandingSum.value,
        overdueRepayments: overdueCount.value,
        recentActivity,
      }),
    );
  },
);

router.get(
  "/admin/customers",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const statusFilter =
      req.query.status === "active" || req.query.status === "suspended"
        ? req.query.status
        : undefined;

    const rows = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        accountStatus: usersTable.accountStatus,
        createdAt: usersTable.createdAt,
        phone: customerProfilesTable.phone,
        phoneVerified: customerProfilesTable.phoneVerified,
        profileComplete: customerProfilesTable.profileComplete,
      })
      .from(usersTable)
      .leftJoin(
        customerProfilesTable,
        eq(customerProfilesTable.userId, usersTable.id),
      )
      .where(
        statusFilter
          ? and(eq(usersTable.role, "customer"), eq(usersTable.accountStatus, statusFilter))
          : eq(usersTable.role, "customer"),
      )
      .orderBy(desc(usersTable.createdAt));

    const customers = rows.map((r) => ({
      ...r,
      phoneVerified: r.phoneVerified ?? false,
      profileComplete: r.profileComplete ?? false,
    }));

    res.json(ListCustomersResponse.parse(customers));
  },
);

router.get(
  "/admin/customers/:id",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const params = GetCustomerDetailParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [customer] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id));

    if (!customer || customer.role !== "customer") {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const [profile] = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, customer.id));

    const documents = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.customerId, customer.id));

    const loanApplications = await db
      .select()
      .from(loanApplicationsTable)
      .where(eq(loanApplicationsTable.customerId, customer.id));

    const loans = await db
      .select()
      .from(loansTable)
      .where(eq(loansTable.customerId, customer.id));

    res.json(
      GetCustomerDetailResponse.parse({
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        accountStatus: customer.accountStatus,
        createdAt: customer.createdAt,
        phone: profile?.phone ?? null,
        phoneVerified: profile?.phoneVerified ?? false,
        profileComplete: profile?.profileComplete ?? false,
        profile: profile ?? null,
        documents,
        loanApplications,
        loans,
      }),
    );
  },
);

router.patch(
  "/admin/customers/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const params = UpdateCustomerStatusParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateCustomerStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [customer] = await db
      .update(usersTable)
      .set({ accountStatus: parsed.data.accountStatus })
      .where(
        and(eq(usersTable.id, params.data.id), eq(usersTable.role, "customer")),
      )
      .returning();

    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const [profile] = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, customer.id));

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: `customer.${parsed.data.accountStatus}`,
      entityType: "user",
      entityId: customer.id,
      details: null,
    });

    res.json(
      UpdateCustomerStatusResponse.parse({
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        accountStatus: customer.accountStatus,
        createdAt: customer.createdAt,
        phone: profile?.phone ?? null,
        phoneVerified: profile?.phoneVerified ?? false,
        profileComplete: profile?.profileComplete ?? false,
      }),
    );
  },
);

router.get(
  "/admin/loan-applications",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const statusFilter = ["pending", "approved", "rejected", "hold"].includes(
      req.query.status as string,
    )
      ? (req.query.status as "pending" | "approved" | "rejected" | "hold")
      : undefined;

    const rows = await db
      .select({
        id: loanApplicationsTable.id,
        customerId: loanApplicationsTable.customerId,
        amount: loanApplicationsTable.amount,
        purpose: loanApplicationsTable.purpose,
        loanType: loanApplicationsTable.loanType,
        termMonths: loanApplicationsTable.termMonths,
        status: loanApplicationsTable.status,
        reviewedBy: loanApplicationsTable.reviewedBy,
        reviewedAt: loanApplicationsTable.reviewedAt,
        reviewNotes: loanApplicationsTable.reviewNotes,
        createdAt: loanApplicationsTable.createdAt,
        updatedAt: loanApplicationsTable.updatedAt,
        customerName: sql<string>`concat_ws(' ', ${usersTable.firstName}, ${usersTable.lastName})`,
        customerEmail: usersTable.email,
      })
      .from(loanApplicationsTable)
      .leftJoin(usersTable, eq(usersTable.id, loanApplicationsTable.customerId))
      .where(statusFilter ? eq(loanApplicationsTable.status, statusFilter) : undefined)
      .orderBy(desc(loanApplicationsTable.createdAt));

    res.json(ListAllLoanApplicationsResponse.parse(rows));
  },
);

router.patch(
  "/admin/loan-applications/:id/decision",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const params = DecideLoanApplicationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = DecideLoanApplicationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (parsed.data.status === "rejected" && !parsed.data.reviewNotes?.trim()) {
      res.status(400).json({ error: "A reason is required when rejecting a loan application" });
      return;
    }

    const [application] = await db
      .update(loanApplicationsTable)
      .set({
        status: parsed.data.status,
        reviewNotes: parsed.data.reviewNotes?.trim() || null,
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      })
      .where(eq(loanApplicationsTable.id, params.data.id))
      .returning();

    if (!application) {
      res.status(404).json({ error: "Loan application not found" });
      return;
    }

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: `loan_application.${parsed.data.status}`,
      entityType: "loan_application",
      entityId: application.id,
      details: parsed.data.reviewNotes ?? null,
    });

    let notificationMessage = `Your loan application for ${application.amount} has been ${parsed.data.status}.`;
    if (parsed.data.status === "approved") {
      const nextStep =
        application.reviewNotes ||
        "Next step: add and verify your virtual card, then request a withdrawal to receive your funds.";
      notificationMessage = `${notificationMessage} ${nextStep}`;
    } else if (parsed.data.status === "rejected") {
      notificationMessage = `${notificationMessage} Reason: ${application.reviewNotes}`;
    }

    await db.insert(notificationsTable).values({
      userId: application.customerId,
      channel: "in_app",
      title: `Loan application ${parsed.data.status}`,
      message: notificationMessage,
      status: "sent",
    });

    // Foundation phase: approving an application does not yet disburse a
    // loan or generate a repayment schedule — that business logic is
    // intentionally out of scope for this phase.

    const [customer] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, application.customerId));

    res.json(
      DecideLoanApplicationResponse.parse({
        ...application,
        customerName: customer
          ? [customer.firstName, customer.lastName].filter(Boolean).join(" ")
          : null,
        customerEmail: customer?.email ?? null,
      }),
    );
  },
);

router.patch(
  "/admin/loan-applications/:id/edit",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const params = EditLoanApplicationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = EditLoanApplicationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(loanApplicationsTable)
      .where(eq(loanApplicationsTable.id, params.data.id));

    if (!existing) {
      res.status(404).json({ error: "Loan application not found" });
      return;
    }

    if (existing.status !== "pending" && existing.status !== "hold") {
      res.status(400).json({ error: "Only pending or on-hold applications can be edited" });
      return;
    }

    const updates: Partial<typeof loanApplicationsTable.$inferInsert> = {};
    if (parsed.data.amount !== undefined) updates.amount = parsed.data.amount;
    if (parsed.data.purpose !== undefined) updates.purpose = parsed.data.purpose;
    if (parsed.data.loanType !== undefined) updates.loanType = parsed.data.loanType;
    if (parsed.data.termMonths !== undefined) updates.termMonths = parsed.data.termMonths;

    const [application] = await db
      .update(loanApplicationsTable)
      .set(updates)
      .where(eq(loanApplicationsTable.id, params.data.id))
      .returning();

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "loan_application.edited",
      entityType: "loan_application",
      entityId: application.id,
      details: JSON.stringify(updates),
    });

    const [customer] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, application.customerId));

    res.json(
      EditLoanApplicationResponse.parse({
        ...application,
        customerName: customer
          ? [customer.firstName, customer.lastName].filter(Boolean).join(" ")
          : null,
        customerEmail: customer?.email ?? null,
      }),
    );
  },
);

router.get(
  "/admin/audit-logs",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const logs = await db
      .select()
      .from(auditLogsTable)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(100);

    res.json(ListAuditLogsResponse.parse(logs));
  },
);

router.get(
  "/admin/settings",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireSuperAdmin(req, res))) return;

    const settings = await db.select().from(systemSettingsTable);
    res.json(ListSystemSettingsResponse.parse(settings));
  },
);

router.put(
  "/admin/settings",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireSuperAdmin(req, res))) return;

    const parsed = UpdateSystemSettingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [setting] = await db
      .insert(systemSettingsTable)
      .values(parsed.data)
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value: parsed.data.value, updatedAt: new Date() },
      })
      .returning();

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "setting.update",
      entityType: "system_setting",
      entityId: setting.key,
      details: null,
    });

    res.json(UpdateSystemSettingResponse.parse(setting));
  },
);

// ─── Virtual Cards ────────────────────────────────────────────────────────

router.get(
  "/admin/virtual-cards",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;

    const statusFilter = req.query.status as string | undefined;
    const validStatuses = ["pending", "approved", "rejected"];

    const cards = await db
      .select({
        id: virtualCardsTable.id,
        customerId: virtualCardsTable.customerId,
        cardNumber: virtualCardsTable.cardNumber,
        cardHolderName: virtualCardsTable.cardHolderName,
        bank: virtualCardsTable.bank,
        status: virtualCardsTable.status,
        rejectionReason: virtualCardsTable.rejectionReason,
        approvedBy: virtualCardsTable.approvedBy,
        approvedAt: virtualCardsTable.approvedAt,
        createdAt: virtualCardsTable.createdAt,
        customerName: sql<string>`concat(coalesce(${usersTable.firstName},''), ' ', coalesce(${usersTable.lastName},''))`,
        customerEmail: usersTable.email,
      })
      .from(virtualCardsTable)
      .innerJoin(usersTable, eq(virtualCardsTable.customerId, usersTable.id))
      .where(
        statusFilter && validStatuses.includes(statusFilter)
          ? eq(virtualCardsTable.status, statusFilter as "pending" | "approved" | "rejected")
          : undefined,
      )
      .orderBy(desc(virtualCardsTable.createdAt));

    res.json(ListAllVirtualCardsResponse.parse(cards));
  },
);

router.patch(
  "/admin/virtual-cards/:id/decision",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;

    const { id } = DecideVirtualCardParams.parse(req.params);
    const parsed = DecideVirtualCardBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { status, rejectionReason } = parsed.data;
    // "request_new" is stored as "rejected" — customer must resubmit
    const storedStatus = status === "request_new" ? "rejected" : status;

    const [card] = await db
      .update(virtualCardsTable)
      .set({
        status: storedStatus,
        rejectionReason: rejectionReason ?? null,
        approvedBy: storedStatus === "approved" ? req.user!.id : null,
        approvedAt: storedStatus === "approved" ? new Date() : null,
      })
      .where(eq(virtualCardsTable.id, id))
      .returning();

    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    const notifMap: Record<string, { title: string; message: string }> = {
      approved: {
        title: "Virtual card approved",
        message: "Your virtual card has been verified. You can now withdraw your loan.",
      },
      rejected: {
        title: "Virtual card rejected",
        message: `Your virtual card was rejected.${rejectionReason ? ` Reason: ${rejectionReason}.` : ""} Please submit a new card.`,
      },
      request_new: {
        title: "New card requested",
        message: `Admin has requested you submit a new virtual card.${rejectionReason ? ` Reason: ${rejectionReason}.` : ""}`,
      },
    };

    const notif = notifMap[status];
    if (notif) {
      await db.insert(notificationsTable).values({
        userId: card.customerId,
        channel: "in_app",
        title: notif.title,
        message: notif.message,
        status: "sent",
      });
    }

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: `virtual_card.${status}`,
      entityType: "virtual_card",
      entityId: card.id,
      details: rejectionReason ?? null,
    });

    res.json(DecideVirtualCardResponse.parse(card));
  },
);

// ─── Customer Loan Amount / Status ────────────────────────────────────────

router.patch(
  "/admin/customers/:id/loan-amount",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;

    const { id } = UpdateCustomerLoanAmountParams.parse(req.params);
    const parsed = UpdateCustomerLoanAmountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Verify the target user exists and is a customer
    const [targetUser] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, id));
    if (!targetUser || targetUser.role !== "customer") {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const amount = parsed.data.approvedLoanAmount.toString();

    const [existing] = await db
      .select({ id: customerProfilesTable.id })
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, id));

    let profile;
    if (existing) {
      [profile] = await db
        .update(customerProfilesTable)
        .set({ approvedLoanAmount: amount })
        .where(eq(customerProfilesTable.userId, id))
        .returning();
    } else {
      [profile] = await db
        .insert(customerProfilesTable)
        .values({ userId: id, approvedLoanAmount: amount })
        .returning();
    }

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "customer.loan_amount_updated",
      entityType: "customer_profile",
      entityId: id,
      details: amount,
    });

    await db.insert(notificationsTable).values({
      userId: id,
      channel: "in_app",
      title: "Loan limit updated",
      message: `Your approved loan amount has been set to KSh ${Number(amount).toLocaleString()}.`,
      status: "sent",
    });

    res.json(UpdateCustomerLoanAmountResponse.parse(profile));
  },
);

router.patch(
  "/admin/customers/:id/loan-status",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;

    const { id } = UpdateCustomerLoanStatusParams.parse(req.params);
    const parsed = UpdateCustomerLoanStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Verify the target user exists and is a customer
    const [targetUser] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, id));
    if (!targetUser || targetUser.role !== "customer") {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const [profile] = await db
      .update(customerProfilesTable)
      .set({ loanStatus: parsed.data.loanStatus })
      .where(eq(customerProfilesTable.userId, id))
      .returning();

    if (!profile) {
      res.status(404).json({ error: "Customer profile not found" });
      return;
    }

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: `customer.loan_${parsed.data.loanStatus}`,
      entityType: "customer_profile",
      entityId: id,
      details: null,
    });

    const notifMap: Record<string, { title: string; message: string }> = {
      frozen: {
        title: "Loan frozen",
        message: "Your loan has been temporarily frozen. Please contact support for assistance.",
      },
      rejected: {
        title: "Loan rejected",
        message: "Your loan has been rejected. Please contact support for more information.",
      },
      active: { title: "Loan reactivated", message: "Your loan account is now active again." },
    };

    const notif = notifMap[parsed.data.loanStatus];
    if (notif) {
      await db.insert(notificationsTable).values({
        userId: id,
        channel: "in_app",
        title: notif.title,
        message: notif.message,
        status: "sent",
      });
    }

    res.json(UpdateCustomerLoanStatusResponse.parse(profile));
  },
);

export default router;
