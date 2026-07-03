import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  customerProfilesTable,
  documentsTable,
  otpCodesTable,
  usersTable,
  auditLogsTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  UpdateMyProfileBody,
  GetMyProfileResponse,
  UpdateMyProfileResponse,
  AddMyDocumentBody,
  AddMyDocumentResponse,
  ListMyDocumentsResponse,
  RequestPhoneOtpBody,
  RequestPhoneOtpResponse,
  VerifyPhoneOtpBody,
  VerifyPhoneOtpResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

async function trySetPrivateAcl(
  rawPath: string,
  ownerId: string,
  log: Request["log"],
): Promise<void> {
  try {
    await objectStorageService.trySetObjectEntityAclPolicy(rawPath, {
      owner: ownerId,
      visibility: "private",
    });
  } catch (err) {
    log.warn({ err, rawPath }, "Failed to set ACL on uploaded object — file may not exist yet");
  }
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

router.get("/profile", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const [profile] = await db
    .select()
    .from(customerProfilesTable)
    .where(eq(customerProfilesTable.userId, req.user!.id));

  res.json(GetMyProfileResponse.parse(profile ?? null));
});

router.put("/profile", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.user!.id;
  const [existing] = await db
    .select()
    .from(customerProfilesTable)
    .where(eq(customerProfilesTable.userId, userId));

  const values = { ...parsed.data, userId };
  const profileComplete = Boolean(
    (parsed.data.nationalIdNumber ?? existing?.nationalIdNumber) &&
      (parsed.data.idFrontUrl ?? existing?.idFrontUrl) &&
      (parsed.data.idBackUrl ?? existing?.idBackUrl) &&
      (parsed.data.selfieUrl ?? existing?.selfieUrl),
  );

  let profile;
  if (existing) {
    [profile] = await db
      .update(customerProfilesTable)
      .set({ ...values, profileComplete })
      .where(eq(customerProfilesTable.userId, userId))
      .returning();
  } else {
    [profile] = await db
      .insert(customerProfilesTable)
      .values({ ...values, profileComplete })
      .returning();
  }

  await db.insert(auditLogsTable).values({
    userId,
    action: "profile.update",
    entityType: "customer_profile",
    entityId: profile.id,
    details: null,
  });

  // Set ownership ACL on any newly uploaded private object URLs
  const urlFields = [parsed.data.idFrontUrl, parsed.data.idBackUrl, parsed.data.selfieUrl];
  await Promise.all(
    urlFields
      .filter((url): url is string => !!url)
      .map((url) => trySetPrivateAcl(url, userId, req.log)),
  );

  res.json(UpdateMyProfileResponse.parse(profile));
});

router.get(
  "/profile/documents",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const docs = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.customerId, req.user!.id))
      .orderBy(desc(documentsTable.uploadedAt));

    res.json(ListMyDocumentsResponse.parse(docs));
  },
);

router.post(
  "/profile/documents",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = AddMyDocumentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [doc] = await db
      .insert(documentsTable)
      .values({ ...parsed.data, customerId: req.user!.id })
      .returning();

    await db.insert(auditLogsTable).values({
      userId: req.user!.id,
      action: "document.upload",
      entityType: "document",
      entityId: doc.id,
      details: parsed.data.type,
    });

    // Set ownership ACL on the uploaded document object
    await trySetPrivateAcl(parsed.data.fileUrl, req.user!.id, req.log);

    res.status(201).json(AddMyDocumentResponse.parse(doc));
  },
);

router.post(
  "/profile/otp/request",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = RequestPhoneOtpBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpCodesTable).values({
      userId: req.user!.id,
      phone: parsed.data.phone,
      code,
      expiresAt,
    });

    req.log.info({ userId: req.user!.id }, "OTP generated for phone verification");

    // Foundation phase: no SMS provider is connected yet, so the code is
    // returned directly in the response instead of being silently dropped.
    res.json(
      RequestPhoneOtpResponse.parse({
        message: "OTP generated (SMS delivery not yet connected; code shown for testing).",
        devCode: code,
      }),
    );
  },
);

router.post(
  "/profile/otp/verify",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const parsed = VerifyPhoneOtpBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [otp] = await db
      .select()
      .from(otpCodesTable)
      .where(
        and(
          eq(otpCodesTable.userId, req.user!.id),
          eq(otpCodesTable.phone, parsed.data.phone),
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

    const [existing] = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, req.user!.id));

    if (existing) {
      await db
        .update(customerProfilesTable)
        .set({ phone: parsed.data.phone, phoneVerified: true })
        .where(eq(customerProfilesTable.userId, req.user!.id));
    } else {
      await db.insert(customerProfilesTable).values({
        userId: req.user!.id,
        phone: parsed.data.phone,
        phoneVerified: true,
      });
    }

    res.json(VerifyPhoneOtpResponse.parse({ verified: true }));
  },
);

export default router;
