import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  virtualCardsTable,
  usersTable,
  auditLogsTable,
  notificationsTable,
} from "@workspace/db";
import {
  ListMyVirtualCardsResponse,
  CreateVirtualCardBody,
  CreateVirtualCardResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/** Mask a card number, showing only the last 4 digits: e.g. "•••• •••• •••• 1234" */
function maskCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `•••• •••• •••• ${last4}`;
}

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

/**
 * GET /virtual-cards/mine
 * Returns all virtual cards submitted by the authenticated customer, newest first.
 */
router.get("/virtual-cards/mine", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

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
    })
    .from(virtualCardsTable)
    .where(eq(virtualCardsTable.customerId, req.user!.id))
    .orderBy(desc(virtualCardsTable.createdAt));

  const masked = cards.map((c) => ({ ...c, cardNumber: maskCardNumber(c.cardNumber) }));
  res.json(ListMyVirtualCardsResponse.parse(masked));
});

/**
 * POST /virtual-cards
 * Customer submits a virtual card for admin approval.
 */
router.post("/virtual-cards", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const parsed = CreateVirtualCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [card] = await db
    .insert(virtualCardsTable)
    .values({ ...parsed.data, customerId: req.user!.id })
    .returning();

  await db.insert(auditLogsTable).values({
    userId: req.user!.id,
    action: "virtual_card.submitted",
    entityType: "virtual_card",
    entityId: card.id,
    details: null,
  });

  const { adminNote: _omit, ...cardForCustomer } = card;
  res.status(201).json(CreateVirtualCardResponse.parse({ ...cardForCustomer, cardNumber: maskCardNumber(card.cardNumber) }));
});

export default router;
