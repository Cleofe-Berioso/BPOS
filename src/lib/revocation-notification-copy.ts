import type { RevocationNotificationEventType } from "@prisma/client";

export const REVOCATION_HISTORY_MARKER = "[REVOCATION_NOTICE]";

export const DEFAULT_SUPPORT_EMAIL = "support@bplo.gov.ph";

export interface RevocationNotificationContext {
  applicationId: string;
  applicationNumber: string;
  applicantId: string;
  applicantEmail: string;
  inspectionId: string;
  businessName: string;
  permitNumber: string | null;
  violationBasis: string;
  eventDateLabel: string;
  departmentOfficerLabel: string;
  nextAction: string;
  decisionRemarks?: string | null;
}

function formatNonComplianceLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  if (type === "GOVERNMENT_AGENCY_RELATED") return "Government agency related non-compliance";
  if (type === "RENEWAL_RELATED") return "Renewal related non-compliance";
  return type.replace(/_/g, " ").toLowerCase();
}

function formatSeverityLabel(severity: string | null | undefined): string | null {
  if (!severity) return null;
  return severity.charAt(0) + severity.slice(1).toLowerCase();
}

export function buildViolationBasis(input: {
  recommendationRemarks?: string | null;
  inspectionComment?: string | null;
  nonComplianceType?: string | null;
  violationSeverity?: string | null;
  departmentHeadRemarks?: string | null;
  decisionRemarks?: string | null;
}): string {
  const parts: string[] = [];

  if (input.recommendationRemarks?.trim()) {
    parts.push(`JIT recommendation: ${input.recommendationRemarks.trim()}`);
  }
  if (input.inspectionComment?.trim()) {
    parts.push(`Inspection findings: ${input.inspectionComment.trim()}`);
  }

  const typeLabel = formatNonComplianceLabel(input.nonComplianceType);
  const severityLabel = formatSeverityLabel(input.violationSeverity);
  if (typeLabel || severityLabel) {
    parts.push(
      [typeLabel, severityLabel ? `Severity: ${severityLabel}` : null].filter(Boolean).join(". ")
    );
  }

  if (input.departmentHeadRemarks?.trim()) {
    parts.push(`Department Head verification remarks: ${input.departmentHeadRemarks.trim()}`);
  }
  if (input.decisionRemarks?.trim()) {
    parts.push(`Department Head decision remarks: ${input.decisionRemarks.trim()}`);
  }

  return parts.join(" ") || "A non-compliance issue was recorded during inspection.";
}

export function resolveRevocationNextAction(eventType: RevocationNotificationEventType): string {
  switch (eventType) {
    case "REVOCATION_REVIEW_ENTERED":
      return "Your permit is under revocation review. Contact BPLO immediately, review the basis below, and wait for the Department Head decision. Prepare supporting documents if requested.";
    case "REVOCATION_APPROVED":
      return "Your business permit has been revoked. Contact BPLO for guidance on compliance requirements, settlement, and any eligible next steps.";
    case "REVOCATION_DENIED":
      return "The revocation request was denied and your released permit status has been restored. Continue normal compliance and monitor your application status in the portal.";
  }
}

export function resolveRevocationNotificationTitle(eventType: RevocationNotificationEventType): string {
  switch (eventType) {
    case "REVOCATION_REVIEW_ENTERED":
      return "Permit Revocation Under Review";
    case "REVOCATION_APPROVED":
      return "Business Permit Revoked";
    case "REVOCATION_DENIED":
      return "Revocation Request Denied";
  }
}

export function buildRevocationHistoryRemarks(
  eventType: RevocationNotificationEventType,
  context: RevocationNotificationContext
): string {
  const lines = [
    REVOCATION_HISTORY_MARKER,
    `Event: ${resolveRevocationNotificationTitle(eventType)}`,
    `Business: ${context.businessName}`,
    `Permit number: ${context.permitNumber ?? "Not available"}`,
    `Violation / basis: ${context.violationBasis}`,
    `Date: ${context.eventDateLabel}`,
    `Department / officer: ${context.departmentOfficerLabel}`,
    `Next action: ${context.nextAction}`,
  ];

  if (context.decisionRemarks?.trim()) {
    lines.push(`Decision remarks: ${context.decisionRemarks.trim()}`);
  }

  return lines.join("\n");
}

export function buildRevocationApplicantMessage(context: RevocationNotificationContext): string {
  return [
    `Business: ${context.businessName}`,
    `Permit number: ${context.permitNumber ?? "Not available"}`,
    `Violation / basis: ${context.violationBasis}`,
    `Date: ${context.eventDateLabel}`,
    `Department / officer: ${context.departmentOfficerLabel}`,
    `Next action: ${context.nextAction}`,
  ].join(" ");
}

export function buildRevocationEmailSubject(
  eventType: RevocationNotificationEventType,
  applicationNumber: string
): string {
  return `${resolveRevocationNotificationTitle(eventType)} — ${applicationNumber}`;
}

export function buildRevocationEmailPlainText(
  eventType: RevocationNotificationEventType,
  context: RevocationNotificationContext
): string {
  const supportEmail = process.env.SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;

  return [
    resolveRevocationNotificationTitle(eventType),
    "",
    `Application: ${context.applicationNumber}`,
    `Business: ${context.businessName}`,
    `Permit number: ${context.permitNumber ?? "Not available"}`,
    "",
    `Violation / basis:`,
    context.violationBasis,
    "",
    `Date: ${context.eventDateLabel}`,
    `Department / officer: ${context.departmentOfficerLabel}`,
    "",
    `Next action:`,
    context.nextAction,
    context.decisionRemarks?.trim() ? `\nDecision remarks: ${context.decisionRemarks.trim()}` : "",
    "",
    `For assistance, contact BPLO at ${supportEmail}.`,
    "",
    "This is an automated notice. Please do not reply to this email.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatRevocationDateLabel(value: Date): string {
  return value.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function isRevocationHistoryRemarks(remarks: string | null | undefined): boolean {
  return Boolean(remarks?.includes(REVOCATION_HISTORY_MARKER));
}

export function extractRevocationApplicantMessage(remarks: string | null | undefined): string | null {
  if (!remarks || !isRevocationHistoryRemarks(remarks)) return null;

  const lines = remarks.split("\n").filter((line) => !line.startsWith(REVOCATION_HISTORY_MARKER));
  const useful = lines.filter((line) =>
    /^(Business:|Permit number:|Violation \/ basis:|Date:|Department \/ officer:|Next action:|Decision remarks:)/.test(line)
  );

  return useful.length > 0 ? useful.join(" ") : remarks.replace(REVOCATION_HISTORY_MARKER, "").trim();
}
