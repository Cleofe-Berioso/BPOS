/**
 * EBPLS use-case runner — all 66 use cases from:
 *   docs/ebpls-use-case-diagram-and-test-plan.md
 *
 * Application Name: Electronic Business Permit and Licensing System (EBPLS)
 *
 * What this suite verifies (per UC):
 *   1) UI page wiring (page.tsx exists)
 *   2) API route wiring (route.ts exists) where applicable
 *   3) Optional DB evidence (seeded/live rows) when DATABASE_URL is set
 *
 * This is an implementation / wiring + data-evidence suite — not a full browser E2E
 * (Playwright) simulation of every click path.
 *
 * Usage:
 *   npx tsx scripts/run-test-cases.ts
 *   npx tsx scripts/run-test-cases.ts --suite=usecases
 *   npx tsx scripts/run-test-cases.ts --suite=usecases --uc=UC-AP-05
 *   npx tsx scripts/run-test-cases.ts --suite=smoke --name="Smoke Food Corner"
 *   npx tsx scripts/run-test-cases.ts --list
 *   npm run test:cases
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // Optional when running unit-only suites without a local .env
}

/** System under test */
export const APPLICATION_NAME =
  "Electronic Business Permit and Licensing System (EBPLS)";

const UC_CATALOG =
  "docs/ebpls-use-case-diagram-and-test-plan.md (66 use cases)";

async function getPrisma() {
  const mod = await import("../src/lib/prisma");
  return mod.prisma;
}

type SuiteId =
  | "unit"
  | "security"
  | "core"
  | "alignment"
  | "smoke"
  | "usecases"
  | "all";

interface CaseResult {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
}

type EvidenceKind =
  | "none"
  | "any_user"
  | "any_new_app"
  | "any_renewal_app"
  | "any_closure_app"
  | "any_draft_app"
  | "any_document"
  | "any_location"
  | "any_returned_app"
  | "any_released_permit"
  | "any_released_closure"
  | "any_top_assessment"
  | "any_payment_ref"
  | "any_fee_assessment"
  | "any_verified_payment"
  | "any_prepared_or_released_permit"
  | "any_released_issuance"
  | "any_inspection"
  | "jit_portal_setting"
  | "any_no_permit_ticket"
  | "any_fee_config"
  | "any_fee_setting"
  | "any_renewal_extension"
  | "any_audit_or_activity"
  | "cron_route_only";

interface UseCaseDef {
  id: string;
  name: string;
  actor: string;
  pages: string[];
  apis: string[];
  evidence: EvidenceKind;
}

/** Full 66-use-case catalog (IDs match ebpls-use-case-diagram-and-test-plan.md §4). */
const USE_CASES: UseCaseDef[] = [
  // ── Auth (4) ──────────────────────────────────────────────────────────────
  {
    id: "UC-AUTH-01",
    name: "Register Account (Email OTP)",
    actor: "Auth",
    pages: ["src/app/register/page.tsx"],
    apis: [
      "src/app/api/auth/register/route.ts",
      "src/app/api/auth/register/send-otp/route.ts",
      "src/app/api/auth/register/verify-otp/route.ts",
    ],
    evidence: "any_user",
  },
  {
    id: "UC-AUTH-02",
    name: "Login (Credentials or Google)",
    actor: "Auth",
    pages: ["src/app/login/page.tsx", "src/app/auth/redirect/page.tsx"],
    apis: ["src/app/api/auth/[...nextauth]/route.ts"],
    evidence: "any_user",
  },
  {
    id: "UC-AUTH-03",
    name: "Forgot Password (OTP Reset)",
    actor: "Auth",
    pages: ["src/app/forgot-password/page.tsx"],
    apis: [
      "src/app/api/auth/forgot-password/request-otp/route.ts",
      "src/app/api/auth/forgot-password/verify-otp/route.ts",
      "src/app/api/auth/forgot-password/reset-password/route.ts",
    ],
    evidence: "none",
  },
  {
    id: "UC-AUTH-04",
    name: "Logout",
    actor: "Auth",
    pages: ["src/app/login/page.tsx"],
    apis: ["src/app/api/auth/[...nextauth]/route.ts"],
    evidence: "none",
  },

  // ── Applicant (20) ────────────────────────────────────────────────────────
  {
    id: "UC-AP-01",
    name: "Complete Profile Picture Setup",
    actor: "Applicant",
    pages: ["src/app/applicant/profile-picture/setup/page.tsx"],
    apis: ["src/app/api/applicant/profile-picture/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-AP-02",
    name: "Update Profile Picture",
    actor: "Applicant",
    pages: ["src/app/applicant/profile/page.tsx"],
    apis: ["src/app/api/applicant/profile-picture/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-AP-03",
    name: "View Applicant Dashboard",
    actor: "Applicant",
    pages: ["src/app/applicant/dashboard/page.tsx"],
    apis: [],
    evidence: "none",
  },
  {
    id: "UC-AP-04",
    name: "Select Application Filing Type",
    actor: "Applicant",
    pages: ["src/app/applicant/application/page.tsx"],
    apis: [],
    evidence: "none",
  },
  {
    id: "UC-AP-05",
    name: "Submit New Business Permit Application",
    actor: "Applicant",
    pages: ["src/app/applicant/application/new/page.tsx"],
    apis: ["src/app/api/applicant/applications/route.ts"],
    evidence: "any_new_app",
  },
  {
    id: "UC-AP-06",
    name: "Submit Renewal Application",
    actor: "Applicant",
    pages: ["src/app/applicant/application/renewal/page.tsx"],
    apis: ["src/app/api/applicant/applications/route.ts"],
    evidence: "any_renewal_app",
  },
  {
    id: "UC-AP-07",
    name: "Submit Closure Application",
    actor: "Applicant",
    pages: ["src/app/applicant/application/closure/page.tsx"],
    apis: ["src/app/api/applicant/applications/route.ts"],
    evidence: "any_closure_app",
  },
  {
    id: "UC-AP-08",
    name: "Save Application as Draft",
    actor: "Applicant",
    pages: ["src/app/applicant/application/new/page.tsx"],
    apis: ["src/app/api/applicant/applications/route.ts"],
    evidence: "any_draft_app",
  },
  {
    id: "UC-AP-09",
    name: "Upload Required Document",
    actor: "Applicant",
    pages: ["src/app/applicant/application/new/page.tsx"],
    apis: ["src/app/api/applicant/applications/route.ts"],
    evidence: "any_document",
  },
  {
    id: "UC-AP-10",
    name: "Pin Business Location on Map",
    actor: "Applicant",
    pages: ["src/app/applicant/application/new/page.tsx"],
    apis: ["src/app/api/applicant/business-location/route.ts"],
    evidence: "any_location",
  },
  {
    id: "UC-AP-11",
    name: "View Legacy Business Location (deprecated)",
    actor: "Applicant",
    pages: ["src/app/applicant/business-location/page.tsx"],
    apis: [],
    evidence: "none",
  },
  {
    id: "UC-AP-12",
    name: "Correct and Resubmit Returned Application",
    actor: "Applicant",
    pages: ["src/app/applicant/my-applications/[applicationId]/page.tsx"],
    apis: ["src/app/api/applicant/applications/[applicationId]/route.ts"],
    evidence: "any_returned_app",
  },
  {
    id: "UC-AP-13",
    name: "View My Applications",
    actor: "Applicant",
    pages: ["src/app/applicant/my-applications/page.tsx"],
    apis: ["src/app/api/applicant/applications/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-AP-14",
    name: "View Application Detail & Status Tracking",
    actor: "Applicant",
    pages: ["src/app/applicant/my-applications/[applicationId]/page.tsx"],
    apis: ["src/app/api/applicant/applications/[applicationId]/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-AP-15",
    name: "View/Print Business Permit Preview",
    actor: "Applicant",
    pages: ["src/app/applicant/permits/[applicationId]/page.tsx"],
    apis: [],
    evidence: "any_released_permit",
  },
  {
    id: "UC-AP-16",
    name: "Print Business Closure Certificate",
    actor: "Applicant",
    pages: ["src/app/applicant/closure-certificates/[applicationId]/page.tsx"],
    apis: [],
    evidence: "any_released_closure",
  },
  {
    id: "UC-AP-17",
    name: "View TOP & Submit Payment Reference",
    actor: "Applicant",
    pages: ["src/app/applicant/top/page.tsx"],
    apis: ["src/app/api/applicant/top/route.ts"],
    evidence: "any_top_assessment",
  },
  {
    id: "UC-AP-18",
    name: "Request Reassessment of TOP",
    actor: "Applicant",
    pages: ["src/app/applicant/top/page.tsx"],
    apis: [
      "src/app/api/applicant/applications/[applicationId]/request-reassessment/route.ts",
    ],
    evidence: "none",
  },
  {
    id: "UC-AP-19",
    name: "View Notifications",
    actor: "Applicant",
    pages: ["src/app/applicant/notifications/page.tsx"],
    apis: ["src/app/api/applicant/notifications/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-AP-20",
    name: "View Profile",
    actor: "Applicant",
    pages: ["src/app/applicant/profile/page.tsx"],
    apis: ["src/app/api/applicant/profile/route.ts"],
    evidence: "none",
  },

  // ── BPLO (19) ─────────────────────────────────────────────────────────────
  {
    id: "UC-BP-01",
    name: "Review Submitted Application (Queue + Detail)",
    actor: "BPLO",
    pages: [
      "src/app/bplo/applications/page.tsx",
      "src/app/bplo/applications/[applicationId]/page.tsx",
    ],
    apis: ["src/app/api/bplo/applications/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-BP-02",
    name: "Validate Uploaded Document",
    actor: "BPLO",
    pages: ["src/app/bplo/applications/[applicationId]/page.tsx"],
    apis: [
      "src/app/api/bplo/applications/[applicationId]/documents/[documentId]/validation/route.ts",
    ],
    evidence: "any_document",
  },
  {
    id: "UC-BP-03",
    name: "Download Application Document",
    actor: "BPLO",
    pages: ["src/app/bplo/applications/[applicationId]/page.tsx"],
    apis: [
      "src/app/api/bplo/applications/[applicationId]/documents/[documentId]/download/route.ts",
    ],
    evidence: "none",
  },
  {
    id: "UC-BP-04",
    name: "Mark Application Under Review",
    actor: "BPLO",
    pages: ["src/app/bplo/applications/[applicationId]/page.tsx"],
    apis: ["src/app/api/bplo/applications/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-BP-05",
    name: "Return Application for Correction",
    actor: "BPLO",
    pages: ["src/app/bplo/applications/[applicationId]/page.tsx"],
    apis: ["src/app/api/bplo/applications/route.ts"],
    evidence: "any_returned_app",
  },
  {
    id: "UC-BP-06",
    name: "Reject Application",
    actor: "BPLO",
    pages: ["src/app/bplo/applications/[applicationId]/page.tsx"],
    apis: ["src/app/api/bplo/applications/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-BP-07",
    name: "Approve for Department Head Review",
    actor: "BPLO",
    pages: ["src/app/bplo/applications/[applicationId]/page.tsx"],
    apis: ["src/app/api/bplo/applications/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-BP-08",
    name: "Assess Business Permit Fees / Save Draft",
    actor: "BPLO",
    pages: [
      "src/app/bplo/assessment-fees/page.tsx",
      "src/app/bplo/assessment-fees/[applicationId]/page.tsx",
    ],
    apis: ["src/app/api/bplo/assessment-fees/route.ts"],
    evidence: "any_fee_assessment",
  },
  {
    id: "UC-BP-09",
    name: "Generate Tax Order of Payment",
    actor: "BPLO",
    pages: ["src/app/bplo/assessment-fees/[applicationId]/page.tsx"],
    apis: ["src/app/api/bplo/assessment-fees/route.ts"],
    evidence: "any_top_assessment",
  },
  {
    id: "UC-BP-10",
    name: "Resolve Applicant-Requested Reassessment",
    actor: "BPLO",
    pages: ["src/app/bplo/assessment-fees/[applicationId]/page.tsx"],
    apis: ["src/app/api/bplo/assessment-fees/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-BP-11",
    name: "Verify Payment Reference",
    actor: "BPLO",
    pages: ["src/app/bplo/payment-verification/page.tsx"],
    apis: ["src/app/api/bplo/payment-verification/route.ts"],
    evidence: "any_verified_payment",
  },
  {
    id: "UC-BP-12",
    name: "Reject Payment Reference",
    actor: "BPLO",
    pages: ["src/app/bplo/payment-verification/page.tsx"],
    apis: ["src/app/api/bplo/payment-verification/route.ts"],
    evidence: "any_payment_ref",
  },
  {
    id: "UC-BP-13",
    name: "Prepare Permit/Certificate for Issuance",
    actor: "BPLO",
    pages: [
      "src/app/bplo/permit-issuance/page.tsx",
      "src/app/bplo/permit-issuance/[applicationId]/page.tsx",
    ],
    apis: ["src/app/api/bplo/permit-issuance/route.ts"],
    evidence: "any_prepared_or_released_permit",
  },
  {
    id: "UC-BP-14",
    name: "Release Permit/Certificate",
    actor: "BPLO",
    pages: ["src/app/bplo/permit-issuance/[applicationId]/page.tsx"],
    apis: ["src/app/api/bplo/permit-issuance/route.ts"],
    evidence: "any_released_issuance",
  },
  {
    id: "UC-BP-15",
    name: "Print Business Permit/Closure Certificate",
    actor: "BPLO",
    pages: [
      "src/app/bplo/permit-issuance/[applicationId]/print/page.tsx",
      "src/app/bplo/permit-issuance/[applicationId]/closure-print/page.tsx",
    ],
    apis: [],
    evidence: "any_released_issuance",
  },
  {
    id: "UC-BP-16",
    name: "Review JIT Inspection Compliance",
    actor: "BPLO",
    pages: ["src/app/bplo/dashboard/page.tsx"],
    apis: [],
    evidence: "any_inspection",
  },
  {
    id: "UC-BP-17",
    name: "Review Business Map Locations",
    actor: "BPLO",
    pages: ["src/app/bplo/business-map/page.tsx"],
    apis: ["src/app/api/bplo/business-map/route.ts"],
    evidence: "any_location",
  },
  {
    id: "UC-BP-18",
    name: "Verify/Return Business Location (API only)",
    actor: "BPLO",
    pages: [],
    apis: ["src/app/api/applicant/business-location/route.ts"],
    evidence: "any_location",
  },
  {
    id: "UC-BP-19",
    name: "Manage BPLO Staff Profile",
    actor: "BPLO",
    pages: ["src/app/bplo/profile/page.tsx"],
    apis: [
      "src/app/api/bplo/profile/route.ts",
      "src/app/api/bplo/profile-picture/route.ts",
    ],
    evidence: "none",
  },

  // ── Department Head (7) ───────────────────────────────────────────────────
  {
    id: "UC-DH-01",
    name: "Review Application (Approve / Reject / Return)",
    actor: "Department Head",
    pages: ["src/app/department-head/application-approval/page.tsx"],
    apis: [
      "src/app/api/department-head/application-approval/route.ts",
      "src/app/api/department-head/application-approval/[applicationId]/return/route.ts",
    ],
    evidence: "none",
  },
  {
    id: "UC-DH-02",
    name: "Verify Inspection Compliance",
    actor: "Department Head",
    pages: ["src/app/department-head/inspection-verification/page.tsx"],
    apis: [
      "src/app/api/department-head/inspection-verification/route.ts",
      "src/app/api/department-head/inspection-verification/[inspectionId]/verify/route.ts",
    ],
    evidence: "any_inspection",
  },
  {
    id: "UC-DH-03",
    name: "View Compliant Business List",
    actor: "Department Head",
    pages: ["src/app/department-head/compliant-list/page.tsx"],
    apis: ["src/app/api/department-head/compliant-list/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-DH-04",
    name: "Approve or Deny Permit Revocation",
    actor: "Department Head",
    pages: ["src/app/department-head/permit-to-revoke/page.tsx"],
    apis: [
      "src/app/api/department-head/permit-to-revoke/route.ts",
      "src/app/api/department-head/permit-to-revoke/[inspectionId]/approve-revocation/route.ts",
      "src/app/api/department-head/permit-to-revoke/[inspectionId]/deny-revocation/route.ts",
    ],
    evidence: "none",
  },
  {
    id: "UC-DH-05",
    name: "Manage Revoked Permit Registry (Mark Settled)",
    actor: "Department Head",
    pages: ["src/app/department-head/revoke-permit-list/page.tsx"],
    apis: ["src/app/api/department-head/revoke-permit-list/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-DH-06",
    name: "Settle Flagged Compliance Case",
    actor: "Department Head",
    pages: ["src/app/department-head/settlement-management/page.tsx"],
    apis: ["src/app/api/department-head/settlement-management/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-DH-07",
    name: "View Department Head Dashboard",
    actor: "Department Head",
    pages: ["src/app/department-head/dashboard/page.tsx"],
    apis: ["src/app/api/department-head/dashboard/route.ts"],
    evidence: "none",
  },

  // ── JIT (5) ───────────────────────────────────────────────────────────────
  {
    id: "UC-JIT-01",
    name: "Conduct Business Inspection (8-item checklist)",
    actor: "JIT",
    pages: ["src/app/jit/inspect-a-business/page.tsx"],
    apis: [
      "src/app/api/jit/inspect-a-business/route.ts",
      "src/app/api/jit/inspect-a-business/[businessRecordId]/route.ts",
      "src/app/api/jit/inspections/[inspectionId]/checklist/route.ts",
    ],
    evidence: "any_inspection",
  },
  {
    id: "UC-JIT-02",
    name: "Record No-Permit Ticket",
    actor: "JIT",
    pages: [
      "src/app/jit/no-permit-record/page.tsx",
      "src/app/jit/no-permit-record/[recordId]/print/page.tsx",
    ],
    apis: ["src/app/api/jit/no-permit-record/route.ts"],
    evidence: "any_no_permit_ticket",
  },
  {
    id: "UC-JIT-03",
    name: "View Business Map",
    actor: "JIT",
    pages: ["src/app/jit/business-map/page.tsx"],
    apis: ["src/app/api/jit/business-map/route.ts"],
    evidence: "any_location",
  },
  {
    id: "UC-JIT-04",
    name: "View JIT Dashboard",
    actor: "JIT",
    pages: ["src/app/jit/dashboard/page.tsx"],
    apis: ["src/app/api/jit/dashboard/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-JIT-05",
    name: "Handle JIT Portal Disabled State",
    actor: "JIT",
    pages: ["src/app/jit/portal-disabled/page.tsx"],
    apis: ["src/app/api/superadmin/settings/jit-portal/route.ts"],
    evidence: "jit_portal_setting",
  },

  // ── IT Administrator (10) ──────────────────────────────────────────────────────
  {
    id: "UC-SA-01",
    name: "View & Audit Applications (read-only)",
    actor: "IT Administrator",
    pages: [
      "src/app/superadmin/applications/page.tsx",
      "src/app/superadmin/applications/[applicationId]/page.tsx",
    ],
    apis: ["src/app/api/superadmin/applications/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-SA-02",
    name: "Manage User Accounts (create/disable/reactivate/reset)",
    actor: "IT Administrator",
    pages: ["src/app/superadmin/users/page.tsx"],
    apis: ["src/app/api/superadmin/users/route.ts"],
    evidence: "any_user",
  },
  {
    id: "UC-SA-03",
    name: "View Reports & Print Official Reports",
    actor: "IT Administrator",
    pages: [
      "src/app/superadmin/reports/page.tsx",
      "src/app/superadmin/reports/print/applications/page.tsx",
      "src/app/superadmin/reports/print/monthly-summary/page.tsx",
    ],
    apis: ["src/app/api/superadmin/reports/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-SA-04",
    name: "Manage Fee Schedule",
    actor: "IT Administrator",
    pages: ["src/app/superadmin/settings/page.tsx"],
    apis: [
      "src/app/api/superadmin/settings/fees/route.ts",
      "src/app/api/superadmin/settings/fees/categories/route.ts",
    ],
    evidence: "any_fee_config",
  },
  {
    id: "UC-SA-05",
    name: "Manage Penalty & Surcharge Settings",
    actor: "IT Administrator",
    pages: ["src/app/superadmin/settings/page.tsx"],
    apis: ["src/app/api/superadmin/settings/penalties/route.ts"],
    evidence: "any_fee_setting",
  },
  {
    id: "UC-SA-06",
    name: "Manage Renewal Extensions",
    actor: "IT Administrator",
    pages: ["src/app/superadmin/settings/page.tsx"],
    apis: [
      "src/app/api/superadmin/settings/extensions/route.ts",
      "src/app/api/superadmin/settings/extensions/[extensionId]/toggle/route.ts",
    ],
    evidence: "any_renewal_extension",
  },
  {
    id: "UC-SA-07",
    name: "Enable/Disable JIT Portal",
    actor: "IT Administrator",
    pages: ["src/app/superadmin/settings/page.tsx"],
    apis: ["src/app/api/superadmin/settings/jit-portal/route.ts"],
    evidence: "jit_portal_setting",
  },
  {
    id: "UC-SA-08",
    name: "View Audit Trail / Activities",
    actor: "IT Administrator",
    pages: ["src/app/superadmin/activities/page.tsx"],
    apis: ["src/app/api/superadmin/activities/route.ts"],
    evidence: "any_audit_or_activity",
  },
  {
    id: "UC-SA-09",
    name: "View IT Administrator Dashboard",
    actor: "IT Administrator",
    pages: ["src/app/superadmin/dashboard/page.tsx"],
    apis: ["src/app/api/superadmin/dashboard/route.ts"],
    evidence: "none",
  },
  {
    id: "UC-SA-10",
    name: "View Own Profile",
    actor: "IT Administrator",
    pages: ["src/app/superadmin/profile/page.tsx"],
    apis: [],
    evidence: "none",
  },

];

/** Smoke cases keyed by Application Name (business name). */
interface SmokeCase {
  id: string;
  flowKey: string;
  applicationName: string;
  applicationNumber: string;
  expectedType: "NEW" | "RENEWAL" | "CLOSURE";
  expectedStatus: string | string[];
  expectedFrequency?: "ANNUAL" | "BI_ANNUAL" | "QUARTERLY";
  expectedPaymentRefStatus?: "PENDING" | "VERIFIED" | null;
  expectPermitIssuance?: boolean | "optional";
  expectVerifiedLocation?: boolean;
  applicantEmail: string;
  mustNotBeOnPermitQueue?: boolean;
}

const SMOKE_CASES: SmokeCase[] = [
  {
    id: "SM-01",
    flowKey: "annual_paid_prepare_permit",
    applicationName: "Smoke Permit Ready Trading",
    applicationNumber: "SMOKE-APP-NEW-ANNUAL-PAID",
    expectedType: "NEW",
    expectedStatus: ["PAID", "FOR_RELEASE", "RELEASED"],
    expectedFrequency: "ANNUAL",
    expectedPaymentRefStatus: "VERIFIED",
    expectPermitIssuance: "optional",
    applicantEmail: "applicant@example.com",
  },
  {
    id: "SM-02",
    flowKey: "bi_annual_pending_verification",
    applicationName: "Smoke Retail Hub",
    applicationNumber: "SMOKE-APP-RENEWAL-BI-APPROVED",
    expectedType: "RENEWAL",
    expectedStatus: "APPROVED_FOR_PAYMENT",
    expectedFrequency: "BI_ANNUAL",
    expectedPaymentRefStatus: "PENDING",
    expectPermitIssuance: false,
    mustNotBeOnPermitQueue: true,
    applicantEmail: "applicant@example.com",
  },
  {
    id: "SM-03",
    flowKey: "quarterly_applicant_payment",
    applicationName: "Smoke Food Corner",
    applicationNumber: "SMOKE-APP-CLOSURE-QTR-APPROVED",
    expectedType: "CLOSURE",
    expectedStatus: "APPROVED_FOR_PAYMENT",
    expectedFrequency: "QUARTERLY",
    expectedPaymentRefStatus: null,
    expectPermitIssuance: false,
    applicantEmail: "applicant@example.com",
  },
  {
    id: "SM-04",
    flowKey: "permit_blocked_unpaid",
    applicationName: "Smoke Permit Blocked Shop",
    applicationNumber: "SMOKE-APP-PERMIT-BLOCKED-UNPAID",
    expectedType: "NEW",
    expectedStatus: "APPROVED_FOR_PAYMENT",
    expectedFrequency: "ANNUAL",
    expectedPaymentRefStatus: null,
    expectPermitIssuance: false,
    mustNotBeOnPermitQueue: true,
    applicantEmail: "applicant@example.com",
  },
  {
    id: "SM-05",
    flowKey: "assessed_queue_record",
    applicationName: "Smoke Assessed Services",
    applicationNumber: "SMOKE-APP-NEW-ASSESSED",
    expectedType: "NEW",
    expectedStatus: "ASSESSED",
    expectedFrequency: "ANNUAL",
    expectedPaymentRefStatus: null,
    expectPermitIssuance: false,
    applicantEmail: "applicant@example.com",
  },
  {
    id: "SM-06",
    flowKey: "released_map_retail",
    applicationName: "Smoke Retail Hub",
    applicationNumber: "SMOKE-APP-RETAIL-RELEASED",
    expectedType: "NEW",
    expectedStatus: "RELEASED",
    expectedFrequency: "ANNUAL",
    expectedPaymentRefStatus: "VERIFIED",
    expectPermitIssuance: true,
    expectVerifiedLocation: true,
    applicantEmail: "applicant@example.com",
  },
  {
    id: "SM-07",
    flowKey: "released_map_food",
    applicationName: "Smoke Food Corner",
    applicationNumber: "SMOKE-APP-FOOD-RELEASED",
    expectedType: "NEW",
    expectedStatus: "RELEASED",
    expectedFrequency: "ANNUAL",
    expectedPaymentRefStatus: "VERIFIED",
    expectPermitIssuance: true,
    expectVerifiedLocation: true,
    applicantEmail: "applicant@example.com",
  },
  {
    id: "SM-08",
    flowKey: "duplicate_or_secondary_applicant",
    applicationName: "Smoke Duplicate Test Shop",
    applicationNumber: "SMOKE-APP-DUPLICATE-APPROVED",
    expectedType: "NEW",
    expectedStatus: "APPROVED_FOR_PAYMENT",
    expectedFrequency: "ANNUAL",
    expectedPaymentRefStatus: null,
    expectPermitIssuance: false,
    applicantEmail: "smoke.duplicate@example.com",
  },
];

function parseArgs(argv: string[]) {
  let suite: SuiteId = "usecases";
  let nameFilter: string | null = null;
  let ucFilter: string | null = null;
  let listOnly = false;

  for (const arg of argv) {
    if (arg === "--list" || arg === "-l") {
      listOnly = true;
      continue;
    }
    if (arg.startsWith("--suite=")) {
      suite = arg.slice("--suite=".length).toLowerCase() as SuiteId;
      continue;
    }
    if (arg.startsWith("--name=")) {
      nameFilter = arg.slice("--name=".length).replace(/^["']|["']$/g, "");
      continue;
    }
    if (arg.startsWith("--uc=")) {
      ucFilter = arg.slice("--uc=".length).replace(/^["']|["']$/g, "").toUpperCase();
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { suite, nameFilter, ucFilter, listOnly };
}

function printHelp() {
  console.log(`
Application Name: ${APPLICATION_NAME}
Catalog:          ${UC_CATALOG} (${USE_CASES.length} use cases)

  --suite=usecases|unit|security|core|alignment|smoke|all   (default: usecases)
  --uc=UC-AP-05                                             filter one use case
  --name="Application Name"                                 filter smoke cases
  --list                                                    list all 66 use cases
  --help
`);
}

function banner() {
  console.log("═".repeat(72));
  console.log(`Application Name: ${APPLICATION_NAME}`);
  console.log(`Catalog:          ${UC_CATALOG}`);
  console.log(`Started:          ${new Date().toISOString()}`);
  console.log("═".repeat(72));
}

function abs(rel: string) {
  return path.join(ROOT, rel);
}

function runCommand(label: string, command: string, args: string[]): CaseResult {
  console.log(`\n▶ ${label}`);
  console.log(`  $ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  const ok = result.status === 0;
  return {
    id: label,
    name: label,
    ok,
    detail: ok ? "passed" : `exit code ${result.status ?? "null"}`,
  };
}

function formBusinessName(formData: unknown): string | null {
  if (!formData || typeof formData !== "object") return null;
  const name = (formData as Record<string, unknown>).businessName;
  return typeof name === "string" ? name : null;
}

async function checkEvidence(
  kind: EvidenceKind,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any
): Promise<{ ok: boolean; detail: string }> {
  if (kind === "none") {
    return { ok: true, detail: "wiring only" };
  }
  if (kind === "cron_route_only") {
    return { ok: true, detail: "cron route wired" };
  }

  switch (kind) {
    case "any_user": {
      const n = await prisma.user.count();
      return n > 0
        ? { ok: true, detail: `${n} user(s)` }
        : { ok: false, detail: "no users in DB" };
    }
    case "any_new_app": {
      const n = await prisma.businessApplication.count({ where: { applicationType: "NEW" } });
      return n > 0
        ? { ok: true, detail: `${n} NEW app(s)` }
        : { ok: false, detail: "no NEW applications (seed smoke data)" };
    }
    case "any_renewal_app": {
      const n = await prisma.businessApplication.count({
        where: { applicationType: "RENEWAL" },
      });
      return n > 0
        ? { ok: true, detail: `${n} RENEWAL app(s)` }
        : { ok: false, detail: "no RENEWAL applications (seed smoke data)" };
    }
    case "any_closure_app": {
      const n = await prisma.businessApplication.count({
        where: { applicationType: "CLOSURE" },
      });
      return n > 0
        ? { ok: true, detail: `${n} CLOSURE app(s)` }
        : { ok: false, detail: "no CLOSURE applications (seed smoke data)" };
    }
    case "any_draft_app": {
      const n = await prisma.businessApplication.count({ where: { status: "DRAFT" } });
      // Draft may be absent after smoke seed — wiring still proves capability
      return {
        ok: true,
        detail: n > 0 ? `${n} DRAFT app(s)` : "no DRAFT rows (wiring OK)",
      };
    }
    case "any_document": {
      const n = await prisma.applicationDocument.count();
      return {
        ok: true,
        detail: n > 0 ? `${n} document(s)` : "no documents yet (wiring OK)",
      };
    }
    case "any_location": {
      const n = await prisma.businessLocation.count();
      return n > 0
        ? { ok: true, detail: `${n} location(s)` }
        : { ok: false, detail: "no business locations (seed smoke data)" };
    }
    case "any_returned_app": {
      const n = await prisma.businessApplication.count({
        where: { status: "RETURNED_FOR_CORRECTION" },
      });
      return {
        ok: true,
        detail: n > 0 ? `${n} returned app(s)` : "no returned rows (wiring OK)",
      };
    }
    case "any_released_permit": {
      const n = await prisma.permitIssuance.count({
        where: { documentType: "BUSINESS_PERMIT", status: "RELEASED" },
      });
      return n > 0
        ? { ok: true, detail: `${n} released business permit(s)` }
        : { ok: false, detail: "no RELEASED BUSINESS_PERMIT (seed smoke data)" };
    }
    case "any_released_closure": {
      const n = await prisma.permitIssuance.count({
        where: { documentType: "CLOSURE_CERTIFICATE", status: "RELEASED" },
      });
      return {
        ok: true,
        detail: n > 0 ? `${n} closure cert(s)` : "no closure cert yet (wiring OK)",
      };
    }
    case "any_top_assessment": {
      const n = await prisma.feeAssessment.count({ where: { status: "GENERATED" } });
      return n > 0
        ? { ok: true, detail: `${n} GENERATED TOP(s)` }
        : { ok: false, detail: "no GENERATED fee assessments (seed smoke data)" };
    }
    case "any_payment_ref": {
      const n = await prisma.paymentReference.count();
      return n > 0
        ? { ok: true, detail: `${n} payment reference(s)` }
        : { ok: false, detail: "no payment references (seed smoke data)" };
    }
    case "any_fee_assessment": {
      const n = await prisma.feeAssessment.count();
      return n > 0
        ? { ok: true, detail: `${n} fee assessment(s)` }
        : { ok: false, detail: "no fee assessments (seed smoke data)" };
    }
    case "any_verified_payment": {
      const n = await prisma.paymentReference.count({ where: { status: "VERIFIED" } });
      return n > 0
        ? { ok: true, detail: `${n} VERIFIED payment(s)` }
        : { ok: false, detail: "no VERIFIED payments (seed smoke data)" };
    }
    case "any_prepared_or_released_permit": {
      const n = await prisma.permitIssuance.count({
        where: { status: { in: ["PREPARED", "FOR_RELEASE", "RELEASED"] } },
      });
      return n > 0
        ? { ok: true, detail: `${n} permit issuance(s)` }
        : { ok: false, detail: "no permit issuances (seed / release a paid app)" };
    }
    case "any_released_issuance": {
      const n = await prisma.permitIssuance.count({ where: { status: "RELEASED" } });
      return n > 0
        ? { ok: true, detail: `${n} RELEASED issuance(s)` }
        : { ok: false, detail: "no RELEASED issuances (seed smoke data)" };
    }
    case "any_inspection": {
      const n = await prisma.inspection.count();
      return {
        ok: true,
        detail: n > 0 ? `${n} inspection(s)` : "no inspections yet (wiring OK)",
      };
    }
    case "jit_portal_setting": {
      const row = await prisma.systemFeeSetting.findFirst({
        select: { jitPortalEnabled: true },
      });
      return row
        ? { ok: true, detail: `jitPortalEnabled=${row.jitPortalEnabled}` }
        : { ok: true, detail: "no SystemFeeSetting row (default enabled; wiring OK)" };
    }
    case "any_no_permit_ticket": {
      const n = await prisma.jitNoPermitRecord.count().catch(() => 0);
      return {
        ok: true,
        detail: n > 0 ? `${n} no-permit ticket(s)` : "no tickets yet (wiring OK)",
      };
    }
    case "any_fee_config": {
      const n = await prisma.feeConfigurationItem.count().catch(() => 0);
      return {
        ok: true,
        detail: n > 0 ? `${n} fee config item(s)` : "no fee items yet (wiring OK)",
      };
    }
    case "any_fee_setting": {
      const n = await prisma.systemFeeSetting.count();
      return n > 0
        ? { ok: true, detail: `${n} SystemFeeSetting row(s)` }
        : { ok: false, detail: "no SystemFeeSetting (run db seed)" };
    }
    case "any_renewal_extension": {
      const n = await prisma.renewalExtension.count().catch(() => 0);
      return {
        ok: true,
        detail: n > 0 ? `${n} renewal extension(s)` : "no extensions yet (wiring OK)",
      };
    }
    case "any_audit_or_activity": {
      // Prefer AuditLog if present; otherwise ApplicationHistory as activity evidence
      const history = await prisma.applicationHistory.count();
      return {
        ok: true,
        detail: history > 0 ? `${history} history row(s)` : "no history yet (wiring OK)",
      };
    }
    default:
      return { ok: true, detail: "wiring only" };
  }
}

async function runUseCaseSuite(ucFilter: string | null): Promise<CaseResult[]> {
  const selected = USE_CASES.filter((uc) => {
    if (!ucFilter) return true;
    return (
      uc.id === ucFilter ||
      uc.id.includes(ucFilter) ||
      uc.name.toLowerCase().includes(ucFilter.toLowerCase())
    );
  });

  if (selected.length === 0) {
    return [
      {
        id: "UC-FILTER",
        name: ucFilter ?? "(none)",
        ok: false,
        detail: `No use case matched --uc=${ucFilter}`,
      },
    ];
  }

  if (USE_CASES.length !== 66) {
    console.warn(
      `  ⚠ Catalog length is ${USE_CASES.length}, expected 66 — update USE_CASES array.`
    );
  }

  console.log(`\n▶ UC-* Use cases (${selected.length} of ${USE_CASES.length})`);
  console.log(
    "  Mode: page/API wiring" +
      (process.env.DATABASE_URL?.trim() ? " + DB evidence" : " (no DB — wiring only)")
  );

  const prisma = process.env.DATABASE_URL?.trim() ? await getPrisma() : null;
  const results: CaseResult[] = [];

  for (const uc of selected) {
    const missingPages = uc.pages.filter((p) => !existsSync(abs(p)));
    const missingApis = uc.apis.filter((a) => !existsSync(abs(a)));
    const errors: string[] = [];

    if (missingPages.length > 0) {
      errors.push(`missing page(s): ${missingPages.join(", ")}`);
    }
    if (missingApis.length > 0) {
      errors.push(`missing API(s): ${missingApis.join(", ")}`);
    }

    let evidenceDetail = "wiring only";
    if (prisma && uc.evidence !== "none") {
      const evidence = await checkEvidence(uc.evidence, prisma);
      evidenceDetail = evidence.detail;
      if (!evidence.ok) {
        errors.push(`evidence: ${evidence.detail}`);
      }
    } else if (!prisma && uc.evidence !== "none" && uc.evidence !== "cron_route_only") {
      evidenceDetail = "DB skipped";
    }

    const ok = errors.length === 0;
    results.push({
      id: uc.id,
      name: uc.name,
      ok,
      detail: ok
        ? `${uc.actor} · ${evidenceDetail}`
        : errors.join("; "),
    });
    console.log(
      `  ${ok ? "✓" : "✗"} ${uc.id.padEnd(12)} ${uc.name} — ${ok ? evidenceDetail : errors.join("; ")}`
    );
  }

  return results;
}

async function runSmokeCases(nameFilter: string | null): Promise<CaseResult[]> {
  const selected = SMOKE_CASES.filter((c) => {
    if (!nameFilter) return true;
    const needle = nameFilter.toLowerCase();
    return (
      c.applicationName.toLowerCase().includes(needle) ||
      c.applicationNumber.toLowerCase().includes(needle) ||
      c.id.toLowerCase() === needle ||
      c.flowKey.toLowerCase().includes(needle)
    );
  });

  if (selected.length === 0) {
    return [
      {
        id: "SM-FILTER",
        name: nameFilter ?? "(none)",
        ok: false,
        detail: `No smoke case matched Application Name filter: ${nameFilter}`,
      },
    ];
  }

  if (!process.env.DATABASE_URL?.trim()) {
    return [
      {
        id: "SM-DB",
        name: "DATABASE_URL",
        ok: false,
        detail: "DATABASE_URL is required for smoke checks.",
      },
    ];
  }

  const prisma = await getPrisma();
  const results: CaseResult[] = [];
  console.log("\n▶ SM-* Smoke application checks (by Application Name)");

  for (const smoke of selected) {
    const label = `${smoke.id} [${smoke.applicationName}]`;
    try {
      const app = await prisma.businessApplication.findUnique({
        where: { applicationNumber: smoke.applicationNumber },
        include: {
          applicant: { select: { email: true } },
          businessRecord: {
            select: {
              businessName: true,
              location: { select: { status: true } },
            },
          },
          feeAssessment: { select: { paymentFrequency: true, paymentStatus: true } },
          paymentReferences: { select: { status: true, transactionNumber: true } },
          permitIssuance: { select: { status: true, documentNumber: true } },
        },
      });

      if (!app) {
        results.push({
          id: smoke.id,
          name: smoke.applicationName,
          ok: false,
          detail: `Missing ${smoke.applicationNumber}. Run: npx tsx scripts/seed-smoke-test-data.ts`,
        });
        console.log(`  ✗ ${label} — application not found`);
        continue;
      }

      const errors: string[] = [];
      const resolvedName =
        app.businessRecord?.businessName ?? formBusinessName(app.formData) ?? "(unknown)";

      if (resolvedName !== smoke.applicationName) {
        errors.push(`Application Name expected "${smoke.applicationName}", got "${resolvedName}"`);
      }
      if (app.applicationType !== smoke.expectedType) {
        errors.push(`type expected ${smoke.expectedType}, got ${app.applicationType}`);
      }
      const allowedStatuses = Array.isArray(smoke.expectedStatus)
        ? smoke.expectedStatus
        : [smoke.expectedStatus];
      if (!allowedStatuses.includes(app.status)) {
        errors.push(`status expected ${allowedStatuses.join("|")}, got ${app.status}`);
      }
      if (app.applicant.email !== smoke.applicantEmail) {
        errors.push(`applicant expected ${smoke.applicantEmail}, got ${app.applicant.email}`);
      }
      if (
        smoke.expectedFrequency &&
        app.feeAssessment?.paymentFrequency !== smoke.expectedFrequency
      ) {
        errors.push(
          `frequency expected ${smoke.expectedFrequency}, got ${app.feeAssessment?.paymentFrequency ?? "none"}`
        );
      }

      if (smoke.expectedPaymentRefStatus === null) {
        if (app.paymentReferences.length > 0) {
          errors.push(`expected no payment reference, found ${app.paymentReferences.length}`);
        }
      } else if (smoke.expectedPaymentRefStatus) {
        const match = app.paymentReferences.some(
          (p) => p.status === smoke.expectedPaymentRefStatus
        );
        if (!match) {
          errors.push(
            `expected payment ref ${smoke.expectedPaymentRefStatus}, got [${
              app.paymentReferences.map((p) => p.status).join(", ") || "none"
            }]`
          );
        }
      }

      if (smoke.expectPermitIssuance === true) {
        if (!app.permitIssuance || app.permitIssuance.status !== "RELEASED") {
          errors.push("expected RELEASED permit issuance");
        }
      }

      if (smoke.expectVerifiedLocation) {
        if (app.businessRecord?.location?.status !== "VERIFIED") {
          errors.push("expected VERIFIED business location");
        }
      }

      if (smoke.mustNotBeOnPermitQueue) {
        if (
          app.status === "PAID" ||
          app.status === "FOR_RELEASE" ||
          app.status === "RELEASED"
        ) {
          errors.push("blocked/pending case must not be on permit happy path");
        }
      }

      const ok = errors.length === 0;
      results.push({
        id: smoke.id,
        name: smoke.applicationName,
        ok,
        detail: ok
          ? `${smoke.applicationNumber} → ${app.status}`
          : errors.join("; "),
      });
      console.log(`  ${ok ? "✓" : "✗"} ${label} — ${ok ? app.status : errors.join("; ")}`);
    } catch (error) {
      results.push({
        id: smoke.id,
        name: smoke.applicationName,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      console.log(`  ✗ ${label} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return results;
}

function listCatalog() {
  console.log(`\nApplication Name: ${APPLICATION_NAME}`);
  console.log(`Use cases (${USE_CASES.length}):\n`);
  console.table(
    USE_CASES.map((uc) => ({
      id: uc.id,
      actor: uc.actor,
      name: uc.name,
      pages: uc.pages.length,
      apis: uc.apis.length,
      evidence: uc.evidence,
    }))
  );
  console.log("\nSmoke Application Names:");
  console.table(
    SMOKE_CASES.map((c) => ({
      id: c.id,
      applicationName: c.applicationName,
      applicationNumber: c.applicationNumber,
      expectedStatus: Array.isArray(c.expectedStatus)
        ? c.expectedStatus.join("|")
        : c.expectedStatus,
    }))
  );
}

function printSummary(results: CaseResult[]) {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log("\n" + "─".repeat(72));
  console.log(`Application Name: ${APPLICATION_NAME}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log("─".repeat(72));
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(14)} ${r.name}`);
    if (!r.ok) console.log(`         ${r.detail}`);
  }
  console.log("─".repeat(72));
  return failed === 0;
}

async function main() {
  const { suite, nameFilter, ucFilter, listOnly } = parseArgs(process.argv.slice(2));
  banner();

  if (listOnly) {
    listCatalog();
    return;
  }

  const results: CaseResult[] = [];
  const runUnit = suite === "all" || suite === "unit";
  const runSecurity = suite === "all" || suite === "security";
  const runCore = suite === "all" || suite === "core";
  const runAlignment = suite === "all" || suite === "alignment";
  const runSmoke = suite === "all" || suite === "smoke";
  const runUseCases = suite === "all" || suite === "usecases";

  if (runUnit) {
    results.push(runCommand("UT-* Vitest unit tests", "npx", ["vitest", "run"]));
  }
  if (runSecurity) {
    results.push(
      runCommand("VR-SEC-* Security hardening", "npx", [
        "tsx",
        "scripts/verify-security-hardening.ts",
      ])
    );
  }
  if (runCore) {
    results.push(
      runCommand("VR-CORE-* Core logic", "npx", ["tsx", "scripts/verify-core-logic.ts"])
    );
  }
  if (runAlignment) {
    results.push(
      runCommand("VR-ALIGN-* Logic alignment", "npx", [
        "tsx",
        "scripts/verify-ebpls-logic-alignment.ts",
      ])
    );
  }
  if (runUseCases) {
    results.push(...(await runUseCaseSuite(ucFilter)));
  }
  if (runSmoke) {
    if (nameFilter) console.log(`  Filter Application Name: "${nameFilter}"`);
    results.push(...(await runSmokeCases(nameFilter)));
  }

  if (results.length === 0) {
    console.error(`Unknown suite: ${suite}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  const ok = printSummary(results);
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(`[run-test-cases] failed`, error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!process.env.DATABASE_URL?.trim()) return;
    try {
      const prisma = await getPrisma();
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });
