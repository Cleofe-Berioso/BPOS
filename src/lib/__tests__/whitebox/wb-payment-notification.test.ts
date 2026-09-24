import { describe, expect, it, vi } from "vitest";
import {
  generatePaymentReminderEmailHtml,
  type PaymentReminderEmailInput,
} from "@/lib/mail";
import {
  resolveRecipientEmail,
  buildPaymentReminderEmailData,
  sendPaymentVerifiedEmail,
} from "@/lib/payment-notifications";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://localhost:5432/ebpls_whitebox";
}

const mockPaymentRefWithEmail = {
  paymentReferenceId: "ref-valid-01",
  transactionNumber: "OR-987654",
  paymentDate: new Date("2026-03-15T10:00:00Z"),
  reviewedAt: new Date("2026-03-16T14:00:00Z"),
  reviewerRemarks: "Paid in full at Municipal Treasury.",
  application: {
    businessApplicationId: "app-123",
    applicationNumber: "APP-2026-0042",
    applicant: {
      userId: "user-1",
      name: "Juan Dela Cruz",
      email: "juan@example.com",
    },
    businessRecord: {
      businessName: "Sariling Sikap Enterprise",
      email: "store@example.com",
    },
    formData: {
      businessName: "Sariling Sikap Enterprise",
    },
    feeAssessment: {
      totalAmount: 3500.5,
      releasePaymentAmount: 3500.5,
      paymentStatus: "PAID",
    },
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentReference: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where?.paymentReferenceId === "ref-valid-01") {
          return Promise.resolve(mockPaymentRefWithEmail);
        }
        return Promise.resolve(null);
      }),
    },
    applicationHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/mail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mail")>();
  return {
    ...actual,
    isEmailConfigured: vi.fn(() => false),
    sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: "mock-message-id-123" }),
  };
});

describe("WB-PAY-NOTIF — payment reminder email template", () => {
  const sampleInput: PaymentReminderEmailInput = {
    applicantName: "Juan Dela Cruz",
    businessName: "Sariling Sikap Enterprise",
    applicationNumber: "APP-2026-0042",
    transactionNumber: "OR-987654",
    amountPaid: 3500.5,
    paymentDate: "March 15, 2026",
    verifiedDate: "March 16, 2026",
    remarks: "Paid in full at Municipal Treasury.",
    trackingUrl: "https://ebpls.ebmagalona.gov.ph/applicant/my-applications/app-123",
    supportEmail: "bplo@ebmagalona.gov.ph",
  };

  it("WB-PAY-01 renders municipal branding, status badge, and applicant details", () => {
    const html = generatePaymentReminderEmailHtml(sampleInput);

    expect(html).toContain("Enrique B. Magalona");
    expect(html).toContain("BPLO");
    expect(html).toContain("PAYMENT VERIFIED");
    expect(html).toContain("Juan Dela Cruz");
    expect(html).toContain("Sariling Sikap Enterprise");
  });

  it("WB-PAY-02 formats payment transaction details and peso currency", () => {
    const html = generatePaymentReminderEmailHtml(sampleInput);

    expect(html).toContain("OR-987654");
    expect(html).toContain("APP-2026-0042");
    expect(html).toContain("3,500.50");
    expect(html).toContain("March 15, 2026");
    expect(html).toContain("Paid in full at Municipal Treasury.");
  });

  it("WB-PAY-03 contains permit claiming reminders, valid ID notes, and tracking CTA", () => {
    const html = generatePaymentReminderEmailHtml(sampleInput);

    expect(html).toContain("Official Receipt");
    expect(html).toContain("valid ID");
    expect(html).toContain(sampleInput.trackingUrl);
    expect(html).toContain("View Application Status");
  });

  it("WB-PAY-04 escapes potentially malicious HTML in input strings", () => {
    const dangerousInput: PaymentReminderEmailInput = {
      ...sampleInput,
      businessName: "<script>alert('xss')</script> Safe Store",
      remarks: '<img src="x" onerror="alert(1)"> All good',
    };

    const html = generatePaymentReminderEmailHtml(dangerousInput);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img src=");
    expect(html).toContain("&lt;img src=");
  });
});

describe("WB-PAY-SERVICE — payment notification service logic", () => {
  it("WB-PAY-05 resolves applicant email over business record email", () => {
    expect(
      resolveRecipientEmail({
        applicantEmail: "applicant@example.com",
        businessEmail: "store@example.com",
      })
    ).toBe("applicant@example.com");

    expect(
      resolveRecipientEmail({
        applicantEmail: null,
        businessEmail: "store@example.com",
      })
    ).toBe("store@example.com");

    expect(
      resolveRecipientEmail({
        applicantEmail: "   ",
        businessEmail: "",
      })
    ).toBe(null);
  });

  it("WB-PAY-06 builds complete PaymentReminderEmailInput from database models", () => {
    const mockApp = {
      businessApplicationId: "app-999",
      applicationNumber: "APP-2026-0099",
      applicant: { name: "Maria Clara", email: "maria@example.com" },
      businessRecord: { businessName: "Clara Bakery", email: "bakery@example.com" },
      formData: { businessName: "Clara Bakery Official" },
      feeAssessment: {
        totalAmount: 4200,
        releasePaymentAmount: 4200,
      },
    };

    const mockRef = {
      paymentReferenceId: "ref-123",
      transactionNumber: "OR-112233",
      paymentDate: new Date("2026-04-10T10:00:00Z"),
      reviewedAt: new Date("2026-04-11T14:30:00Z"),
      reviewerRemarks: "Cash payment confirmed",
    };

    const emailData = buildPaymentReminderEmailData(mockApp, mockRef, "https://ebpls.local");

    expect(emailData).not.toBeNull();
    expect(emailData?.applicantName).toBe("Maria Clara");
    expect(emailData?.businessName).toBe("Clara Bakery Official");
    expect(emailData?.transactionNumber).toBe("OR-112233");
    expect(emailData?.amountPaid).toBe(4200);
    expect(emailData?.trackingUrl).toContain("/applicant/my-applications/app-999");
    expect(emailData?.remarks).toBe("Cash payment confirmed");
  });

  it("WB-PAY-07 sendPaymentVerifiedEmail returns attempted false if email is not configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Calling with non-existent ID returns safe diagnostic result instead of throwing
    const notFound = await sendPaymentVerifiedEmail("non-existent-payment-ref-id");
    expect(notFound.attempted).toBe(false);
    expect(notFound.sent).toBe(false);
    expect(notFound.reason).toContain("not found");

    // Calling with existing payment reference when email is not configured
    const unconfigured = await sendPaymentVerifiedEmail("ref-valid-01");
    expect(unconfigured.attempted).toBe(false);
    expect(unconfigured.sent).toBe(false);
    expect(unconfigured.recipientEmail).toBe("juan@example.com");
    expect(unconfigured.reason).toBe("Email transport is not configured");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[PaymentNotification] Email not configured")
    );
    warnSpy.mockRestore();
  });
});

