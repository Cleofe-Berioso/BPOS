import fs from "node:fs";
import path from "node:path";

/**
 * When E2E_BLACKBOX=1, persist the latest plain OTP for Playwright to read.
 * Never enabled in production (guarded by env). Does not change auth behavior.
 */
export function captureE2eOtp(kind: "sa-login" | "password-reset" | "register", email: string, plainOtp: string) {
  if (process.env.E2E_BLACKBOX !== "1") return;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_E2E_OTP_CAPTURE !== "1") return;

  const dir = path.join(process.cwd(), "e2e", "blackbox", ".auth");
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    kind,
    email: email.trim().toLowerCase(),
    otp: plainOtp,
    capturedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, "last-otp.json"), JSON.stringify(payload), "utf8");
  fs.writeFileSync(path.join(dir, `last-otp-${kind}.json`), JSON.stringify(payload), "utf8");
}
