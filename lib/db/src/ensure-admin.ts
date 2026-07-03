import crypto from "crypto";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { usersTable } from "./schema";

const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt}:${derivedKey.toString("hex")}`;
}

function generateTemporaryPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export async function ensureAdminAccount(
  logger?: { info: (obj: unknown, msg?: string) => void },
): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? "admin@mpesabusinessloans.com").trim().toLowerCase();

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));

  if (existing) {
    return;
  }

  const temporaryPassword = generateTemporaryPassword();

  await db.insert(usersTable).values({
    email,
    firstName: "Admin",
    lastName: "User",
    role: "super_admin",
    accountStatus: "active",
    passwordHash: hashPassword(temporaryPassword),
    mustChangePassword: true,
  });

  // Write credentials to a local file rather than app logs to avoid plaintext
  // credential exposure in log aggregation pipelines.
  const credFile = path.resolve(process.cwd(), "admin-credentials.txt");
  const credContents = [
    "M-PESA Business Loans — Super Admin Credentials",
    "================================================",
    `Email:              ${email}`,
    `Temporary password: ${temporaryPassword}`,
    "",
    "You MUST change this password on first login.",
    "Delete this file after you have signed in.",
    `Generated at: ${new Date().toISOString()}`,
  ].join("\n");
  fs.writeFileSync(credFile, credContents, { mode: 0o600 });

  const safeMessage = `Created super admin account — email: ${email}. Temporary password written to admin-credentials.txt (must be changed on first login).`;
  if (logger) {
    logger.info({ email }, safeMessage);
  } else {
    console.log(safeMessage);
  }
}
