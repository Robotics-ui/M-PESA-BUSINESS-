import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  violationsTable,
  notificationsTable,
  auditLogsTable,
  usersTable,
} from "@workspace/db";
import {
  ListMyViolationsResponse,
  ListCustomerViolationsParams,
  ListCustomerViolationsResponse,
  IssueViolationParams,
  IssueViolationBody,
  IssueViolationResponse,
  AcknowledgeViolationParams,
  AcknowledgeViolationResponse,
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
 * GET /violations/mine
 * Customer views their own violations and warnings.
 */
router.get("/violations/mine", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const rows = await db
    .select({
      id: violationsTable.id,
      customerId: violationsTable.customerId,
      issuedBy: violationsTable.issuedBy,
      issuedByName: usersTable.firstName,
      type: violationsTable.type,
      reason: violationsTable.reason,
      acknowledged: violationsTable.acknowledged,
      createdAt: violationsTable.createdAt,
    })
    .from(violationsTable)
    .leftJoin(usersTable, eq(usersTable.id, violationsTable.issuedBy))
    .where(eq(violationsTable.customerId, req.user!.id))
    .orderBy(desc(violationsTable.createdAt));

  res.json(ListMyViolationsResponse.parse(rows.map((r) => ({ ...r, issuedByName: r.issuedByName ?? null }))));
});

/**
 * POST /violations/:id/acknowledge
 * Customer acknowledges a violation so it stops appearing as a new alert.
 */
router.post(
  "/violations/:id/acknowledge",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const params = AcknowledgeViolationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [violation] = await db
      .update(violationsTable)
      .set({ acknowledged: true })
      .where(
        and(
          eq(violationsTable.id, params.data.id),
          eq(violationsTable.customerId, req.user!.id),
        ),
      )
      .returning();

    if (!violation) {
      res.status(404).json({ error: "Violation not found." });
      return;
    }

    res.json(AcknowledgeViolationResponse.parse({ id: violation.id, acknowledged: violation.acknowledged }));
  },
);

/**
 * GET /admin/customers/:id/violations
 * Staff lists all violations issued to a specific customer.
 */
router.get(
  "/admin/customers/:id/violations",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;

    const params = ListCustomerViolationsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const rows = await db
      .select({
        id: violationsTable.id,
        customerId: violationsTable.customerId,
        issuedBy: violationsTable.issuedBy,
        issuedByName: usersTable.firstName,
        type: violationsTable.type,
        reason: violationsTable.reason,
        acknowledged: violationsTable.acknowledged,
        createdAt: violationsTable.createdAt,
      })
      .from(violationsTable)
      .leftJoin(usersTable, eq(usersTable.id, violationsTable.issuedBy))
      .where(eq(violationsTable.customerId, params.data.id))
      .orderBy(desc(violationsTable.createdAt));

    res.json(ListCustomerViolationsResponse.parse(rows.map((r) => ({ ...r, issuedByName: r.issuedByName ?? null }))));
  },
);

/**
 * POST /admin/customers/:id/violations
 * Staff issues a formal warning or violation notice to a customer.
 */
router.post(
  "/admin/customers/:id/violations",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;

    const params = IssueViolationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = IssueViolationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [violation] = await db
      .insert(violationsTable)
      .values({
        customerId: params.data.id,
        issuedBy: req.user!.id,
        type: parsed.data.type,
        reason: parsed.data.reason,
      })
      .returning();

    // Notify the customer in-app
    await db.insert(notificationsTable).values({
      userId: params.data.id,
      channel: "in_app",
      title: parsed.data.type === "violation" ? "Policy violation notice" : "Account warning",
      message: parsed.data.reason,
      status: "sent",
    });

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: `violation.${parsed.data.type}_issued`,
      entityType: "violation",
      entityId: violation.id,
      details: `customerId=${params.data.id}`,
    });

    // Return with issuer name
    const [issuer] = await db
      .select({ firstName: usersTable.firstName })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));

    res.status(201).json(
      IssueViolationResponse.parse({
        ...violation,
        issuedByName: issuer?.firstName ?? null,
      }),
    );
  },
);

export default router;
