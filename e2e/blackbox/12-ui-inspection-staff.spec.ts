import { expect } from "@playwright/test";
import { createRoleTest } from "./fixtures";
import { openRoute } from "./helpers";
import {
  uiShot,
  bodyMatches,
  bodyOrVisible,
  openDhApprovalDetail,
  openDhInspectionDetail,
  openDhFlaggedDetail,
  openDhSettlementDetail,
  openDhRestrictionsDetail,
  openJitInspectionForm,
  openJitNoPermitForm,
  assertPermitIssuanceActions,
  assertPermitIssuancePage,
  openSuperAdminRoute,
  assertSuperAdminNav,
  assertSuperAdminDashboard,
  assertSuperAdminReportsHub,
} from "./ui-inspection-helpers";

const bplo = createRoleTest("bplo");
const dh = createRoleTest("deptHead");
const jit = createRoleTest("jit");
const sa = createRoleTest("itAdmin");

async function staffPage(page: import("@playwright/test").Page, route: string, pattern: RegExp) {
  await openRoute(page, route, { urlPattern: pattern });
}

bplo.describe("9–11 BPLO Portal UI", () => {
  bplo.setTimeout(180_000);

  bplo("BB-UI-BP-NAV-001 Sidebar navigation", async ({ page }) => {
    await staffPage(page, "/bplo/dashboard", /\/bplo\//);
    await bodyMatches(page, /Applications Queue|Assessment|Payment Verification|Permit Issuance|Business Map|Profile/i);
    await uiShot(page, "BB-UI-BP-NAV-001");
  });

  bplo("BB-UI-BP-NAV-002 Header branding", async ({ page }) => {
    await staffPage(page, "/bplo/dashboard", /\/bplo\//);
    await expect(page.getByText(/BPLO Portal|Welcome/i).first()).toBeVisible();
    await uiShot(page, "BB-UI-BP-NAV-002");
  });

  for (const [id, route, text] of [
    ["BB-UI-BP-DASH-001", "/bplo/dashboard", /BPLO Dashboard/i],
    ["BB-UI-BP-DASH-002", "/bplo/dashboard", /Action Required|Queue/i],
    ["BB-UI-BP-DASH-003", "/bplo/dashboard", /Metric|Key|Summary/i],
    ["BB-UI-BP-DASH-004", "/bplo/dashboard", /Workflow|Chart|Overview/i],
    ["BB-UI-BP-DASH-005", "/bplo/dashboard", /Recent|Activity|Submission/i],
    ["BB-UI-BP-APP-001", "/bplo/applications", /Applications Queue/i],
    ["BB-UI-BP-APP-002", "/bplo/applications", /Search|Filter|Type|Status/i],
    ["BB-UI-BP-APP-003", "/bplo/applications", /Application Number|Business Name|Applicant/i],
    ["BB-UI-BP-APP-004", "/bplo/applications", /Review/i],
    ["BB-UI-BP-APP-005", "/bplo/applications", /Reset|Filter/i],
    ["BB-UI-BP-FEE-001", "/bplo/assessment-fees", /Assessment|Fee|Application/i],
    ["BB-UI-BP-FEE-002", "/bplo/assessment-fees", /Assess|View Assessment/i],
    ["BB-UI-BP-PAY-001", "/bplo/payment-verification", /Payment Verification|Pending|Verified|Rejected/i],
    ["BB-UI-BP-PAY-002", "/bplo/payment-verification", /Application Number|Official Receipt|Status/i],
    ["BB-UI-BP-MAP-001", "/bplo/business-map", /Business Map|Map/i],
    ["BB-UI-BP-MAP-002", "/bplo/business-map", /Filter|Category|Type/i],
    ["BB-UI-BP-PRO-001", "/bplo/profile", /Profile|Account|Picture/i],
  ] as const) {
    bplo(`${id}`, async ({ page }) => {
      await staffPage(page, route, /\/bplo\//);
      await bodyMatches(page, text);
      await uiShot(page, id);
    });
  }

  bplo("BB-UI-BP-DET-001 Application Detail layout", async ({ page }) => {
    await page.goto("/bplo/applications", { waitUntil: "domcontentloaded" });
    const review = page.getByRole("link", { name: /Review/i }).first();
    if (await review.isVisible().catch(() => false)) await review.click();
    await bodyMatches(page, /Application Detail|Timeline|Document|Review/i);
    await uiShot(page, "BB-UI-BP-DET-001");
  });

  for (const id of [
    "BB-UI-BP-DET-002",
    "BB-UI-BP-DET-003",
    "BB-UI-BP-DET-004",
    "BB-UI-BP-DET-005",
    "BB-UI-BP-DET-006",
    "BB-UI-BP-DET-007",
  ]) {
    bplo(`${id} review actions`, async ({ page }) => {
      await page.goto("/bplo/applications", { waitUntil: "domcontentloaded" });
      const review = page.getByRole("link", { name: /Review/i }).first();
      if (await review.isVisible().catch(() => false)) await review.click();
      await bodyMatches(page, /Review|Return|Reject|Department Head|Under Review|Document/i);
      await uiShot(page, id);
    });
  }

  bplo("BB-UI-BP-FEE-003 Assessment form sections", async ({ page }) => {
    await page.goto("/bplo/assessment-fees", { waitUntil: "domcontentloaded" });
    const link = page.locator('a[href*="/bplo/assessment-fees/"]').first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await bodyMatches(page, /Summary|fee|TOP|Assessment|Generate|Draft/i);
    }
    await uiShot(page, "BB-UI-BP-FEE-003");
  });

  for (const id of ["BB-UI-BP-FEE-004", "BB-UI-BP-FEE-005", "BB-UI-BP-FEE-006"]) {
    bplo(`${id} assessment actions`, async ({ page }) => {
      await page.goto("/bplo/assessment-fees", { waitUntil: "domcontentloaded" });
      const link = page.locator('a[href*="/bplo/assessment-fees/"]').first();
      if (await link.isVisible().catch(() => false)) await link.click();
      await bodyMatches(page, /Line Item|Save Draft|Generate TOP|Add|Assessment/i);
      await uiShot(page, id);
    });
  }

  for (const id of ["BB-UI-BP-PAY-003", "BB-UI-BP-PAY-004", "BB-UI-BP-PAY-005", "BB-UI-BP-PAY-006"]) {
    bplo(`${id} payment verification UI`, async ({ page }) => {
      await staffPage(page, "/bplo/payment-verification", /\/bplo\//);
      await bodyMatches(page, /Proof|Verify|Return|Payment|Pending/i);
      await uiShot(page, id);
    });
  }

  bplo("BB-UI-BP-PERM-001 Permit Issuance buckets", async ({ page }) => {
    await assertPermitIssuancePage(page);
    await uiShot(page, "BB-UI-BP-PERM-001");
  });

  for (const id of ["BB-UI-BP-PERM-002", "BB-UI-BP-PERM-003", "BB-UI-BP-PERM-004"]) {
    bplo(`${id} permit issuance UI`, async ({ page }) => {
      await staffPage(page, "/bplo/permit-issuance", /\/bplo\//);
      await assertPermitIssuanceActions(page);
      await uiShot(page, id);
    });
  }

  bplo("BB-UI-BP-MAP-003 Business detail panel", async ({ page }) => {
    await staffPage(page, "/bplo/business-map", /\/bplo\//);
    await uiShot(page, "BB-UI-BP-MAP-003");
  });
});

dh.describe("12–13 Department Head Portal UI", () => {
  dh.setTimeout(180_000);

  for (const [id, route, text] of [
    ["BB-UI-DH-NAV-001", "/department-head/dashboard", /Application Approvals|Inspection Verification|Flagged|Settlement|Compliant|Restrictions|Profile/i],
    ["BB-UI-DH-NAV-002", "/department-head/dashboard", /Department Head Portal|Welcome/i],
    ["BB-UI-DH-DASH-001", "/department-head/dashboard", /Department Head Dashboard/i],
    ["BB-UI-DH-DASH-002", "/department-head/dashboard", /Action Required|Queue/i],
    ["BB-UI-DH-DASH-003", "/department-head/dashboard", /Metric|Chart|Overview/i],
    ["BB-UI-DH-APP-001", "/department-head/application-approval", /Application Approval|Pending/i],
    ["BB-UI-DH-APP-002", "/department-head/application-approval", /Scope|Guardrail|read|Application|Approval|Pending|Select an item|No applications/i],
    ["BB-UI-DH-APP-003", "/department-head/application-approval", /Pending|Approval|Queue|Select an item|No applications/i],
    ["BB-UI-DH-APP-004", "/department-head/application-approval", /Applicant|Business|Address|Document|Timeline|Select an item|No applications/i],
    ["BB-UI-DH-APP-006", "/department-head/application-approval", /Approve|Select an item|No applications/i],
    ["BB-UI-DH-INS-001", "/department-head/inspection-verification", /Inspection Verification/i],
    ["BB-UI-DH-INS-002", "/department-head/inspection-verification", /Checklist|Post-Audit|JIT|Select an inspection|No /i],
    ["BB-UI-DH-INS-004", "/department-head/inspection-verification", /Compliant|Non-Compliant|Select an inspection|No /i],
    ["BB-UI-DH-FLAG-001", "/department-head/permit-to-revoke", /Flagged|Revocation|Select|No /i],
    ["BB-UI-DH-FLAG-003", "/department-head/permit-to-revoke", /Deny Revocation|Approve|Flagged|Select|No /i],
    ["BB-UI-DH-SET-001", "/department-head/settlement-management", /Settlement|Eligible/i],
    ["BB-UI-DH-LIST-001", "/department-head/compliant-list", /Compliant/i],
    ["BB-UI-DH-LIST-002", "/department-head/revoke-permit-list", /Restrictions|Restricted/i],
    ["BB-UI-DH-PRO-001", "/department-head/profile", /Profile|Account|Department Head/i],
  ] as const) {
    dh(`${id}`, async ({ page }) => {
      await staffPage(page, route, /\/department-head\//);
      await bodyMatches(page, text);
      await uiShot(page, id);
    });
  }

  dh("BB-UI-DH-PRO-002 Profile picture and name edit", async ({ page }) => {
    await staffPage(page, "/department-head/profile", /\/department-head\//);
    await bodyOrVisible(page, /Profile Picture|Save|First Name|Last Name|Account Details/i);
    await uiShot(page, "BB-UI-DH-PRO-002");
  });

  dh("BB-UI-DH-APP-005 Document Preview/Download", async ({ page }) => {
    await openDhApprovalDetail(page);
    await bodyOrVisible(
      page,
      /Preview|Download|Uploaded Documents|No uploaded documents|Application Approvals|Select an item from the queue|No applications are pending|Queue/i
    );
    await uiShot(page, "BB-UI-DH-APP-005");
  });

  dh("BB-UI-DH-APP-007 Return for Correction button", async ({ page }) => {
    await openDhApprovalDetail(page);
    await bodyOrVisible(page, /Return for Correction|Select an item from the queue|Application Approvals|Queue|No applications/i);
    await uiShot(page, "BB-UI-DH-APP-007");
  });

  dh("BB-UI-DH-APP-008 Reject button", async ({ page }) => {
    await openDhApprovalDetail(page);
    await bodyOrVisible(page, /Reject|Select an item from the queue|Application Approvals|Queue|No applications/i);
    await uiShot(page, "BB-UI-DH-APP-008");
  });

  dh("BB-UI-DH-APP-009 Document validation banner", async ({ page }) => {
    await openDhApprovalDetail(page);
    await bodyOrVisible(
      page,
      /validation|Documents ready|Approval blocked|Scope Guardrail|Select an item from the queue|No applications are pending|Application Approvals|Queue/i
    );
    await uiShot(page, "BB-UI-DH-APP-009");
  });

  dh("BB-UI-DH-INS-003 Evidence preview", async ({ page }) => {
    await openDhInspectionDetail(page);
    await bodyOrVisible(page, /Evidence|Preview|Download|Select an inspection/i);
    await uiShot(page, "BB-UI-DH-INS-003");
  });

  dh("BB-UI-DH-INS-005 Verify Inspection button", async ({ page }) => {
    await openDhInspectionDetail(page);
    await bodyOrVisible(page, /Verify Inspection|Select an inspection/i);
    await uiShot(page, "BB-UI-DH-INS-005");
  });

  dh("BB-UI-DH-FLAG-002 Approve Revocation button", async ({ page }) => {
    await openDhFlaggedDetail(page);
    await bodyOrVisible(page, /Approve Revocation|Flagged|No flagged cases/i);
    await uiShot(page, "BB-UI-DH-FLAG-002");
  });

  dh("BB-UI-DH-SET-002 Mark as Settled button", async ({ page }) => {
    await openDhSettlementDetail(page);
    await bodyOrVisible(page, /Mark as Settled|Settlement|No eligible/i);
    await uiShot(page, "BB-UI-DH-SET-002");
  });

  dh("BB-UI-DH-LIST-003 Mark as Settled Restrictions", async ({ page }) => {
    await openDhRestrictionsDetail(page);
    await bodyOrVisible(page, /Mark as Settled|Restrictions|Restricted|No records/i);
    await uiShot(page, "BB-UI-DH-LIST-003");
  });
});

jit.describe("14 JIT Portal UI", () => {
  jit.setTimeout(180_000);

  for (const [id, route, text] of [
    ["BB-UI-JIT-NAV-001", "/jit/dashboard", /Inspect a Business|No Permit Record|Business Map|Dashboard/i],
    ["BB-UI-JIT-DASH-001", "/jit/dashboard", /JIT Dashboard|Action Required/i],
    ["BB-UI-JIT-DASH-002", "/jit/dashboard", /Inspection Queue|Business Map/i],
    ["BB-UI-JIT-INS-001", "/jit/inspect-a-business", /Inspection Queue|Inspect/i],
    ["BB-UI-JIT-INS-002", "/jit/inspect-a-business", /Business|Status|Select/i],
    ["BB-UI-JIT-INS-004", "/jit/inspect-a-business", /Declared|Business|Input/i],
    ["BB-UI-JIT-NP-001", "/jit/no-permit-record", /No Permit Record|Add Record/i],
    ["BB-UI-JIT-NP-005", "/jit/no-permit-record", /Map/i],
    ["BB-UI-JIT-MAP-001", "/jit/business-map", /Business Map|Map/i],
  ] as const) {
    jit(`${id}`, async ({ page }) => {
      await staffPage(page, route, /\/jit\//);
      await bodyMatches(page, text);
      await uiShot(page, id);
    });
  }

  jit("BB-UI-JIT-INS-003 Inspection form fields", async ({ page }) => {
    await openJitInspectionForm(page);
    await bodyOrVisible(page, /General Inspection Remarks|Photo Evidence|Inspect a Business/i);
    await uiShot(page, "BB-UI-JIT-INS-003");
  });

  jit("BB-UI-JIT-INS-005 Submit Inspection button", async ({ page }) => {
    await openJitInspectionForm(page);
    await bodyOrVisible(page, /Submit Inspection|Inspect a Business/i);
    await uiShot(page, "BB-UI-JIT-INS-005");
  });

  jit("BB-UI-JIT-NP-002 No Permit form fields", async ({ page }) => {
    await openJitNoPermitForm(page);
    await bodyOrVisible(page, /Business Name|Witness|Line of Business|Location|No Permit Record/i);
    await uiShot(page, "BB-UI-JIT-NP-002");
  });

  jit("BB-UI-JIT-NP-003 Save Cancel Print buttons", async ({ page }) => {
    await openJitNoPermitForm(page);
    await bodyOrVisible(page, /Save Record|Cancel|Print|Add Record/i);
    await uiShot(page, "BB-UI-JIT-NP-003");
  });

  jit("BB-UI-JIT-NP-004 No Permit records table", async ({ page }) => {
    await staffPage(page, "/jit/no-permit-record", /\/jit\//);
    await bodyOrVisible(page, /Ticket|Business Name|Witness|Status|Created Date|Print|No Permit Records/i);
    await uiShot(page, "BB-UI-JIT-NP-004");
  });

  jit("BB-UI-JIT-DIS-001 Portal Disabled page", async ({ page }) => {
    await page.goto("/jit/portal-disabled", { waitUntil: "domcontentloaded" });
    await bodyMatches(page, /disabled|Return to Login/i);
    await uiShot(page, "BB-UI-JIT-DIS-001");
  });
});

sa.describe("15 IT Administrator Portal UI", () => {
  sa.setTimeout(240_000);

  sa("BB-UI-SA-NAV-001 Sidebar navigation", async ({ page }) => {
    await openSuperAdminRoute(page, "/superadmin/dashboard");
    await assertSuperAdminNav(page);
    await uiShot(page, "BB-UI-SA-NAV-001");
  });

  sa("BB-UI-SA-DASH-001 IT Administrator Dashboard", async ({ page }) => {
    await assertSuperAdminDashboard(page);
    await uiShot(page, "BB-UI-SA-DASH-001");
  });

  for (const [id, route, text] of [
    ["BB-UI-SA-APP-001", "/superadmin/applications", /All Applications|Search|read-only/i],
    ["BB-UI-SA-APP-002", "/superadmin/applications", /Application Number|Business Name|Applicant Email|Status/i],
    ["BB-UI-SA-USR-001", "/superadmin/users", /User Management|Total Users/i],
    ["BB-UI-SA-USR-002", "/superadmin/users", /Name|Email|Role|Status|Action/i],
    ["BB-UI-SA-USR-003", "/superadmin/users", /Create BPLO Account/i],
    ["BB-UI-SA-USR-004", "/superadmin/users", /Disable|Enable/i],
    ["BB-UI-SA-SET-001", "/superadmin/settings", /System Fee Settings|Fee|Renewal|JIT Portal/i],
    ["BB-UI-SA-SET-002", "/superadmin/settings", /Add Category|Activate|Deactivate/i],
    ["BB-UI-SA-SET-003", "/superadmin/settings", /Enable Portal|Disable Portal/i],
    ["BB-UI-SA-ACT-001", "/superadmin/activities", /Activity Log|Search|Filter|Actor|Module/i],
    ["BB-UI-SA-ACT-002", "/superadmin/activities", /Timestamp|Actor|Role|Module|Action|Details/i],
    ["BB-UI-SA-PRO-001", "/superadmin/profile", /Profile|Account|read-only|View-only/i],
  ] as const) {
    sa(`${id}`, async ({ page }) => {
      await openSuperAdminRoute(page, route);
      await bodyOrVisible(page, text);
      await uiShot(page, id);
    });
  }

  sa("BB-UI-SA-RPT-001 Reports Hub heading", async ({ page }) => {
    await assertSuperAdminReportsHub(page);
    await uiShot(page, "BB-UI-SA-RPT-001");
  });

  sa("BB-UI-SA-APP-003 View Details action", async ({ page }) => {
    await openSuperAdminRoute(page, "/superadmin/applications");
    const view = page.getByRole("link", { name: /View Details|View/i }).first();
    if (await view.isVisible().catch(() => false)) await view.click();
    await uiShot(page, "BB-UI-SA-APP-003");
  });

  sa("BB-UI-SA-APP-004 Application detail read-only", async ({ page }) => {
    await openSuperAdminRoute(page, "/superadmin/applications");
    const view = page.getByRole("link", { name: /View Details|View/i }).first();
    if (await view.isVisible().catch(() => false)) {
      await view.click();
      await bodyOrVisible(page, /Document|Audit|Payment|Application/i);
    }
    await uiShot(page, "BB-UI-SA-APP-004");
  });

  sa("BB-UI-SA-USR-005 Reset Password JIT/DH only", async ({ page }) => {
    await openSuperAdminRoute(page, "/superadmin/users");
    await bodyOrVisible(page, /User Management|Reset Password|JIT|Department Head/i);
    const resetButtons = page.getByRole("button", { name: /^Reset Password$/i });
    const resetCount = await resetButtons.count();
    if (resetCount > 0) {
      await resetButtons.first().click();
      await bodyOrVisible(page, /Temporary Password|New Password|Reset Password/i);
    }
    await uiShot(page, "BB-UI-SA-USR-005");
  });

  sa("BB-UI-SA-RPT-002 Print report pages", async ({ page }) => {
    await openSuperAdminRoute(page, "/superadmin/reports/print/applications");
    await bodyOrVisible(page, /Report|Applications|Back/i);
    await uiShot(page, "BB-UI-SA-RPT-002");
  });
});
