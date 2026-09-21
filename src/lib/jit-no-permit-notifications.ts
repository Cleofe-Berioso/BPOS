import { isEmailConfigured, sendEmail } from "@/lib/mail";
import {
  buildNoPermitEmailPlainText,
  buildNoPermitEmailSubject,
  DEFAULT_SUPPORT_EMAIL,
} from "@/lib/jit-no-permit-ticket-copy";
import { prisma } from "@/lib/prisma";

export interface NoPermitNotificationInput {
  recordId: string;
  businessName: string;
  personAttended: string;
  ticketNumber: string;
  requiredAction: string;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface NoPermitNotificationResult {
  status: "SKIPPED" | "SENT" | "FAILED";
  channel: "EMAIL" | "NONE";
  detail?: string;
}

/**
 * Optional notification for newly recorded no-permit tickets.
 * Email only — SMS is reserved for BPLO FOR_RELEASE permit notices.
 */
export async function sendNoPermitOptionalNotification(
  input: NoPermitNotificationInput
): Promise<NoPermitNotificationResult> {
  const supportEmail = process.env.SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;

  if (!input.contactEmail) {
    await prisma.jitNoPermitRecord.update({
      where: { jitNoPermitRecordId: input.recordId },
      data: {
        notificationStatus: "SKIPPED",
        notificationChannel: "NONE",
      },
    });
    return {
      status: "SKIPPED",
      channel: "NONE",
      detail: input.contactPhone ? "SMS_NOT_USED_EMAIL_REQUIRED" : "NO_CONTACT_INFO",
    };
  }

  if (!isEmailConfigured()) {
    await prisma.jitNoPermitRecord.update({
      where: { jitNoPermitRecordId: input.recordId },
      data: {
        notificationStatus: "SKIPPED",
        notificationChannel: "EMAIL",
      },
    });
    return { status: "SKIPPED", channel: "EMAIL", detail: "SMTP_NOT_CONFIGURED" };
  }

  const subject = buildNoPermitEmailSubject(input.ticketNumber);
  const plainText = buildNoPermitEmailPlainText({
    businessName: input.businessName,
    personAttended: input.personAttended,
    ticketNumber: input.ticketNumber,
    requiredAction: input.requiredAction,
    supportEmail,
  });

  try {
    await sendEmail({
      to: input.contactEmail,
      subject,
      html: `<pre style="font-family: sans-serif; white-space: pre-wrap;">${plainText.replace(/</g, "&lt;")}</pre>`,
    });
    await prisma.jitNoPermitRecord.update({
      where: { jitNoPermitRecordId: input.recordId },
      data: {
        notificationStatus: "SENT",
        notificationChannel: "EMAIL",
        notifiedAt: new Date(),
      },
    });
    return { status: "SENT", channel: "EMAIL" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown email error";
    await prisma.jitNoPermitRecord.update({
      where: { jitNoPermitRecordId: input.recordId },
      data: {
        notificationStatus: "FAILED",
        notificationChannel: "EMAIL",
      },
    });
    return { status: "FAILED", channel: "EMAIL", detail };
  }
}
