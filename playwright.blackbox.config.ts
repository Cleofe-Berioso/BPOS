import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const BLACKBOX_OUT = path.join(__dirname, "..", "blackbox");

/**
 * Black-box suite lives in e2e/blackbox (inside EBPLS).
 * All documentation / screenshots / reports go to ../blackbox (outside EBPLS).
 */
export default defineConfig({
  testDir: path.join(__dirname, "e2e", "blackbox"),
  globalSetup: path.join(__dirname, "e2e", "blackbox", "global-setup.ts"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 45_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(BLACKBOX_OUT, "playwright-report") }],
    ["json", { outputFile: path.join(BLACKBOX_OUT, "evidence", "ui-inspection-results.json") }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "off",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- --port 3000",
    url: "http://127.0.0.1:3000/login",
    // Local: reuse whatever is already on :3000. CI: always spawn a fresh server.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      E2E_BLACKBOX: "1",
      ALLOW_E2E_OTP_CAPTURE: "1",
    },
  },
  outputDir: path.join(BLACKBOX_OUT, "test-results"),
});
