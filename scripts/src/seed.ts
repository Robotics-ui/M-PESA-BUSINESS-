import { db, usersTable, customerProfilesTable, virtualCardsTable, auditLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type SeedCustomer = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  approvedLoanAmount: string;
  loanStatus: "active" | "frozen" | "rejected";
  card?: {
    cardNumber: string;
    cardHolderName: string;
    bank?: string;
    status: "pending" | "approved" | "rejected";
    rejectionReason?: string;
  };
};

const customers: SeedCustomer[] = [
  {
    email: "demo.approved@example.com",
    firstName: "Amina",
    lastName: "Otieno",
    phone: "+254712000001",
    approvedLoanAmount: "80000",
    loanStatus: "active",
    card: {
      cardNumber: "4111111111111111",
      cardHolderName: "Amina Otieno",
      bank: "Equity Bank",
      status: "approved",
    },
  },
  {
    email: "demo.pending@example.com",
    firstName: "Brian",
    lastName: "Mwangi",
    phone: "+254712000002",
    approvedLoanAmount: "50000",
    loanStatus: "active",
    card: {
      cardNumber: "5500005555555559",
      cardHolderName: "Brian Mwangi",
      bank: "KCB",
      status: "pending",
    },
  },
  {
    email: "demo.rejected@example.com",
    firstName: "Cynthia",
    lastName: "Wanjiru",
    phone: "+254712000003",
    approvedLoanAmount: "30000",
    loanStatus: "active",
    card: {
      cardNumber: "4000056655665556",
      cardHolderName: "C. Wanjiru Njoroge",
      bank: "M-PESA",
      status: "rejected",
      rejectionReason: "Card name does not match customer ID.",
    },
  },
  {
    email: "demo.nocard@example.com",
    firstName: "Dennis",
    lastName: "Kiplagat",
    phone: "+254712000004",
    approvedLoanAmount: "0",
    loanStatus: "active",
  },
  {
    email: "demo.frozen@example.com",
    firstName: "Faith",
    lastName: "Achieng",
    phone: "+254712000005",
    approvedLoanAmount: "60000",
    loanStatus: "frozen",
    card: {
      cardNumber: "6011000990139424",
      cardHolderName: "Faith Achieng",
      bank: "Co-operative Bank",
      status: "approved",
    },
  },
];

async function seedCustomer(c: SeedCustomer) {
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, c.email));

  if (!user) {
    [user] = await db
      .insert(usersTable)
      .values({
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        role: "customer",
        accountStatus: "active",
      })
      .returning();
    console.log(`Created user ${c.email} (${user.id})`);
  } else {
    console.log(`User ${c.email} already exists (${user.id}), updating profile`);
  }

  const [existingProfile] = await db
    .select()
    .from(customerProfilesTable)
    .where(eq(customerProfilesTable.userId, user.id));

  if (existingProfile) {
    await db
      .update(customerProfilesTable)
      .set({
        approvedLoanAmount: c.approvedLoanAmount,
        loanStatus: c.loanStatus,
        profileComplete: true,
        phoneVerified: true,
      })
      .where(eq(customerProfilesTable.id, existingProfile.id));
  } else {
    await db.insert(customerProfilesTable).values({
      userId: user.id,
      phone: c.phone,
      phoneVerified: true,
      profileComplete: true,
      approvedLoanAmount: c.approvedLoanAmount,
      loanStatus: c.loanStatus,
    });
  }

  const [existingCard] = await db
    .select()
    .from(virtualCardsTable)
    .where(eq(virtualCardsTable.customerId, user.id));

  if (!existingCard && c.card) {
    await db.insert(virtualCardsTable).values({
      customerId: user.id,
      cardNumber: c.card.cardNumber,
      cardHolderName: c.card.cardHolderName,
      bank: c.card.bank,
      status: c.card.status,
      rejectionReason: c.card.rejectionReason,
      approvedAt: c.card.status === "approved" ? new Date() : null,
    });

    await db.insert(auditLogsTable).values({
      userId: user.id,
      action: `virtual_card.seeded_${c.card.status}`,
      entityType: "virtual_card",
      entityId: user.id,
      details: c.card.rejectionReason ? JSON.stringify({ rejectionReason: c.card.rejectionReason }) : null,
    });
  }
}

for (const c of customers) {
  await seedCustomer(c);
}

console.log("\nSeed complete. Demo customers:");
for (const c of customers) {
  console.log(
    `  - ${c.email}: limit KSh ${c.approvedLoanAmount}, loan ${c.loanStatus}, card ${c.card?.status ?? "none"}`,
  );
}
console.log(
  "\nNote: these are data-only demo rows for the admin dashboard. They can't log in (Replit Auth requires a real login).",
);
console.log(
  "To test the customer side yourself: log in once via Replit Auth, then run:\n" +
    "  pnpm --filter @workspace/scripts run promote-user <your-email> super_admin\n" +
    "to view/manage the seeded customers from the admin dashboard.",
);

process.exit(0);
