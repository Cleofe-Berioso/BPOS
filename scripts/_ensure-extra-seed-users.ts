import { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* optional */
}
try {
  loadEnvFile(path.join(ROOT, ".env.local"));
} catch {
  /* optional */
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const passwordHash = await bcrypt.hash("password123", 12);
  const users = [
    { email: "applicant1@example.com", name: "Applicant One", role: "APPLICANT" as const, isActive: true },
    { email: "jit-disabled@example.com", name: "JIT Disabled", role: "JIT" as const, isActive: false },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash, isActive: u.isActive },
      create: { email: u.email, name: u.name, role: u.role, passwordHash, isActive: u.isActive },
    });
    console.log("ok", u.email);
  }

  // Satisfy applicant profile-picture gate for blackbox (boolean path check only).
  const applicants = await prisma.user.updateMany({
    where: { role: "APPLICANT", OR: [{ profileImageStoragePath: null }, { profileImageStoragePath: "" }] },
    data: { profileImageStoragePath: "e2e/blackbox-placeholder-profile.jpg" },
  });
  console.log("applicant profile placeholders set:", applicants.count);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
