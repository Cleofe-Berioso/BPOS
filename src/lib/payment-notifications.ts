import { prisma } from "@/lib/prisma";
import {
  generatePaymentReminderEmailHtml,
  isEmailConfigured,
  sendEmail,
  type PaymentReminderEmailInput,
} from "@/lib/mail";
import { toMoneyNumber } from "@/lib/money";
import { logPaymentAction } from "@/lib/audit-log";

export interface PaymentEmailResult {
  attempted: boolean;
  sent: boolean;
  recipientEmail?: string | null;
  messageId?: string;
  reason?: string;
}

/**
 * Resolves the primary recipient email address for payment notices.
 * Prioritizes the registered applicant user email, falling back to the business record email.
 */
export function resolveRecipientEmail(input: {
  applicantEmail?: string | null;
  businessEmail?: string | null;
}): string | null {
  const applicant = input.applicantEmail?.trim();
  if (applicant) return applicant;

  const business = input.businessEmail?.trim();
  if (business) return business;

  return null;
}

function formatDateLabel(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function resolveBusinessName(formData: unknown, recordName?: string | null): string {
  if (formData && typeof formData === "object") {
    const raw = (formData as Record<string, unknown>).businessName;
    if (typeof raw === "string" && raw.trim() && raw.trim() !== "-") {
      return raw.trim();
    }
  }
  if (recordName && recordName.trim() && recordName !== "-") {
    return recordName.trim();
  }
  return "Registered Business";
}

function resolveAppBaseUrl(): string {
  const customUrl = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (customUrl) return customUrl.replace(/\/+$/, "");
  return "https://ebpls.ebmagalona.gov.ph";
}

/**
 * Pure builder function to transform Prisma application & payment reference
 * objects into a clean, validated PaymentReminderEmailInput.
 */
export function buildPaymentReminderEmailData(
  app: any,
  ref: any,
  baseUrl: string = resolveAppBaseUrl()
): PaymentReminderEmailInput | null {
  if (!app || !ref) return null;

  const businessName = resolveBusinessName(app.formData, app.businessRecord?.businessName ?? null);
  const applicantName = app.applicant?.name?.trim() || "Valued Taxpayer";
  const applicationNumber = app.applicationNumber || "APP-UNKNOWN";
  const transactionNumber = ref.transactionNumber || "-";

  const totalAssessment = toMoneyNumber(app.feeAssessment?.totalAmount);
  const releasePaymentAmount = toMoneyNumber(app.feeAssessment?.releasePaymentAmount);
  const amountPaid = releasePaymentAmount > 0 ? releasePaymentAmount : totalAssessment;

  const trackingUrl = `${baseUrl}/applicant/my-applications/${app.businessApplicationId ?? app.id}`;

  return {
    applicantName,
    businessName,
    applicationNumber,
    transactionNumber,
    amountPaid,
    paymentDate: formatDateLabel(ref.paymentDate ?? ref.submittedAt),
    verifiedDate: formatDateLabel(ref.reviewedAt ?? new Date()),
    remarks: ref.reviewerRemarks ?? null,
    trackingUrl,
    supportEmail: process.env.BPLO_SUPPORT_EMAIL?.trim() || "bplo@ebmagalona.gov.ph",
  };
}

/**
 * Main service to send an official payment confirmation and claiming reminder
 * to the applicant's Gmail address upon payment verification.
 *
 * Safe: catches and returns diagnostic results without failing parent transactions.
 */
export async function sendPaymentVerifiedEmail(
  paymentReferenceId: string,
  actorId?: string
): Promise<PaymentEmailResult> {
  try {
    const ref = await (prisma as any).paymentReference.findUnique({
      where: { paymentReferenceId },
      include: {
        application: {
          include: {
            applicant: { select: { userId: true, name: true, email: true } },
            businessRecord: { select: { businessName: true, email: true } },
            feeAssessment: {
              select: {
                totalAmount: true,
                releasePaymentAmount: true,
                paymentStatus: true,
              },
            },
          },
        },
      },
    });

    if (!ref || !ref.application) {
      return {
        attempted: false,
        sent: false,
        reason: "Payment reference or associated application not found",
      };
    }

    const app = ref.application;
    const recipientEmail = resolveRecipientEmail({
      applicantEmail: app.applicant?.email,
      businessEmail: app.businessRecord?.email,
    });

    if (!recipientEmail) {
      return {
        attempted: false,
        sent: false,
        reason: "No valid applicant or business email address found on file",
      };
    }

    if (!isEmailConfigured()) {
      console.warn(
        `[PaymentNotification] Email not configured. Skipping payment reminder for ${recipientEmail}. Set GMAIL_USER + GMAIL_APP_PASSWORD or RESEND_API_KEY.`
      );
      return {
        attempted: false,
        sent: false,
        recipientEmail,
        reason: "Email transport is not configured",
      };
    }

    const emailData = buildPaymentReminderEmailData(app, ref);
    if (!emailData) {
      return {
        attempted: false,
        sent: false,
        recipientEmail,
        reason: "Failed to construct payment reminder email payload",
      };
    }

    const html = generatePaymentReminderEmailHtml(emailData);
    const subject = `Payment Verified & Official Receipt Confirmation — ${emailData.businessName} (${emailData.applicationNumber})`;

    const sendResult = await sendEmail({
      to: recipientEmail,
      subject,
      html,
    });

    // Record notification in application history
    try {
      await (prisma as any).applicationHistory.create({
        data: {
          applicationId: app.businessApplicationId,
          actorId: actorId ?? null,
          actorRole: "BPLO",
          fromStatus: "PAID",
          toStatus: "PAID",
          remarks: `Gmail payment confirmation & claiming reminder sent to ${recipientEmail} (OR #${ref.transactionNumber}).`,
        },
      });

      void logPaymentAction(
        actorId ?? "SYSTEM",
        "BPLO",
        ref.paymentReferenceId,
        app.businessApplicationId,
        "PAYMENT_REMINDER_EMAIL_SENT",
        `Payment reminder sent to ${recipientEmail}`,
        { recipientEmail, messageId: sendResult.messageId }
      );
    } catch (logErr) {
      console.error("[PaymentNotification] Failed to log email history entry:", logErr);
    }

    return {
      attempted: true,
      sent: true,
      recipientEmail,
      messageId: sendResult.messageId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error sending email";
    console.error("[PaymentNotification] Error delivering payment reminder email:", error);
    return {
      attempted: true,
      sent: false,
      reason: errorMsg,
    };
  }
}
