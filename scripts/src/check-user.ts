import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const email = process.argv[2];
if (!email) {
  console.error("Usage: tsx src/check-user.ts <email>");
  process.exit(1);
}

const [u] = await db.select().from(usersTable).where(eq(usersTable.email, email));
console.log(u ? JSON.stringify(u, null, 2) : "NOT_FOUND");
process.exit(0);
