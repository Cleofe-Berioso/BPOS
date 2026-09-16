/**
 * Objective cases outside the thesis white-box 96-case count.
 * TC-RESUB-01 mirrors WB-RESUB-01; TC-SMS-RELEASE-01 covers release SMS copy + gate behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getApplicationSubmitButtonLabel,
  getApplicationSubmitSuccessMessage,
  getResubmissionConfirmMessage,
  isReturnedCorrectionResubmission,
} from "@/lib/resubmission-copy";
import { buildReleaseSmsMessage, sendReleaseStatusSms } from "@/lib/sms";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsDeliveryLog: {
      create: vi.fn().mockResolvedValue({ id: "log-1" }),
    },
  },
}));

vi.mock("@/lib/audit-log", () => ({
  logSmsAction: vi.fn().mockResolvedValue(undefined),
}));

describe("TC-RESUB-01 / TC-SMS-RELEASE-01", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    delete process.env.SMS_ENABLED;
    delete process.env.SMS_PROVIDER;
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.clearAllMocks();
  });

  it("TC-RESUB-01 resubmission copy helpers", () => {
    expect(
      isReturnedCorrectionResubmission({
        editId: "x",
        applicationStatus: "Returned for Correction",
      })
    ).toBe(true);
    expect(
      isReturnedCorrectionResubmission({
        editId: null,
        applicationStatus: "Returned for Correction",
      })
    ).toBe(false);

    expect(getApplicationSubmitButtonLabel("NEW", true)).toBe("Resubmit Application");
    expect(getApplicationSubmitButtonLabel("RENEWAL", false)).toBe("Submit Renewal");
    expect(getApplicationSubmitButtonLabel("CLOSURE", false)).toBe("Submit Closure");

    expect(getApplicationSubmitSuccessMessage("NEW", false, "APP-1")).toContain("APP-1");
    expect(getApplicationSubmitSuccessMessage("RENEWAL", true, "APP-1")).toMatch(/resubmitted/i);
    expect(getApplicationSubmitSuccessMessage("CLOSURE", true, "APP-1")).toMatch(/resubmitted/i);

    expect(getResubmissionConfirmMessage("NEW")).toMatch(/resubmit/i);
    expect(getResubmissionConfirmMessage("RENEWAL")).toMatch(/resubmit/i);
    expect(getResubmissionConfirmMessage("CLOSURE")).toMatch(/resubmit/i);
  });

  it("TC-SMS-RELEASE-01 SMS notification for permit/certificate release", async () => {
    const message = buildReleaseSmsMessage({
      applicantName: "Juan Dela Cruz",
      businessName: "Juan Store",
      applicationNumber: "APP-2026-001",
      status: "FOR_RELEASE",
    });

    expect(message).toContain("Juan");
    expect(message).toContain("Juan Store");
    expect(message).toContain("APP-2026-001");
    expect(message).toContain("FOR_RELEASE");
    expect(message).toMatch(/BPLO release instructions/i);

    // SMS optional by default: message is still generated and logged as SKIPPED.
    const skipped = await sendReleaseStatusSms({
      applicationId: "app-1",
      applicantId: "user-1",
      applicationNumber: "APP-2026-001",
      applicantName: "Juan Dela Cruz",
      businessName: "Juan Store",
      status: "FOR_RELEASE",
      toPhone: "09171234567",
    });
    expect(skipped.attempted).toBe(false);
    expect(skipped.sent).toBe(false);
    expect(skipped.reason).toMatch(/SMS disabled/i);

    // Invalid phone still produces the release notification body path (SKIPPED).
    process.env.SMS_ENABLED = "true";
    process.env.SMS_PROVIDER = "semaphore";
    const noPhone = await sendReleaseStatusSms({
      applicationId: "app-2",
      applicantId: "user-2",
      applicationNumber: "APP-2026-002",
      applicantName: "Maria Santos",
      businessName: "Maria Bakery",
      status: "FOR_RELEASE",
      toPhone: null,
    });
    expect(noPhone.attempted).toBe(false);
    expect(noPhone.sent).toBe(false);
    expect(noPhone.reason).toMatch(/mobile number/i);
  });
});
