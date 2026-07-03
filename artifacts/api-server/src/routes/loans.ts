import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  loanApplicationsTable,
  loansTable,
  repaymentsTable,
  auditLogsTable,
} from "@workspace/db";
import {
  CreateLoanApplicationBody,
  CreateLoanApplicationResponse,
  ListMyLoanApplicationsResponse,
  GetMyLoanApplicationParams,
  GetMyLoanApplicationResponse,
  ListMyLoansResponse,
  GetLoanRepaymentScheduleParams,
  GetLoanRepaymentScheduleResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

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

router.get(
  "/loan-applications",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const apps = await db
      .select()
      .from(loanApplicationsTable)
      .where(eq(loanApplicationsTable.customerId, req.user!.id))
      .orderBy(desc(loanApplicationsTable.createdAt));

    res.json(ListMyLoanApplicationsResponse.parse(apps));
  },
);

router.post(
  "/loan-applications",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = CreateLoanApplicationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [application] = await db
      .insert(loanApplicationsTable)
      .values({ ...parsed.data, customerId: req.user!.id })
      .returning();

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "loan_application.create",
      entityType: "loan_application",
      entityId: application.id,
      details: `amount=${parsed.data.amount}`,
    });

    res.status(201).json(CreateLoanApplicationResponse.parse(application));
  },
);

router.get(
  "/loan-applications/:id",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const params = GetMyLoanApplicationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [application] = await db
      .select()
      .from(loanApplicationsTable)
      .where(
        and(
          eq(loanApplicationsTable.id, params.data.id),
          eq(loanApplicationsTable.customerId, req.user!.id),
        ),
      );

    if (!application) {
      res.status(404).json({ error: "Loan application not found" });
      return;
    }

    res.json(GetMyLoanApplicationResponse.parse(application));
  },
);

router.get("/loans", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const loans = await db
    .select()
    .from(loansTable)
    .where(eq(loansTable.customerId, req.user!.id))
    .orderBy(desc(loansTable.createdAt));

  res.json(ListMyLoansResponse.parse(loans));
});

router.get(
  "/loans/:id/repayments",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const params = GetLoanRepaymentScheduleParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [loan] = await db
      .select()
      .from(loansTable)
      .where(
        and(
          eq(loansTable.id, params.data.id),
          eq(loansTable.customerId, req.user!.id),
        ),
      );

    if (!loan) {
      res.status(404).json({ error: "Loan not found" });
      return;
    }

    const repayments = await db
      .select()
      .from(repaymentsTable)
      .where(eq(repaymentsTable.loanId, loan.id))
      .orderBy(repaymentsTable.installmentNumber);

    res.json(GetLoanRepaymentScheduleResponse.parse(repayments));
  },
);

export default router;
