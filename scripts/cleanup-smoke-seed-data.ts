/**
 * One-shot cleanup: remove smoke-test seed data (SMOKE-* apps/records + smoke applicant users).
 * Keeps staff demo accounts (bplo@, bpossuperadmin@, dept-head@, jit@, jit-disabled@).
 *
 * Usage: npx tsx scripts/cleanup-smoke-seed-data.ts
 */
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const scriptFilePath = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(scriptFilePath), "..");

const SMOKE_APPLICANT_EMAILS = [
  "applicant@example.com",
  "smoke.duplicate@example.com",
  "applicant1@example.com",
] as const;

async function main() {
  try {
    loadEnvFile(path.join(ROOT, ".env"));
  } catch {
    // optional
  }
  try {
    loadEnvFile(path.join(ROOT, ".env.local"));
  } catch {
    // optional
  }

  const { prisma } = await import("../src/lib/prisma");

  const smokeApps = await prisma.businessApplication.findMany({
    where: { applicationNumber: { startsWith: "SMOKE-" } },
    select: { businessApplicationId: true, applicationNumber: true, businessRecordId: true },
  });

  const smokeRecords = await prisma.businessRecord.findMany({
    where: { registrationNumber: { startsWith: "SMOKE-" } },
    select: { businessRecordId: true, registrationNumber: true, businessName: true },
  });

  const smokeUsers = await prisma.user.findMany({
    where: { email: { in: [...SMOKE_APPLICANT_EMAILS] } },
    select: { userId: true, email: true, role: true },
  });

  console.log("[cleanup-smoke] Found records to delete:", {
    applications: smokeApps.map((a) => a.applicationNumber),
    businessRecords: smokeRecords.map((r) => `${r.registrationNumber} (${r.businessName})`),
    applicantUsers: smokeUsers.map((u) => u.email),
  });

  if (smokeApps.length === 0 && smokeRecords.length === 0 && smokeUsers.length === 0) {
    console.log("[cleanup-smoke] No SMOKE-* applications, records, or test applicant users found in database.");
    return;
  }

  const appIds = smokeApps.map((a) => a.businessApplicationId);
  const recordIds = Array.from(
    new Set([
      ...smokeRecords.map((r) => r.businessRecordId),
      ...smokeApps.map((a) => a.businessRecordId).filter((id): id is string => Boolean(id)),
    ])
  );

  await prisma.$transaction(async (tx) => {
    // 1. Delete inspections and checklist items tied to smoke apps or smoke records
    if (recordIds.length > 0 || appIds.length > 0) {
      const smokeInspections = await tx.inspection.findMany({
        where: {
          OR: [
            ...(recordIds.length > 0 ? [{ businessRecordId: { in: recordIds } }] : []),
            ...(appIds.length > 0 ? [{ applicationId: { in: appIds } }] : []),
          ],
        },
        select: { inspectionId: true },
      });

      const inspectionIds = smokeInspections.map((i) => i.inspectionId);
      if (inspectionIds.length > 0) {
        await tx.inspectionChecklistItem.deleteMany({
          where: { inspectionId: { in: inspectionIds } },
        });
        const deletedInspections = await tx.inspection.deleteMany({
          where: { inspectionId: { in: inspectionIds } },
        });
        console.log("[cleanup-smoke] deleted smoke inspections:", deletedInspections.count);
      }
    }

    // 2. Delete child tables of smoke applications
    if (appIds.length > 0) {
      // Fee assessments & line items
      const assessments = await tx.feeAssessment.findMany({
        where: { applicationId: { in: appIds } },
        select: { feeAssessmentId: true },
      });
      const assessmentIds = assessments.map((a) => a.feeAssessmentId);
      if (assessmentIds.length > 0) {
        await tx.feeAssessmentLineItem.deleteMany({
          where: { feeAssessmentId: { in: assessmentIds } },
        });
        await tx.feeAssessment.deleteMany({
          where: { feeAssessmentId: { in: assessmentIds } },
        });
      }

      await tx.paymentReference.deleteMany({
        where: { applicationId: { in: appIds } },
      });

      await tx.permitIssuance.deleteMany({
        where: { applicationId: { in: appIds } },
      });

      await tx.applicationDocument.deleteMany({
        where: { applicationId: { in: appIds } },
      });

      await tx.applicationHistory.deleteMany({
        where: { applicationId: { in: appIds } },
      });

      await tx.auditLog.deleteMany({
        where: { applicationId: { in: appIds } },
      });

      // Clear closureApplicationId reference on any business records
      await tx.businessRecord.updateMany({
        where: { closureApplicationId: { in: appIds } },
        data: { closureApplicationId: null },
      });

      const deletedApps = await tx.businessApplication.deleteMany({
        where: { businessApplicationId: { in: appIds } },
      });
      console.log("[cleanup-smoke] deleted applications:", deletedApps.count);
    }

    // 3. Delete smoke business records and their locations
    if (recordIds.length > 0) {
      await tx.businessLocation.deleteMany({
        where: { businessRecordId: { in: recordIds } },
      });

      await tx.auditLog.deleteMany({
        where: { businessRecordId: { in: recordIds } },
      });

      const deletedRecords = await tx.businessRecord.deleteMany({
        where: { businessRecordId: { in: recordIds } },
      });
      console.log("[cleanup-smoke] deleted business records:", deletedRecords.count);
    }

    // 4. Delete smoke applicant users and their orphaned items
    if (smokeUsers.length > 0) {
      const userIds = smokeUsers.map((u) => u.userId);

      await tx.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await tx.passwordResetOtp.deleteMany({
        where: { email: { in: [...SMOKE_APPLICANT_EMAILS] } },
      });

      // Null out verifiedById on businessLocation where smoke applicants acted (unlikely)
      await tx.businessLocation.updateMany({
        where: { verifiedById: { in: userIds } },
        data: { verifiedById: null },
      });

      // Delete any locations submitted by smoke applicants
      await tx.businessLocation.deleteMany({
        where: { submittedById: { in: userIds } },
      });

      // Delete any leftover applications owned by smoke applicants
      const leftoverApps = await tx.businessApplication.findMany({
        where: { applicantId: { in: userIds } },
        select: { businessApplicationId: true },
      });
      if (leftoverApps.length > 0) {
        const leftoverIds = leftoverApps.map((a) => a.businessApplicationId);
        await tx.businessApplication.deleteMany({
          where: { businessApplicationId: { in: leftoverIds } },
        });
      }

      // Delete any leftover business records owned by smoke applicants
      await tx.businessRecord.deleteMany({
        where: { applicantId: { in: userIds } },
      });

      const deletedUsers = await tx.user.deleteMany({
        where: { userId: { in: userIds } },
      });
      console.log("[cleanup-smoke] deleted smoke applicant users:", deletedUsers.count);
    }
  });

  const after = {
    smokeAppsRemaining: await prisma.businessApplication.count({
      where: { applicationNumber: { startsWith: "SMOKE-" } },
    }),
    smokeRecordsRemaining: await prisma.businessRecord.count({
      where: { registrationNumber: { startsWith: "SMOKE-" } },
    }),
    smokeApplicantsRemaining: await prisma.user.count({
      where: { email: { in: [...SMOKE_APPLICANT_EMAILS] } },
    }),
    totalRemainingBusinessRecords: await prisma.businessRecord.count(),
    totalRemainingApplications: await prisma.businessApplication.count(),
    totalRemainingUsers: await prisma.user.count(),
  };

  console.log("[cleanup-smoke] cleanup completed successfully! Remaining counts:", after);
}

main()
  .catch((error) => {
    console.error("[cleanup-smoke] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { prisma } = await import("../src/lib/prisma");
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });
