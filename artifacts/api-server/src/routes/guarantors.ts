import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, guarantorsTable, usersTable, auditLogsTable } from "@workspace/db";
import {
  GetCustomerGuarantorParams,
  UpsertGuarantorBody,
  UpsertGuarantorResponse,
  DeleteGuarantorParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (req.user!.accountStatus === "suspended") { res.status(403).json({ error: "Account suspended" }); return false; }
  return true;
}

async function requireStaff(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return false; }
  const role = req.user!.role;
  if (role !== "super_admin" && role !== "loan_officer") { res.status(403).json({ error: "Forbidden" }); return false; }
  if (req.user!.accountStatus === "suspended") { res.status(403).json({ error: "Account suspended" }); return false; }
  return true;
}

/**
 * GET /my/guarantor
 * Customer fetches their own company guarantor record.
 */
router.get("/my/guarantor", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const [guarantor] = await db
    .select()
    .from(guarantorsTable)
    .where(eq(guarantorsTable.customerId, req.user!.id));

  if (!guarantor) {
    res.status(404).json({ error: "No guarantor assigned yet." });
    return;
  }
  res.json(guarantor);
});

/**
 * GET /admin/customers/:id/guarantor
 * Staff fetches the company guarantor for a specific customer.
 */
router.get(
  "/admin/customers/:id/guarantor",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const params = GetCustomerGuarantorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const [guarantor] = await db
      .select()
      .from(guarantorsTable)
      .where(eq(guarantorsTable.customerId, params.data.id));

    if (!guarantor) {
      res.status(404).json({ error: "No guarantor assigned to this customer." });
      return;
    }
    res.json(guarantor);
  },
);

/**
 * PUT /admin/customers/:id/guarantor
 * Staff creates or updates the company guarantor for a customer (upsert).
 */
router.put(
  "/admin/customers/:id/guarantor",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const params = GetCustomerGuarantorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const parsed = UpsertGuarantorBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    // Confirm customer exists
    const [customer] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, params.data.id), eq(usersTable.role, "customer")));
    if (!customer) { res.status(404).json({ error: "Customer not found." }); return; }

    const [guarantor] = await db
      .insert(guarantorsTable)
      .values({
        customerId: params.data.id,
        companyName: parsed.data.companyName,
        companyRegistration: parsed.data.companyRegistration ?? null,
        contactPerson: parsed.data.contactPerson ?? null,
        phone: parsed.data.phone ?? null,
        address: parsed.data.address ?? null,
        addedBy: req.user!.id,
      })
      .onConflictDoUpdate({
        target: guarantorsTable.customerId,
        set: {
          companyName: parsed.data.companyName,
          companyRegistration: parsed.data.companyRegistration ?? null,
          contactPerson: parsed.data.contactPerson ?? null,
          phone: parsed.data.phone ?? null,
          address: parsed.data.address ?? null,
          addedBy: req.user!.id,
          updatedAt: new Date(),
        },
      })
      .returning();

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "guarantor.upserted",
      entityType: "guarantor",
      entityId: guarantor.id,
      details: `customer=${params.data.id}, company=${parsed.data.companyName}`,
    });

    res.json(UpsertGuarantorResponse.parse(guarantor));
  },
);

/**
 * DELETE /admin/customers/:id/guarantor
 * Staff removes the company guarantor from a customer.
 */
router.delete(
  "/admin/customers/:id/guarantor",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireStaff(req, res))) return;

    const params = DeleteGuarantorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const deleted = await db
      .delete(guarantorsTable)
      .where(eq(guarantorsTable.customerId, params.data.id))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "No guarantor found for this customer." });
      return;
    }

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "guarantor.deleted",
      entityType: "guarantor",
      entityId: deleted[0].id,
      details: `customer=${params.data.id}`,
    });

    res.json({ success: true });
  },
);

export default router;
