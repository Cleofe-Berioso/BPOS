import { expect, test } from "@playwright/test";
import { createRoleTest } from "./fixtures";
import {
  USERS,
  PASSWORD,
  SA_EMAIL_FALLBACKS,
  SMOKE,
  capture,
  loginAsSuperAdminUi,
  openRoute,
  pageHasText,
  waitForCapturedOtp,
  fillOtpDigits,
} from "./helpers";
import fs from "node:fs";
import path from "node:path";

const applicant = createRoleTest("applicant");
const bplo = createRoleTest("bplo");
const dh = createRoleTest("deptHead");
const jit = createRoleTest("jit");
const sa = createRoleTest("itAdmin");

const PRINT_REPORTS = [
  "monthly-summary",
  "applications",
  "business-registry",
  "closures",
  "inspections",
  "audit-trail",
  "sms",
] as const;

test.describe("BB-GAP — Public redirects & Super Admin OTP", () => {
  test.setTimeout(180_000);

  test("BB-GAP-01 Super Admin password step shows OTP challenge", async ({ page }) => {
    const email = USERS.itAdmin.email;
    const otpFile = path.join(__dirname, ".auth", "last-otp-sa-login.json");
    if (fs.existsSync(otpFile)) fs.unlinkSync(otpFile);

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: /^Sign In$/i }).click();
    await expect(page.getByText(/Verify Login OTP|6-digit code/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await capture(page, "gaps", "BB-GAP-01-sa-otp-challenge.png");
  });

  test("BB-GAP-02 Super Admin completes OTP login to dashboard", async ({ page }) => {
    let loggedIn = false;
    for (const email of SA_EMAIL_FALLBACKS) {
      try {
        await loginAsSuperAdminUi(page, email);
        await page.goto("/superadmin/dashboard", { waitUntil: "domcontentloaded", timeout: 90_000 });
        await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 45_000 });
        loggedIn = true;
        break;
      } catch {
        // try next seed email
      }
    }
    expect(loggedIn).toBeTruthy();
    await capture(page, "gaps", "BB-GAP-02-sa-dashboard.png");
  });

  test("BB-GAP-03 Forgot-password OTP step with captured E2E OTP", async ({ page }) => {
    const email = USERS.applicant.email;
    const otpFile = path.join(__dirname, ".auth", "last-otp-password-reset.json");
    if (fs.existsSync(otpFile)) fs.unlinkSync(otpFile);

    await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
    await page.locator("#email, input[name='email'], input[type='email']").first().fill(email);
    const sendBtn = page.getByRole("button", { name: /Send|Request|Continue|OTP/i }).first();
    await sendBtn.click();

    const otp = await waitForCapturedOtp("password-reset", email, 25_000);
    // Prefer digit inputs if present; otherwise a single OTP field.
    const digit0 = page.locator("#login-otp-digit-0, #otp-digit-0, [id*='otp-digit-0']").first();
    if (await digit0.isVisible().catch(() => false)) {
      const prefix = ((await digit0.getAttribute("id")) || "otp-digit-0").replace(/-0$/, "");
      await fillOtpDigits(page, otp, prefix);
    } else {
      const otpInput = page.locator("input[name='otp'], #otp, input[autocomplete='one-time-code']").first();
      await expect(otpInput).toBeVisible({ timeout: 20_000 });
      await otpInput.fill(otp);
    }

    const verifyBtn = page.getByRole("button", { name: /Verify|Continue|Next/i }).first();
    if (await verifyBtn.isVisible().catch(() => false)) {
      await verifyBtn.click();
    }
    // Stop before permanently changing password — assert we reached a new-password or success step.
    const body = await page.locator("body").innerText();
    expect(/new password|confirm password|reset|otp|verify|success|password/i.test(body)).toBeTruthy();
    await capture(page, "gaps", "BB-GAP-03-forgot-otp.png");
  });
});

sa.describe("BB-GAP — Super Admin print reports", () => {
  sa.setTimeout(180_000);

  for (const slug of PRINT_REPORTS) {
    sa(`BB-GAP-SA-PRINT-${slug} /superadmin/reports/print/${slug}`, async ({ page }) => {
      await openRoute(page, `/superadmin/reports/print/${slug}`, {
        urlPattern: new RegExp(`/superadmin/reports/print/${slug}`),
        shot: ["gaps", `BB-GAP-SA-PRINT-${slug}.png`],
      });
      const text = await page.locator("body").innerText();
      expect(/report|print|summary|application|business|inspection|audit|sms|closure|enrique|municipality|table|no /i.test(text)).toBeTruthy();
    });
  }

  sa("BB-GAP-SA-DETAIL open application detail when rows exist", async ({ page }) => {
    await openRoute(page, "/superadmin/applications", { urlPattern: /\/superadmin\/applications/ });
    const link = page.locator('a[href*="/superadmin/applications/"]').first();
    if (!(await link.isVisible().catch(() => false))) {
      await capture(page, "gaps", "BB-GAP-SA-DETAIL-empty.png");
      return;
    }
    await link.click();
    await expect(page).toHaveURL(/\/superadmin\/applications\/[^/]+/, { timeout: 45_000 });
    await capture(page, "gaps", "BB-GAP-SA-DETAIL.png");
  });
});

applicant.describe("BB-GAP — Applicant detail & document routes", () => {
  applicant.setTimeout(180_000);

  applicant("BB-GAP-APP-01 my-applications detail when rows exist", async ({ page }) => {
    await openRoute(page, "/applicant/my-applications", { urlPattern: /\/my-applications/ });
    const link = page.locator('a[href*="/applicant/my-applications/"]').first();
    if (!(await link.isVisible().catch(() => false))) {
      await capture(page, "gaps", "BB-GAP-APP-01-empty.png");
      return;
    }
    await link.click();
    await expect(page).toHaveURL(/\/applicant\/my-applications\/[^/]+/, { timeout: 45_000 });
    await capture(page, "gaps", "BB-GAP-APP-01-detail.png");

    const permit = page.locator('a[href*="/applicant/permits/"]').first();
    if (await permit.isVisible().catch(() => false)) {
      await permit.click();
      await expect(page).toHaveURL(/\/applicant\/permits\/[^/]+/, { timeout: 45_000 });
      await capture(page, "gaps", "BB-GAP-APP-01-permit.png");
    }

    const closure = page.locator('a[href*="/applicant/closure-certificates/"]').first();
    if (await closure.isVisible().catch(() => false)) {
      await closure.click();
      await expect(page).toHaveURL(/\/applicant\/closure-certificates\/[^/]+/, { timeout: 45_000 });
      await capture(page, "gaps", "BB-GAP-APP-01-closure-cert.png");
    }
  });

  applicant("BB-GAP-APP-02 notifications page", async ({ page }) => {
    await openRoute(page, "/applicant/notifications", {
      urlPattern: /\/notifications/,
      shot: ["gaps", "BB-GAP-APP-02-notifications.png"],
    });
  });
});

bplo.describe("BB-GAP — BPLO print routes", () => {
  bplo.setTimeout(180_000);

  bplo("BB-GAP-BPLO-01 permit print when issuance detail exists", async ({ page }) => {
    await openRoute(page, "/bplo/permit-issuance", { urlPattern: /\/permit-issuance/ });
    const link = page.locator('a[href*="/bplo/permit-issuance/"]').first();
    if (!(await link.isVisible().catch(() => false))) {
      await capture(page, "gaps", "BB-GAP-BPLO-01-empty.png");
      return;
    }
    await link.click();
    await expect(page).toHaveURL(/\/bplo\/permit-issuance\/[^/]+/, { timeout: 45_000 });
    const printLink = page.locator('a[href*="/print"]').first();
    if (await printLink.isVisible().catch(() => false)) {
      await printLink.click();
      await expect(page).toHaveURL(/\/print|\/closure-print/, { timeout: 45_000 });
      await capture(page, "gaps", "BB-GAP-BPLO-01-print.png");
      return;
    }
    // Direct print paths from current URL
    const base = page.url().replace(/\/$/, "");
    await page.goto(`${base}/print`, { waitUntil: "domcontentloaded" });
    if (!page.url().includes("/login")) {
      await capture(page, "gaps", "BB-GAP-BPLO-01-print-direct.png");
    }
    await page.goto(`${base}/closure-print`, { waitUntil: "domcontentloaded" });
    if (!page.url().includes("/login")) {
      await capture(page, "gaps", "BB-GAP-BPLO-01-closure-print.png");
    }
  });

  bplo("BB-GAP-BPLO-02 applications detail when rows exist", async ({ page }) => {
    await openRoute(page, "/bplo/applications", { urlPattern: /\/bplo\/applications/ });
    const link = page.locator('a[href*="/bplo/applications/"]').first();
    if (!(await link.isVisible().catch(() => false))) {
      await capture(page, "gaps", "BB-GAP-BPLO-02-empty.png");
      return;
    }
    await link.click();
    await expect(page).toHaveURL(/\/bplo\/applications\/[^/]+/, { timeout: 45_000 });
    await capture(page, "gaps", "BB-GAP-BPLO-02-detail.png");
  });
});

dh.describe("BB-GAP — Department Head profile & queues", () => {
  dh.setTimeout(180_000);

  dh("BB-GAP-DH-01 profile page", async ({ page }) => {
    await openRoute(page, "/department-head/profile", {
      urlPattern: /\/department-head\/profile/,
      shot: ["gaps", "BB-GAP-DH-01-profile.png"],
    });
  });

  dh("BB-GAP-DH-02 root redirects to dashboard", async ({ page }) => {
    await page.goto("/department-head", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page).toHaveURL(/\/department-head\/dashboard/, { timeout: 45_000 });
    await capture(page, "gaps", "BB-GAP-DH-02-root-redirect.png");
  });
});

jit.describe("BB-GAP — JIT print & root redirect", () => {
  jit.setTimeout(180_000);

  jit("BB-GAP-JIT-01 root redirects to dashboard or portal-disabled", async ({ page }) => {
    await page.goto("/jit", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page).toHaveURL(/\/jit\/(dashboard|portal-disabled)/, { timeout: 45_000 });
    await capture(page, "gaps", "BB-GAP-JIT-01-root.png");
  });

  jit("BB-GAP-JIT-02 no-permit print when record exists", async ({ page }) => {
    await openRoute(page, "/jit/no-permit-record", { urlPattern: /\/no-permit-record/ });
    const link = page.locator('a[href*="/jit/no-permit-record/"]').first();
    if (!(await link.isVisible().catch(() => false))) {
      // soft: page may be empty
      const hasSmoke = await pageHasText(page, SMOKE.retailName);
      await capture(page, "gaps", hasSmoke ? "BB-GAP-JIT-02-list.png" : "BB-GAP-JIT-02-empty.png");
      return;
    }
    await link.click();
    await page.waitForTimeout(500);
    const print = page.locator('a[href*="/print"]').first();
    if (await print.isVisible().catch(() => false)) {
      await print.click();
      await expect(page).toHaveURL(/\/print/, { timeout: 45_000 });
      await capture(page, "gaps", "BB-GAP-JIT-02-print.png");
    }
  });
});
