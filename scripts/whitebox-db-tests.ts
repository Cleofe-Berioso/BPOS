/**
 * White-box database tests — grouped by objective from
 * docs/TEST_CASE_ANALYSIS_BY_OBJECTIVE.md
 *
 * Run: npx tsx scripts/whitebox-db-tests.ts
 * Output: ../whitebox/evidence/db-test-results.json
 */

import "./ebpls-env";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getJitMapMarkerStatus } from "../src/lib/jit-inspections";
import { listBploBusinessMapLocations, listJitBusinessMapLocations } from "../src/lib/business-location";
import {
  listRenewalEligibleBusinesses,
} from "../src/lib/renewal-eligibility";
import {
  listClosureEligibleBusinesses,
} from "../src/lib/closure-eligibility";
import { checkSmsProviderEnvConfiguration, isSmsEnabled } from "../src/lib/sms-config";
import { prisma } from "../src/lib/prisma";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "..", "whitebox", "evidence");

export type DbCaseResult = {
  id: string;
  objective: string;
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
};

export type DbSuiteResult = {
  ranAt: string;
  databaseUrlConfigured: boolean;
  connected: boolean;
  objectives: Record<string, { passed: number; failed: number; skipped: number; cases: DbCaseResult[] }>;
  summary: { total: number; passed: number; failed: number; skipped: number };
};

const results: DbCaseResult[] = [];

async function runCase(
  id: string,
  objective: string,
  name: string,
  fn: () => Promise<void> | void
): Promise<DbCaseResult> {
  const start = Date.now();
  try {
    await fn();
    const row: DbCaseResult = {
      id,
      objective,
      name,
      ok: true,
      detail: "PASS",
      durationMs: Date.now() - start,
    };
    results.push(row);
    return row;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.startsWith("SKIPPED:")) {
      const row: DbCaseResult = {
        id,
        objective,
        name,
        ok: true,
        detail,
        durationMs: Date.now() - start,
      };
      results.push(row);
      return row;
    }
    const row: DbCaseResult = {
      id,
      objective,
      name,
      ok: false,
      detail,
      durationMs: Date.now() - start,
    };
    results.push(row);
    return row;
  }
}

function skipCase(reason: string): never {
  throw new Error(`SKIPPED: ${reason}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── Objective 1: Authentication & Account Access ───────────────────────────

async function objective1Auth() {
  const OBJ = "OBJ-1 Authentication";

  await runCase("WB-DB-AUTH-01", OBJ, "Database connection ($queryRaw)", async () => {
    const row = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    assert(row[0]?.ok === 1, "SELECT 1 failed");
  });

  await runCase("WB-DB-AUTH-02", OBJ, "Seed applicant@example.com exists and is APPLICANT", async () => {
    const u = await prisma.user.findUnique({
      where: { email: "applicant@example.com" },
      select: { role: true, isActive: true, passwordHash: true },
    });
    assert(u, "applicant@example.com not found — run prisma seed");
    assert(u.role === "APPLICANT", `Expected APPLICANT, got ${u.role}`);
    assert(u.isActive === true, "Applicant should be active");
    assert(u.passwordHash.length > 10, "passwordHash missing");
  });

  await runCase("WB-DB-AUTH-03", OBJ, "Seed staff accounts (BPLO, DH, JIT, SA)", async () => {
    const emails = [
      { email: "bplo@example.com", role: "BPLO" },
      { email: "dept-head@example.com", role: "DEPARTMENT_HEAD" },
      { email: "jit@example.com", role: "JIT" },
      { email: "superadmin@example.com", role: "SUPER_ADMIN" },
    ] as const;
    for (const { email, role } of emails) {
      const u =
        role === "SUPER_ADMIN"
          ? await prisma.user.findFirst({
              where: {
                role: "SUPER_ADMIN",
                email: { in: ["superadmin@example.com", "bpossuperadmin@gmail.com"] },
              },
              select: { role: true, isActive: true },
            })
          : await prisma.user.findUnique({ where: { email }, select: { role: true, isActive: true } });
      assert(u, `${email} (or superadmin account) not found`);
      assert(u.role === role, `${email} role mismatch`);
      assert(u.isActive === true, `${email} should be active`);
    }
  });

  await runCase("WB-DB-AUTH-04", OBJ, "Disabled JIT account jit-disabled@example.com", async () => {
    const u = await prisma.user.findUnique({
      where: { email: "jit-disabled@example.com" },
      select: { role: true, isActive: true },
    });
    assert(u, "jit-disabled@example.com not found");
    assert(u.role === "JIT", "Expected JIT role");
    assert(u.isActive === false, "Expected isActive=false");
  });

  await runCase("WB-DB-AUTH-05", OBJ, "User table has expected role distribution", async () => {
    const counts = await prisma.user.groupBy({ by: ["role"], _count: { role: true } });
    assert(counts.length >= 4, `Expected ≥4 roles, got ${counts.length}`);
  });
}

// ─── Objective 2: Registration ────────────────────────────────────────────

async function objective2Registration() {
  const OBJ = "OBJ-2 Registration";

  await runCase("WB-DB-REG-01", OBJ, "APPLICANT users exist in database", async () => {
    const count = await prisma.user.count({ where: { role: "APPLICANT" } });
    assert(count >= 1, "No APPLICANT users found");
  });

  await runCase("WB-DB-REG-02", OBJ, "PasswordResetOtp table accessible", async () => {
    await prisma.passwordResetOtp.count();
  });

  await runCase("WB-DB-REG-03", OBJ, "No duplicate user emails (unique constraint)", async () => {
    const users = await prisma.user.findMany({ select: { email: true } });
    const emails = users.map((u) => u.email.toLowerCase());
    const unique = new Set(emails);
    assert(emails.length === unique.size, `Duplicate emails detected: ${emails.length - unique.size}`);
  });
}

// ─── Objective 3: New Application ───────────────────────────────────────────

async function objective3New() {
  const OBJ = "OBJ-3 New Application";

  await runCase("WB-DB-NEW-01", OBJ, "At least one NEW application exists", async () => {
    const count = await prisma.businessApplication.count({ where: { applicationType: "NEW" } });
    assert(count >= 1, "No NEW applications — seed or smoke data required");
  });

  await runCase("WB-DB-NEW-02", OBJ, "SUBMITTED apps have submittedAt set", async () => {
    const bad = await prisma.businessApplication.count({
      where: { status: "SUBMITTED", submittedAt: null },
    });
    assert(bad === 0, `${bad} SUBMITTED apps missing submittedAt`);
  });

  await runCase("WB-DB-NEW-03", OBJ, "ApplicationHistory rows exist for pipeline apps", async () => {
    const apps = await prisma.businessApplication.findMany({
      where: { status: { not: "DRAFT" } },
      select: { businessApplicationId: true, _count: { select: { history: true } } },
      take: 20,
    });
    const withoutHistory = apps.filter((a) => a._count.history === 0);
    assert(
      withoutHistory.length === 0,
      `${withoutHistory.length} non-DRAFT apps have no history`
    );
  });

  await runCase("WB-DB-NEW-04", OBJ, "Smoke Assessed Services (SM-05) ASSESSED state", async () => {
    const app = await prisma.businessApplication.findFirst({
      where: { applicationNumber: { contains: "SMOKE" }, status: "ASSESSED", applicationType: "NEW" },
      select: { applicationNumber: true, status: true },
    });
    if (!app) {
      throw new Error("No ASSESSED NEW smoke app — run seed-smoke-test-data.ts");
    }
    assert(app.status === "ASSESSED", "Expected ASSESSED");
  });

  await runCase("WB-DB-NEW-05", OBJ, "Application documents table has rows when apps submitted", async () => {
    const submitted = await prisma.businessApplication.count({ where: { status: "SUBMITTED" } });
    const docs = await prisma.applicationDocument.count();
    if (submitted > 0) {
      assert(docs > 0, "Submitted apps exist but no ApplicationDocument rows");
    }
  });
}

// ─── Objective 4: Renewal ───────────────────────────────────────────────────

async function objective4Renewal() {
  const OBJ = "OBJ-4 Renewal";

  await runCase("WB-DB-RENEW-01", OBJ, "RENEWAL application type exists", async () => {
    const count = await prisma.businessApplication.count({ where: { applicationType: "RENEWAL" } });
    assert(count >= 1, "No RENEWAL applications");
  });

  await runCase("WB-DB-RENEW-02", OBJ, "Smoke Retail Hub RENEWAL pending payment (SM-02)", async () => {
    const app = await prisma.businessApplication.findFirst({
      where: {
        applicationType: "RENEWAL",
        status: "APPROVED_FOR_PAYMENT",
        businessRecord: { businessName: { contains: "Smoke Retail Hub" } },
      },
      include: { paymentReferences: true },
    });
    if (!app) {
      throw new Error("SM-02 smoke RENEWAL not found — run seed-smoke-test-data.ts");
    }
    const pending = app.paymentReferences.some((p) => p.status === "PENDING");
    assert(pending || app.paymentReferences.length === 0, "SM-02 expects pending OR or none yet");
  });

  await runCase("WB-DB-RENEW-03", OBJ, "listRenewalEligibleBusinesses returns rows for applicant", async () => {
    const applicant = await prisma.user.findUnique({
      where: { email: "applicant@example.com" },
      select: { userId: true },
    });
    assert(applicant?.userId, "applicant missing");
    const result = await listRenewalEligibleBusinesses(applicant.userId);
    assert(Array.isArray(result.records), "Expected records array");
    assert(Array.isArray(result.blockedRecords), "Expected blockedRecords array");
  });

  await runCase("WB-DB-RENEW-04", OBJ, "ACTIVE business with RELEASED history appears eligible or listed", async () => {
    const applicant = await prisma.user.findUnique({
      where: { email: "applicant@example.com" },
      select: { userId: true },
    });
    assert(applicant?.userId, "applicant missing");
    const record = await prisma.businessRecord.findFirst({
      where: {
        applicantId: applicant.userId,
        businessStatus: "ACTIVE",
        applications: { some: { status: "RELEASED" } },
      },
      select: { businessRecordId: true, businessName: true },
    });
    if (!record) {
      throw new Error("No ACTIVE+RELEASED business for applicant");
    }
    const result = await listRenewalEligibleBusinesses(applicant.userId);
    const inEligible = result.records.some((r) => r.id === record.businessRecordId);
    const inBlocked = result.blockedRecords.some((r) => r.id === record.businessRecordId);
    assert(inEligible || inBlocked, `${record.businessName} should appear in renewal lists`);
    if (inEligible) {
      assert(
        result.records.find((r) => r.id === record.businessRecordId)?.renewalEligibility.eligible === true,
        "Expected eligible=true"
      );
    }
  });
}

// ─── Objective 5: Business Closure ──────────────────────────────────────────

async function objective5Closure() {
  const OBJ = "OBJ-5 Business Closure";

  await runCase("WB-DB-CLOSE-01", OBJ, "CLOSURE application type exists", async () => {
    const count = await prisma.businessApplication.count({ where: { applicationType: "CLOSURE" } });
    assert(count >= 1, "No CLOSURE applications");
  });

  await runCase("WB-DB-CLOSE-02", OBJ, "Smoke Food Corner CLOSURE quarterly TOP (SM-03)", async () => {
    const app = await prisma.businessApplication.findFirst({
      where: {
        applicationType: "CLOSURE",
        businessRecord: { businessName: { contains: "Smoke Food Corner" } },
      },
      select: { status: true, applicationNumber: true },
    });
    if (!app) {
      throw new Error("SM-03 smoke CLOSURE not found");
    }
    assert(
      ["APPROVED_FOR_PAYMENT", "PAID", "FOR_RELEASE", "RELEASED", "ASSESSED"].includes(app.status),
      `Unexpected SM-03 status: ${app.status}`
    );
  });

  await runCase("WB-DB-CLOSE-03", OBJ, "listClosureEligibleBusinesses for applicant", async () => {
    const applicant = await prisma.user.findUnique({
      where: { email: "applicant@example.com" },
      select: { userId: true },
    });
    assert(applicant?.userId, "applicant missing");
    const result = await listClosureEligibleBusinesses(applicant.userId);
    assert(Array.isArray(result.records), "Expected records array");
    assert(Array.isArray(result.complianceForcedRecords), "Expected complianceForcedRecords array");
  });

  await runCase("WB-DB-CLOSE-04", OBJ, "CLOSED business not in closure-eligible list", async () => {
    const applicant = await prisma.user.findUnique({
      where: { email: "applicant@example.com" },
      select: { userId: true },
    });
    assert(applicant?.userId, "applicant missing");
    const closed = await prisma.businessRecord.findFirst({
      where: { businessStatus: "CLOSED", applicantId: applicant.userId },
      select: { businessRecordId: true },
    });
    if (!closed) {
      skipCase("No CLOSED business for applicant");
    }
    const result = await listClosureEligibleBusinesses(applicant.userId);
    const inEligible = result.records.some((r) => r.id === closed?.businessRecordId);
    assert(!inEligible, "CLOSED business should not be closure-eligible");
  });
}

// ─── Objective 6: JIT Inspection ────────────────────────────────────────────

async function objective6Jit() {
  const OBJ = "OBJ-6 JIT Inspection";

  await runCase("WB-DB-JIT-01", OBJ, "JIT user jit@example.com active", async () => {
    const u = await prisma.user.findUnique({
      where: { email: "jit@example.com" },
      select: { role: true, isActive: true },
    });
    assert(u?.role === "JIT" && u.isActive, "jit@example.com must be active JIT");
  });

  await runCase("WB-DB-JIT-02", OBJ, "Inspection table accessible", async () => {
    await prisma.inspection.count();
  });

  await runCase("WB-DB-JIT-03", OBJ, "JitNoPermitRecord table accessible", async () => {
    await prisma.jitNoPermitRecord.count();
  });

  await runCase("WB-DB-JIT-04", OBJ, "SystemFeeSetting jitPortalEnabled readable", async () => {
    const setting = await prisma.systemFeeSetting.findFirst({
      select: { jitPortalEnabled: true },
    });
    assert(setting !== null, "SystemFeeSetting row missing");
    assert(typeof setting.jitPortalEnabled === "boolean", "jitPortalEnabled not boolean");
  });
}

// ─── Objective 7: Compliance Management ─────────────────────────────────────

async function objective7Compliance() {
  const OBJ = "OBJ-7 Compliance";

  await runCase("WB-DB-COMP-01", OBJ, "Department Head user exists", async () => {
    const u = await prisma.user.findUnique({
      where: { email: "dept-head@example.com" },
      select: { role: true },
    });
    assert(u?.role === "DEPARTMENT_HEAD", "dept-head@example.com missing");
  });

  await runCase("WB-DB-COMP-02", OBJ, "Inspection status enum values in use", async () => {
    const statuses = await prisma.inspection.groupBy({
      by: ["status"],
      _count: { status: true },
    });
    assert(Array.isArray(statuses), "groupBy failed");
  });

  await runCase("WB-DB-COMP-03", OBJ, "REVOCATION_REVIEW applications queryable", async () => {
    await prisma.businessApplication.count({ where: { status: "REVOCATION_REVIEW" } });
  });

  await runCase("WB-DB-COMP-04", OBJ, "REVOKED applications queryable", async () => {
    await prisma.businessApplication.count({ where: { status: "REVOKED" } });
  });
}

// ─── Objective 8: SMS Notification ──────────────────────────────────────────

async function objective8Sms() {
  const OBJ = "OBJ-8 SMS";

  await runCase("WB-DB-SMS-01", OBJ, "SmsDeliveryLog table accessible", async () => {
    await prisma.smsDeliveryLog.count();
  });

  await runCase("WB-DB-SMS-02", OBJ, "isSmsEnabled() reflects SMS_ENABLED env", async () => {
    const enabled = isSmsEnabled();
    const env = process.env.SMS_ENABLED?.trim().toLowerCase() === "true";
    assert(enabled === env, `isSmsEnabled=${enabled} but env implies ${env}`);
  });

  await runCase("WB-DB-SMS-03", OBJ, "SMS provider env configuration check", async () => {
    const { ok, details } = checkSmsProviderEnvConfiguration();
    assert(typeof ok === "boolean", "checkSmsProviderEnvConfiguration failed");
    assert(details.length > 0, "details empty");
  });

  await runCase("WB-DB-SMS-04", OBJ, "Release-stage app has phone in formData or BusinessRecord", async () => {
    const apps = await prisma.businessApplication.findMany({
      where: { status: { in: ["FOR_RELEASE", "RELEASED", "PAID"] } },
      include: { businessRecord: { select: { phone: true } } },
      take: 10,
    });
    if (apps.length === 0) {
      throw new Error("No release-stage apps for phone check");
    }
    const withPhone = apps.some((app) => {
      const fd = app.formData as Record<string, unknown> | null;
      const phone = typeof fd?.phone === "string" ? fd.phone.trim() : "";
      return phone.length > 0 || (app.businessRecord?.phone?.trim().length ?? 0) > 0;
    });
    assert(withPhone, "No release-stage app has phone on formData or BusinessRecord");
  });
}

// ─── Objective 9: Business Mapping ──────────────────────────────────────────

async function objective9Map() {
  const OBJ = "OBJ-9 Business Mapping";

  await runCase("WB-DB-MAP-01", OBJ, "JIT map marker status mapping (in-memory)", async () => {
    assert(getJitMapMarkerStatus(null) === "UNINSPECTED", "null → UNINSPECTED");
    assert(getJitMapMarkerStatus("DH_VERIFICATION_PENDING") === "PENDING_INSPECTION", "pending");
    assert(getJitMapMarkerStatus("VERIFIED_COMPLIANT") === "COMPLIANT", "compliant");
    assert(getJitMapMarkerStatus("REVOKED") === "REVOKED", "revoked");
  });

  await runCase("WB-DB-MAP-02", OBJ, "listJitBusinessMapLocations returns array", async () => {
    const rows = await listJitBusinessMapLocations();
    assert(Array.isArray(rows), "Expected array");
  });

  await runCase("WB-DB-MAP-03", OBJ, "listBploBusinessMapLocations returns array", async () => {
    const rows = await listBploBusinessMapLocations();
    assert(Array.isArray(rows), "Expected array");
  });

  await runCase("WB-DB-MAP-04", OBJ, "Phase 6 map color scenarios when seeded", async () => {
    const jitRows = await listJitBusinessMapLocations();
    const hasP6 = jitRows.some((r) => r.businessName === "[DEBUG-SEED] P6 Map Gray Business");
    if (!hasP6) {
      skipCase("P6 map seed missing — run npm run db:seed in EBPLS");
    }
    const hasGray = jitRows.some(
      (r) => r.businessName === "[DEBUG-SEED] P6 Map Gray Business" && r.mapMarkerStatus === "UNINSPECTED"
    );
    const hasGreen = jitRows.some(
      (r) => r.businessName === "[DEBUG-SEED] P6 Map Green Business" && r.mapMarkerStatus === "COMPLIANT"
    );
    assert(hasGray && hasGreen, "P6 gray/green markers missing");
  });

  await runCase("WB-DB-MAP-05", OBJ, "BPLO map excludes revoked unsettled P6 business", async () => {
    const bploRows = await listBploBusinessMapLocations();
    const hasRevoked = bploRows.some((r) => r.businessName.includes("P6 Map Red Unsettled"));
    assert(!hasRevoked, "BPLO map should not show revoked unsettled");
  });

  await runCase("WB-DB-MAP-06", OBJ, "Smoke released map businesses (SM-06/07)", async () => {
    const released = await prisma.businessRecord.findMany({
      where: {
        businessName: { in: ["Smoke Retail Hub", "Smoke Food Corner"] },
        applications: { some: { status: "RELEASED" } },
      },
      select: { businessName: true },
    });
    assert(released.length >= 1, "SM-06/07 released businesses not found");
  });
}

// ─── Objective 10: Other processes ──────────────────────────────────────────

async function objective10Other() {
  const OBJ = "OBJ-10 Other";

  await runCase("WB-DB-OTHER-01", OBJ, "Smoke Permit Ready Trading PAID (SM-01)", async () => {
    const app = await prisma.businessApplication.findFirst({
      where: {
        businessRecord: { businessName: { contains: "Smoke Permit Ready Trading" } },
        status: { in: ["PAID", "FOR_RELEASE", "RELEASED"] },
      },
      select: { status: true },
    });
    if (!app) throw new Error("SM-01 not found");
    assert(["PAID", "FOR_RELEASE", "RELEASED"].includes(app.status), `SM-01 status: ${app.status}`);
  });

  await runCase("WB-DB-OTHER-02", OBJ, "Smoke Permit Blocked Shop unpaid (SM-04)", async () => {
    const app = await prisma.businessApplication.findFirst({
      where: { businessRecord: { businessName: { contains: "Smoke Permit Blocked Shop" } } },
      select: { status: true },
    });
    if (!app) throw new Error("SM-04 not found");
    assert(
      ["APPROVED_FOR_PAYMENT", "ASSESSED"].includes(app.status),
      `SM-04 should be unpaid/blocked, got ${app.status}`
    );
  });

  await runCase("WB-DB-OTHER-03", OBJ, "PaymentReference rows exist when apps at APPROVED_FOR_PAYMENT+", async () => {
    const atPayment = await prisma.businessApplication.count({
      where: { status: { in: ["APPROVED_FOR_PAYMENT", "PAID", "FOR_RELEASE", "RELEASED"] } },
    });
    const refs = await prisma.paymentReference.count();
    if (atPayment > 0) {
      assert(refs > 0, "Payment-stage apps exist but no PaymentReference rows");
    }
  });

  await runCase("WB-DB-OTHER-04", OBJ, "FeeAssessment GENERATED for payment-stage apps", async () => {
    const apps = await prisma.businessApplication.findMany({
      where: { status: "APPROVED_FOR_PAYMENT" },
      select: { businessApplicationId: true },
      take: 5,
    });
    for (const app of apps) {
      const fa = await prisma.feeAssessment.findFirst({
        where: { applicationId: app.businessApplicationId, status: "GENERATED" },
      });
      assert(fa, `App ${app.businessApplicationId} APPROVED_FOR_PAYMENT but no GENERATED FeeAssessment`);
    }
  });

  await runCase("WB-DB-OTHER-05", OBJ, "PermitIssuance for released smoke apps", async () => {
    const count = await prisma.permitIssuance.count({
      where: { status: "RELEASED" },
    });
    assert(count >= 1, "No RELEASED PermitIssuance rows");
  });

  await runCase("WB-DB-OTHER-06", OBJ, "AuditLog table accessible", async () => {
    await prisma.auditLog.count();
  });

  await runCase("WB-DB-OTHER-07", OBJ, "BusinessRecord tin column is bigint-compatible", async () => {
    const samples = await prisma.businessRecord.findMany({
      select: { tin: true },
      take: 50,
    });
    const sample = samples.find((s) => s.tin !== null);
    if (!sample?.tin) {
      throw new Error("No BusinessRecord with tin for schema check");
    }
    assert(typeof sample.tin === "bigint", "tin should be bigint from Prisma");
  });

  await runCase("WB-DB-OTHER-08", OBJ, "FeeConfigurationItem table accessible", async () => {
    await prisma.feeConfigurationItem.count();
  });
}

export async function runWhiteboxDbTests(): Promise<DbSuiteResult> {
  results.length = 0;
  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL?.trim());
  let connected = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    connected = true;
  } catch {
    connected = false;
  }

  if (!connected) {
    results.push({
      id: "WB-DB-CONN",
      objective: "ALL",
      name: "Database connection",
      ok: true,
      detail: "SKIPPED: DATABASE_URL not reachable",
      durationMs: 0,
    });
    return {
      ranAt: new Date().toISOString(),
      databaseUrlConfigured,
      connected: false,
      objectives: {},
      summary: { total: 1, passed: 0, failed: 0, skipped: 1 },
    };
  }

  await objective1Auth();
  await objective2Registration();
  await objective3New();
  await objective4Renewal();
  await objective5Closure();
  await objective6Jit();
  await objective7Compliance();
  await objective8Sms();
  await objective9Map();
  await objective10Other();

  const objectives: DbSuiteResult["objectives"] = {};
  for (const row of results) {
    const key = row.objective.startsWith("OBJ-") ? row.objective.split(" ")[0]! : row.objective;
    if (!objectives[key]) {
      objectives[key] = { passed: 0, failed: 0, skipped: 0, cases: [] };
    }
    objectives[key].cases.push(row);
    if (row.detail.startsWith("SKIPPED:")) {
      objectives[key].skipped++;
    } else if (row.ok) {
      objectives[key].passed++;
    } else {
      objectives[key].failed++;
    }
  }

  const passed = results.filter((r) => r.ok && !r.detail.startsWith("SKIPPED:")).length;
  const failed = results.filter((r) => !r.ok).length;
  const skipped = results.filter((r) => r.detail.startsWith("SKIPPED:")).length;

  return {
    ranAt: new Date().toISOString(),
    databaseUrlConfigured,
    connected: true,
    objectives,
    summary: { total: results.length, passed, failed, skipped },
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("Running white-box database tests (10 objectives)...\n");

  const suite = await runWhiteboxDbTests();
  const outPath = path.join(OUT_DIR, "db-test-results.json");
  fs.writeFileSync(outPath, JSON.stringify(suite, null, 2), "utf8");

  for (const row of results) {
    const icon = row.detail.startsWith("SKIPPED:") ? "○" : row.ok ? "✓" : "✗";
    console.log(`  ${icon} ${row.id} ${row.name}`);
    if (!row.ok) console.log(`      ${row.detail}`);
  }

  console.log(
    `\nDB tests: ${suite.summary.passed} passed, ${suite.summary.failed} failed, ${suite.summary.skipped} skipped (${suite.summary.total} total)`
  );
  console.log(`Results written to ${outPath}`);

  await prisma.$disconnect();
  process.exit(suite.summary.failed > 0 ? 1 : 0);
}

const isMain = process.argv[1]?.includes("whitebox-db-tests");
if (isMain) {
  main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
}
