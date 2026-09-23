import { describe, expect, it } from "vitest";
import {
  generatePaymentReminderEmailHtml,
  type PaymentReminderEmailInput,
} from "@/lib/mail";

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
