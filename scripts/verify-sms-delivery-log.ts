import "./ebpls-env";
import { readFile } from "node:fs/promises";
import { checkSmsProviderEnvConfiguration } from "../src/lib/sms-config";
import { prisma } from "../src/lib/prisma";

function resolveApplicantPhone(formData: unknown): string | null {
  const maybe = (formData ?? {}) as Record<string, unknown>;
  const rawPhone = maybe.phone;
  if (typeof rawPhone !== "string") return null;
  const trimmed = rawPhone.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  let candidates = await prisma.businessApplication.findMany({
    where: {
      status: {
        in: ["FOR_RELEASE", "RELEASED"],
      },
    },
    include: {
      applicant: { select: { id: true, name: true } },
      businessRecord: { select: { businessName: true, phone: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 25,
  });

  if (candidates.length === 0) {
    candidates = await prisma.businessApplication.findMany({
      include: {
        applicant: { select: { id: true, name: true } },
        businessRecord: { select: { businessName: true, phone: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
    });
    console.warn(
      "[SMS VERIFY] No FOR_RELEASE/RELEASED records found. Using recent applications for phone and linkage checks."
    );
  }

  assert(candidates.length > 0, "No applications found for SMS verification.");

  const selected = candidates.find((app) => {
    const phone = resolveApplicantPhone(app.formData) ?? app.businessRecord?.phone ?? null;
    return Boolean(phone && phone.trim().length > 0);
  });

  assert(selected, "No candidate application has phone number in formData.phone or BusinessRecord.phone.");

  const selectedApp = selected!;
  const phone = resolveApplicantPhone(selectedApp.formData) ?? selectedApp.businessRecord?.phone ?? null;

  assert(phone, "Selected application does not have phone number.");
  console.log("[SMS VERIFY] Phone check: PASS", {
    applicationId: selectedApp.id,
    applicationNumber: selectedApp.applicationNumber,
    phone,
  });

  const envCheck = checkSmsProviderEnvConfiguration();
  assert(envCheck.ok, `[SMS VERIFY] Env check failed: ${envCheck.details}`);
  console.log("[SMS VERIFY] Env check: PASS", { details: envCheck.details });

  const permitIssuanceSource = await readFile("src/lib/bplo-permit-issuance.ts", "utf8");
  const smsSource = await readFile("src/lib/sms.ts", "utf8");
  const smsConfigSource = await readFile("src/lib/sms-config.ts", "utf8");
  const jitNoPermitSource = await readFile("src/lib/jit-no-permit-notifications.ts", "utf8");

  const forReleaseTriggerCount = (permitIssuanceSource.match(/status:\s*\"FOR_RELEASE\"\s+as\s+const/g) ?? []).length;
  const senderCallCount = (permitIssuanceSource.match(/sendReleaseStatusSms\(/g) ?? []).length;
  const hasDeliveryLogCreate = smsSource.includes("prisma.smsDeliveryLog.create");
  const hasCentralizedIsSmsEnabled = smsConfigSource.includes("export function isSmsEnabled()");
  const releaseSmsUsesCentralConfig = smsSource.includes('from "@/lib/sms-config"');
  const jitHasNoSmsSender = !jitNoPermitSource.includes("sendTransactionalSms(");
  const noDuplicateProviderFetchInJit =
    !jitNoPermitSource.includes("api.twilio.com") && !jitNoPermitSource.includes("api.semaphore.co");
  const releaseSmsGatedBeforeSend = smsSource.includes("if (!isSmsEnabled())");

  assert(forReleaseTriggerCount >= 1, "FOR_RELEASE trigger context for SMS not found.");
  assert(senderCallCount === 1, "Expected exactly one sendReleaseStatusSms call (FOR_RELEASE prepare only).");
  assert(!permitIssuanceSource.includes('status: "RELEASED" as const,\n        toPhone'), "RELEASED SMS context should be removed.");
  assert(hasDeliveryLogCreate, "SmsDeliveryLog creation not found in SMS sender implementation.");
  assert(hasCentralizedIsSmsEnabled, "Centralized isSmsEnabled() not found in sms-config.");
  assert(releaseSmsUsesCentralConfig, "Release SMS sender must import sms-config.");
  assert(jitHasNoSmsSender, "JIT no-permit notifications must not send SMS.");
  assert(noDuplicateProviderFetchInJit, "JIT no-permit notifications must not call provider APIs directly.");
  assert(releaseSmsGatedBeforeSend, "Release SMS sender must gate on isSmsEnabled().");

  console.log("[SMS VERIFY] Trigger log linkage check: PASS", {
    forReleaseTriggerCount,
    senderCallCount,
    hasDeliveryLogCreate,
    hasCentralizedIsSmsEnabled,
    jitHasNoSmsSender,
    noDuplicateProviderFetchInJit,
  });

  console.log("verify-sms-delivery-log: PASS");
}

main()
  .catch((error) => {
    console.error("verify-sms-delivery-log: FAIL", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
