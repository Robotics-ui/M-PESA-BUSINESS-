import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const email = process.argv[2];
const role = process.argv[3] as "super_admin" | "loan_officer" | "customer" | undefined;

if (!email || !role) {
  console.error("Usage: tsx src/promote-user.ts <email> <super_admin|loan_officer|customer>");
  process.exit(1);
}

if (!["super_admin", "loan_officer", "customer"].includes(role)) {
  console.error(`Invalid role: ${role}`);
  process.exit(1);
}

const [updated] = await db
  .update(usersTable)
  .set({ role, updatedAt: new Date() })
  .where(eq(usersTable.email, email))
  .returning();

if (!updated) {
  console.error(`No user found with email ${email}. Ask them to log in at least once first.`);
  process.exit(1);
}

console.log(`Updated ${updated.email} (${updated.id}) to role: ${updated.role}`);
process.exit(0);
