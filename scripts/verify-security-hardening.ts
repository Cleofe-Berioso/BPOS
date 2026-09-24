import { safeApiErrorMessage } from "../src/lib/api-errors";
import { validateDocumentFileContent } from "../src/lib/file-content-validation";
import {
  checkRateLimit,
  REGISTER_RATE_LIMIT,
  resetRateLimitStoreForTests,
} from "../src/lib/rate-limit";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifySafeApiErrorMessage(): Promise<void> {
  assert(
    safeApiErrorMessage(new Error("Prisma P2002 unique constraint"), "Unable to save", {
      forceProduction: true,
    }) === "Unable to save",
    "Production API errors must not leak internal messages."
  );

  assert(
    safeApiErrorMessage(new Error("Prisma P2002 unique constraint"), "Unable to save", {
      forceProduction: false,
    }).includes("P2002"),
    "Development API errors should include internal messages."
  );
}

function verifyRateLimit(): void {
  resetRateLimitStoreForTests();
  const key = "verify-security:test-ip";

  for (let i = 0; i < REGISTER_RATE_LIMIT.limit; i++) {
    const result = checkRateLimit(key, REGISTER_RATE_LIMIT);
    assert(result.ok, `Expected request ${i + 1} to be allowed.`);
  }

  const blocked = checkRateLimit(key, REGISTER_RATE_LIMIT);
  assert(!blocked.ok, "Rate limiter should block after limit is exceeded.");
}

function verifyFileContentValidation(): void {
  const pdfBytes = new TextEncoder().encode("%PDF-1.4 fake content");
  assert(
    validateDocumentFileContent(pdfBytes, "application/pdf") === null,
    "Valid PDF magic bytes should pass content validation."
  );

  const fakePdf = new TextEncoder().encode("not-a-pdf");
  assert(
    validateDocumentFileContent(fakePdf, "application/pdf") !== null,
    "Invalid PDF bytes should fail content validation."
  );

  const pngHeader = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
  ]);
  assert(
    validateDocumentFileContent(pngHeader, "image/jpeg") !== null,
    "MIME mismatch between declared type and magic bytes should fail."
  );
}

async function verifyDisabledUserDbState(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.warn("[verify-security] Skipping DB checks: DATABASE_URL is not set.");
    return;
  }

  const { prisma } = await import("../src/lib/prisma");

  const disabledStaff = await prisma.user.findFirst({
    where: { isActive: false, role: { in: ["BPLO", "JIT", "DEPARTMENT_HEAD", "SUPER_ADMIN"] } },
    select: { userId: true, role: true, isActive: true },
  });

  if (!disabledStaff) {
    console.warn("[verify-security] Skipping disabled-staff check: no inactive staff seed user.");
    return;
  }

  assert(disabledStaff.isActive === false, "Seed disabled staff user must be inactive.");
  assert(
    !(disabledStaff.isActive && disabledStaff.role === disabledStaff.role),
    "Disabled staff must fail uploads isActive DB gate."
  );

  const disabledApplicant = await prisma.user.findFirst({
    where: { isActive: false, role: "APPLICANT" },
    select: { userId: true, role: true, isActive: true },
  });

  if (!disabledApplicant) {
    console.warn("[verify-security] Skipping disabled-applicant check: no inactive applicant seed user.");
    return;
  }

  assert(disabledApplicant.isActive === false, "Seed disabled applicant must be inactive.");
}

async function main(): Promise<void> {
  verifyRateLimit();
  await verifySafeApiErrorMessage();
  verifyFileContentValidation();
  await verifyDisabledUserDbState();

  console.log("Security hardening regression checks passed.");
}

main()
  .catch((error) => {
    console.error("Security hardening regression checks failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.DATABASE_URL?.trim()) {
      const { prisma } = await import("../src/lib/prisma");
      await prisma.$disconnect();
    }
  });
