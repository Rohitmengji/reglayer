import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const email = process.argv[2] || "master@reglayer.dev";
  const action = process.argv[3] || "grant"; // "grant" or "revoke"

  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, isMasterAdmin: true },
  });
  console.log("User:", user);

  if (user) {
    const newValue = action === "revoke" ? false : true;
    await prisma.user.update({
      where: { id: user.id },
      data: { isMasterAdmin: newValue },
    });
    console.log(`✅ ${email} isMasterAdmin = ${newValue}`);
  } else {
    console.log("❌ User not found");
  }

  await prisma.$disconnect();
}
main().catch(console.error);
