import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  GetCurrentAuthUserResponse,
  SignUpBody,
  SignUpResponse,
  LogInBody,
  LogInResponse,
  LogoutBrowserSessionResponse,
  ChangeMyPasswordBody,
  ChangeMyPasswordResponse,
} from "@workspace/api-zod";
import { db, usersTable, type User } from "@workspace/db";
import {
  clearSession,
  getSessionId,
  createSession,
  hashPassword,
  verifyPassword,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function toSessionUser(dbUser: User): SessionData["user"] {
  return {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    profileImageUrl: dbUser.profileImageUrl,
    role: dbUser.role,
    accountStatus: dbUser.accountStatus,
    mustChangePassword: dbUser.mustChangePassword,
  };
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.post("/auth/signup", async (req: Request, res: Response) => {
  const parsed = SignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { email, password, firstName, lastName } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const [dbUser] = await db
    .insert(usersTable)
    .values({
      email: normalizedEmail,
      firstName,
      lastName,
      passwordHash: hashPassword(password),
      role: "customer",
    })
    .returning();

  const sessionData: SessionData = { user: toSessionUser(dbUser) };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json(SignUpResponse.parse({ user: sessionData.user }));
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = LogInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  if (!dbUser || !dbUser.passwordHash || !verifyPassword(password, dbUser.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (dbUser.accountStatus === "suspended") {
    res.status(403).json({ error: "This account has been suspended" });
    return;
  }

  const sessionData: SessionData = { user: toSessionUser(dbUser) };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json(LogInResponse.parse({ user: sessionData.user }));
});

router.post("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json(LogoutBrowserSessionResponse.parse({ success: true }));
});

router.post("/auth/change-password", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = ChangeMyPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));

  if (!dbUser || !dbUser.passwordHash || !verifyPassword(currentPassword, dbUser.passwordHash)) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash: hashPassword(newPassword), mustChangePassword: false })
    .where(eq(usersTable.id, dbUser.id))
    .returning();

  res.json(ChangeMyPasswordResponse.parse({ user: toSessionUser(updated) }));
});

export default router;
