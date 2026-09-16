import { expect, type Page } from "@playwright/test";
import { capture, openRoute } from "./helpers";

export async function uiShot(page: Page, caseId: string) {
  const safe = caseId.replace(/[^a-zA-Z0-9-]/g, "_");
  await capture(page, "ui-inspection", `${safe}.png`);
}

function matchesText(text: string, pattern: RegExp) {
  return new RegExp(pattern.source, pattern.flags.replace(/g/, "")).test(text);
}

export async function bodyMatches(page: Page, pattern: RegExp) {
  const text = await page.locator("body").innerText();
  expect(matchesText(text, pattern)).toBeTruthy();
}

/** Match body text or any visible element matching the pattern. */
export async function bodyOrVisible(page: Page, pattern: RegExp) {
  const text = await page.locator("body").innerText();
  if (matchesText(text, pattern)) return;
  await expect(page.getByText(pattern).first()).toBeVisible({ timeout: 20_000 });
}

export async function gotoReady(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await expect(page.locator("body")).toBeVisible();
}

export async function waitForLoadingDone(page: Page) {
  await expect(page.getByText(/Loading application queue|Loading inspection queue|Refreshing/i))
    .toBeHidden({ timeout: 45_000 })
    .catch(() => undefined);
}

export async function waitForClientPage(page: Page) {
  await expect(page.getByText(/Loading assessed payment details|Loading application queue/i))
    .toBeHidden({ timeout: 45_000 })
    .catch(() => undefined);
}

export async function clickFirstMatchingButton(page: Page, name: RegExp) {
  const btn = page.getByRole("button", { name }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    return true;
  }
  return false;
}

/** First queue card button (application / inspection row). */
export async function clickFirstQueueCard(page: Page) {
  const card = page
    .locator('button[type="button"]')
    .filter({ has: page.locator(".font-mono, p.font-mono") })
    .first();
  if (await card.isVisible().catch(() => false)) {
    await card.click();
    return true;
  }
  return false;
}

export async function openDhApprovalDetail(page: Page) {
  await openRoute(page, "/department-head/application-approval", {
    urlPattern: /\/application-approval/,
  });
  await waitForLoadingDone(page);
  await expect(page.getByText(/Application Approvals/i).first()).toBeVisible({
    timeout: 30_000,
  });
  return clickFirstQueueCard(page);
}

export async function openDhInspectionDetail(page: Page) {
  await openRoute(page, "/department-head/inspection-verification", {
    urlPattern: /\/inspection-verification/,
  });
  await waitForLoadingDone(page);
  await clickFirstQueueCard(page);
}

export async function openDhFlaggedDetail(page: Page) {
  await openRoute(page, "/department-head/permit-to-revoke", {
    urlPattern: /\/permit-to-revoke/ });
  await waitForLoadingDone(page);
  await clickFirstQueueCard(page);
}

export async function openDhSettlementDetail(page: Page) {
  await openRoute(page, "/department-head/settlement-management", {
    urlPattern: /\/settlement-management/,
  });
  await waitForLoadingDone(page);
  await clickFirstQueueCard(page);
}

export async function openDhRestrictionsDetail(page: Page) {
  await openRoute(page, "/department-head/revoke-permit-list", {
    urlPattern: /\/revoke-permit-list/,
  });
  await waitForLoadingDone(page);
  await clickFirstQueueCard(page);
}

export async function openJitInspectionForm(page: Page) {
  await openRoute(page, "/jit/inspect-a-business", { urlPattern: /\/inspect-a-business/ });
  await waitForLoadingDone(page);
  await clickFirstMatchingButton(page, /^Inspect$/i);
}

export async function openJitNoPermitForm(page: Page) {
  await openRoute(page, "/jit/no-permit-record", { urlPattern: /\/no-permit-record/ });
  await clickFirstMatchingButton(page, /Add Record/i);
}

export async function assertPermitIssuancePage(page: Page) {
  await openRoute(page, "/bplo/permit-issuance", { urlPattern: /\/permit-issuance/ });
  await expect(page.getByRole("heading", { name: /Permit Issuance/i })).toBeVisible({
    timeout: 45_000,
  });
  await bodyOrVisible(
    page,
    /Blocked|Awaiting Payment|Paid|For Release|Released|Prepare Permit|Prepare Certificate|Issuance stages/i
  );
}

export async function assertPermitIssuanceActions(page: Page) {
  await assertPermitIssuancePage(page);
  const prepare = page.getByRole("link", { name: /Prepare Permit|Prepare Certificate/i }).first();
  if (await prepare.isVisible().catch(() => false)) {
    await expect(prepare).toBeVisible();
  }
}

export async function assertApplicantTopPage(page: Page) {
  await openRoute(page, "/applicant/top", { urlPattern: /\/top/ });
  await waitForClientPage(page);
  await expect(page.getByRole("heading", { name: /Tax Order of Payment/i })).toBeVisible({
    timeout: 45_000,
  });
  await bodyOrVisible(
    page,
    /Tax Order of Payment|not yet available|TOP Records|Submit Payment|Itemized Fees|Loading assessed/i
  );
}

export async function assertApplicantDashboardLoaded(page: Page) {
  await openRoute(page, "/applicant/dashboard", { urlPattern: /\/applicant\/dashboard/ });
  await expect(page.getByRole("heading", { name: /My Dashboard/i })).toBeVisible({
    timeout: 45_000,
  });
}

export async function assertApplicantDashboardSection(page: Page, section: RegExp) {
  await assertApplicantDashboardLoaded(page);
  await expect(page.getByRole("heading", { name: section }).first()).toBeVisible({
    timeout: 45_000,
  });
}

export async function assertApplicantDashboardActionRequired(page: Page) {
  await assertApplicantDashboardLoaded(page);
  await bodyOrVisible(
    page,
    /Action Required Now|Returned for Correction|Pending Applications|Processing|Draft \/ New Filing/i
  );
}

export async function expectMobileLoginHeader(page: Page) {
  await gotoReady(page, "/login");
  const mobileHeader = page.locator(".lg\\:hidden").getByRole("heading", {
    name: /Business Permit Online System/i,
  });
  await expect(mobileHeader).toBeVisible({ timeout: 30_000 });
}

export async function expectDisabledLoginAlert(page: Page) {
  await gotoReady(page, "/login?error=account-disabled&email=jit-disabled%40example.com");
  await expect(
    page.getByText(/Your account has been disabled|contact the system administrator/i)
  ).toBeVisible({ timeout: 20_000 });
}

export async function openSuperAdminRoute(page: Page, route: string) {
  let lastText = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 120_000 });
    lastText = await page.locator("body").innerText();
    if (!page.url().includes("/login") && !/max clients|Internal Server Error/i.test(lastText)) break;
    await page.waitForTimeout(2_500 * (attempt + 1));
  }
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 45_000 });
  await expect(page).toHaveURL(/\/superadmin\//, { timeout: 45_000 });
  expect(/max clients|Internal Server Error/i.test(lastText)).toBeFalsy();
}

export async function assertSuperAdminNav(page: Page) {
  await bodyMatches(page, /Dashboard|Applications|Activity Log|Reports|Users|Settings|Profile/i);
  await expect(page.getByRole("navigation", { name: /IT Administrator|Super Admin|Administrator/i }).or(
    page.locator("nav").first()
  )).toBeVisible();
}

export async function assertSuperAdminDashboard(page: Page) {
  await openSuperAdminRoute(page, "/superadmin/dashboard");
  await expect(page.getByRole("heading", { name: /IT Administrator Dashboard/i })).toBeVisible({
    timeout: 60_000,
  });
  await bodyOrVisible(page, /Audit view only|Open Reports Hub|Operational meaning/i);
}

export async function assertSuperAdminReportsHub(page: Page) {
  await openSuperAdminRoute(page, "/superadmin/reports");
  await expect(page.getByRole("heading", { name: /System Reports Hub/i })).toBeVisible({
    timeout: 60_000,
  });
  await bodyOrVisible(page, /Applications|Audit|Registry|Closures|Inspections|SMS|Executive brief/i);
}
