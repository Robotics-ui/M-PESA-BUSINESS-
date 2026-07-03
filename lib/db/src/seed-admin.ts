import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, pool, usersTable } from "./index";

const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt}:${derivedKey.toString("hex")}`;
}

function generateTemporaryPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@mpesabusinessloans.com").trim().toLowerCase();

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (existing) {
    console.log(`Admin account already exists: ${email}`);
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

  console.log("Created super admin account:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${temporaryPassword}`);
  console.log("This is a temporary password — you will be asked to change it on first login.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
