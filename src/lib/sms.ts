import { prisma } from "@/lib/prisma";
import { logSmsAction } from "@/lib/audit-log";
import { getSmsProviderEnvLabel, isSmsEnabled, resolveSmsProvider, type SmsProviderName } from "@/lib/sms-config";
import { normalizePhMobile } from "@/lib/ph-mobile";

export type ReleaseSmsStatus = "FOR_RELEASE";

export interface ReleaseSmsPayload {
  applicationId: string;
  applicantId?: string | null;
  applicationNumber: string;
  applicantName: string;
  businessName: string;
  status: ReleaseSmsStatus;
  toPhone: string | null;
}

export interface SmsSendResult {
  attempted: boolean;
  sent: boolean;
  provider: SmsProviderName;
  reason?: string;
  providerMessageId?: string;
  toPhone: string | null;
}

export interface SmsProviderSendResult {
  ok: boolean;
  provider: SmsProviderName;
  reason?: string;
  providerMessageId?: string;
}

function shortName(fullName: string): string {
  const value = fullName.trim();
  if (!value) return "Applicant";
  return value.split(/\s+/)[0] ?? "Applicant";
}

function trimMessageForSms(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 480 ? `${clean.slice(0, 477)}...` : clean;
}

function buildReleaseSmsMessage(input: {
  applicantName: string;
  businessName: string;
  applicationNumber: string;
  status: ReleaseSmsStatus;
}): string {
  const instruction =
    "Please prepare a valid ID and wait for BPLO release instructions.";

  return trimMessageForSms(
    `Hello ${shortName(input.applicantName)}. BPOS update: ${input.businessName} ` +
      `(Ref ${input.applicationNumber}) is now ${input.status}. ${instruction}`
  );
}

async function createSmsDeliveryLog(input: {
  applicationId: string;
  applicantId?: string | null;
  phoneNumber: string | null;
  provider: SmsProviderName;
  status: "SKIPPED" | "SENT" | "FAILED";
  messageBody: string;
  providerResponse?: string;
}) {
  try {
    await prisma.smsDeliveryLog.create({
      data: {
        applicationId: input.applicationId,
        applicantId: input.applicantId ?? null,
        phoneNumber: input.phoneNumber,
        provider: input.provider,
        status: input.status,
        messageBody: input.messageBody,
        providerResponse: input.providerResponse,
      },
    });
    void logSmsAction(
      null,
      "SMS_SYSTEM",
      input.applicantId,
      null,
      input.applicationId,
      input.status as "SKIPPED" | "SENT" | "FAILED",
      input.phoneNumber,
      input.provider,
      input.status,
      `SMS ${input.status.toLowerCase()}: ${input.provider}`,
      { providerResponse: input.providerResponse }
    );
  } catch (error) {
    console.error("[SMS] log failed", {
      applicationId: input.applicationId,
      provider: input.provider,
      status: input.status,
      reason: error instanceof Error ? error.message : "Unknown logging error",
    });
  }
}

async function sendViaTwilio(to: string, body: string): Promise<{ ok: boolean; sid?: string; reason?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !from) {
    return { ok: false, reason: "Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER" };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", from);
  form.set("Body", body);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    const json = (await response.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!response.ok) {
      return {
        ok: false,
        reason: json.message ? `${json.message}${json.code ? ` (code ${json.code})` : ""}` : `HTTP ${response.status}`,
      };
    }

    return { ok: true, sid: json.sid };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Unknown Twilio error",
    };
  }
}

async function sendViaSemaphore(
  to: string,
  body: string
): Promise<{ ok: boolean; messageId?: string; reason?: string }> {
  const apiKey = process.env.SEMAPHORE_API_KEY?.trim();
  const sender = process.env.SEMAPHORE_SENDER_NAME?.trim();
  const baseUrl = process.env.SEMAPHORE_BASE_URL?.trim() || "https://api.semaphore.co/api/v4/messages";

  if (!apiKey) {
    return { ok: false, reason: "Missing SEMAPHORE_API_KEY" };
  }

  const form = new URLSearchParams();
  form.set("apikey", apiKey);
  form.set("number", to);
  form.set("message", body);
  if (sender) {
    form.set("sendername", sender);
  }

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    const json = (await response.json().catch(() => null)) as
      | Array<{ message_id?: number | string; message?: string }>
      | { message?: string }
      | null;

    if (!response.ok) {
      const reason =
        (Array.isArray(json) ? json[0]?.message : json?.message) || `HTTP ${response.status}`;
      return { ok: false, reason };
    }

    const messageId =
      Array.isArray(json) && json[0]?.message_id != null
        ? String(json[0].message_id)
        : undefined;

    return { ok: true, messageId };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Unknown Semaphore error",
    };
  }
}

/**
 * Sends an SMS via the configured provider.
 * Caller must gate with isSmsEnabled() before invoking when SMS should be optional.
 */
export async function sendTransactionalSms(to: string, body: string): Promise<SmsProviderSendResult> {
  const provider = resolveSmsProvider();

  if (provider === "none") {
    return {
      ok: false,
      provider: "none",
      reason: `Unsupported SMS_PROVIDER: ${getSmsProviderEnvLabel()}`,
    };
  }

  if (provider === "twilio") {
    const twilio = await sendViaTwilio(to, body);
    if (!twilio.ok) {
      return { ok: false, provider: "twilio", reason: twilio.reason };
    }
    return { ok: true, provider: "twilio", providerMessageId: twilio.sid };
  }

  const semaphore = await sendViaSemaphore(to, body);
  if (!semaphore.ok) {
    return { ok: false, provider: "semaphore", reason: semaphore.reason };
  }
  return { ok: true, provider: "semaphore", providerMessageId: semaphore.messageId };
}

export async function sendReleaseStatusSms(payload: ReleaseSmsPayload): Promise<SmsSendResult> {
  const normalizedPhone = normalizePhMobile(payload.toPhone);
  const phoneForLog = normalizedPhone ?? payload.toPhone?.trim() ?? null;
  const provider = resolveSmsProvider();
  const body = buildReleaseSmsMessage({
    applicantName: payload.applicantName,
    businessName: payload.businessName,
    applicationNumber: payload.applicationNumber,
    status: payload.status,
  });

  if (!isSmsEnabled()) {
    const reason = "SMS disabled (set SMS_ENABLED=true to enable)";
    console.warn("[SMS] skipped", {
      applicationId: payload.applicationId,
      applicationNumber: payload.applicationNumber,
      status: payload.status,
      reason,
    });
    await createSmsDeliveryLog({
      applicationId: payload.applicationId,
      applicantId: payload.applicantId,
      phoneNumber: phoneForLog,
      provider,
      status: "SKIPPED",
      messageBody: body,
      providerResponse: reason,
    });
    return { attempted: false, sent: false, provider: "none", reason, toPhone: normalizedPhone };
  }

  if (!normalizedPhone) {
    const reason = "Missing or invalid applicant mobile number";
    console.warn("[SMS] skipped", {
      applicationId: payload.applicationId,
      applicationNumber: payload.applicationNumber,
      status: payload.status,
      reason,
      rawPhone: payload.toPhone,
    });
    await createSmsDeliveryLog({
      applicationId: payload.applicationId,
      applicantId: payload.applicantId,
      phoneNumber: phoneForLog,
      provider,
      status: "SKIPPED",
      messageBody: body,
      providerResponse: reason,
    });
    return { attempted: false, sent: false, provider, reason, toPhone: null };
  }

  if (provider === "none") {
    const reason = `Unsupported SMS_PROVIDER: ${getSmsProviderEnvLabel()}`;
    console.warn("[SMS] skipped", {
      applicationId: payload.applicationId,
      applicationNumber: payload.applicationNumber,
      status: payload.status,
      reason,
    });
    await createSmsDeliveryLog({
      applicationId: payload.applicationId,
      applicantId: payload.applicantId,
      phoneNumber: phoneForLog,
      provider,
      status: "SKIPPED",
      messageBody: body,
      providerResponse: reason,
    });
    return { attempted: false, sent: false, provider: "none", reason, toPhone: normalizedPhone };
  }

  const delivery = await sendTransactionalSms(normalizedPhone, body);
  if (!delivery.ok) {
    console.error("[SMS] failed", {
      applicationId: payload.applicationId,
      applicationNumber: payload.applicationNumber,
      status: payload.status,
      provider: delivery.provider,
      toPhone: normalizedPhone,
      reason: delivery.reason,
    });
    await createSmsDeliveryLog({
      applicationId: payload.applicationId,
      applicantId: payload.applicantId,
      phoneNumber: normalizedPhone,
      provider: delivery.provider,
      status: "FAILED",
      messageBody: body,
      providerResponse: delivery.reason,
    });
    return {
      attempted: true,
      sent: false,
      provider: delivery.provider,
      reason: delivery.reason,
      toPhone: normalizedPhone,
    };
  }

  console.info("[SMS] sent", {
    applicationId: payload.applicationId,
    applicationNumber: payload.applicationNumber,
    status: payload.status,
    provider: delivery.provider,
    toPhone: normalizedPhone,
    providerMessageId: delivery.providerMessageId,
  });

  await createSmsDeliveryLog({
    applicationId: payload.applicationId,
    applicantId: payload.applicantId,
    phoneNumber: normalizedPhone,
    provider: delivery.provider,
    status: "SENT",
    messageBody: body,
    providerResponse: delivery.providerMessageId
      ? delivery.provider === "twilio"
        ? `Message SID: ${delivery.providerMessageId}`
        : `Message ID: ${delivery.providerMessageId}`
      : "Message sent",
  });

  return {
    attempted: true,
    sent: true,
    provider: delivery.provider,
    providerMessageId: delivery.providerMessageId,
    toPhone: normalizedPhone,
  };
}
