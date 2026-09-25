/**
 * Shared helpers for IT Administrator printable system reports.
 * Used only by /superadmin report pages — not for business permit or closure certificate print.
 */

// ── Business Permit Online System municipality constants ──────────────────────

export const EBPLS_REPORT_HEADING = {
  republic: "Republic of the Philippines",
  province: "Province of Negros Occidental",
  municipality: "Municipality of Enrique B. Magalona",
  office: "Business Permits and Licensing Office (BPLO)",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReportMetadata {
  title: string;
  generatedBy: string;
  generatedAt: string;
  dateRange: string;
  municipality: string;
  office: string;
}

export interface ReportDateParams {
  dateFrom?: string;
  dateTo?: string;
}

// ── Date filter parsers ───────────────────────────────────────────────────────

/** Parse ISO date string (YYYY-MM-DD) as start-of-day UTC. Returns undefined if blank or invalid. */
export function parseDateRangeStart(value?: string): Date | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Parse ISO date string (YYYY-MM-DD) as end-of-day UTC. Returns undefined if blank or invalid. */
export function parseDateRangeEnd(value?: string): Date | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(`${trimmed}T23:59:59.999Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

// ── Formatters ────────────────────────────────────────────────────────────────

/**
 * Format a date range as a human-readable string.
 * Returns "All dates" when both params are absent.
 */
export function formatReportDateRange(dateFrom?: string, dateTo?: string): string {
  if (!dateFrom && !dateTo) return "All dates";

  const fmt = (v: string) =>
    new Date(`${v}T00:00:00.000Z`).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });

  if (dateFrom && dateTo) return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
  if (dateFrom) return `From ${fmt(dateFrom)}`;
  return `Up to ${fmt(dateTo!)}`;
}

/** Format peso currency: ₱1,234.56 */
export function formatReportCurrency(value: number): string {
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format a Date (defaults to now) as a locale timestamp string. */
export function formatReportTimestamp(date?: Date): string {
  const d = date ?? new Date();
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

/** Format a Date value for display in report rows (date only). */
export function formatReportDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format a month/year as a human-readable reporting period. */
export function formatMonthYearLabel(month: number, year: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Inclusive UTC date range for a calendar month (month is 1–12). */
export function monthYearToDateRange(month: number, year: number): { start: Date; end: Date } {
  const safeMonth = Math.min(12, Math.max(1, month));
  const start = new Date(Date.UTC(year, safeMonth - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, safeMonth, 0, 23, 59, 59, 999));
  return { start, end };
}

export function reportPercentOf(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export function resolveReportMonthYear(params?: { month?: string; year?: string }): {
  month: number;
  year: number;
} {
  const now = new Date();
  const parsedMonth = Number.parseInt(params?.month ?? "", 10);
  const parsedYear = Number.parseInt(params?.year ?? "", 10);
  const month = parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : now.getUTCMonth() + 1;
  const year =
    parsedYear >= 2020 && parsedYear <= now.getUTCFullYear() + 1
      ? parsedYear
      : now.getUTCFullYear();
  return { month, year };
}

export const REPORT_MONTH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export function buildMonthlyReportMetadata(params: {
  title: string;
  generatedBy: string;
  month: number;
  year: number;
}): ReportMetadata {
  return {
    title: params.title,
    generatedBy: params.generatedBy,
    generatedAt: formatReportTimestamp(new Date()),
    dateRange: formatMonthYearLabel(params.month, params.year),
    municipality: EBPLS_REPORT_HEADING.municipality,
    office: EBPLS_REPORT_HEADING.office,
  };
}


/**
 * Build a ReportMetadata object for use in ReportPageHeader.
 * Call on the server; pass result as prop to the client component.
 */
export function buildReportMetadata(params: {
  title: string;
  generatedBy: string;
  dateFrom?: string;
  dateTo?: string;
}): ReportMetadata {
  return {
    title: params.title,
    generatedBy: params.generatedBy,
    generatedAt: formatReportTimestamp(new Date()),
    dateRange: formatReportDateRange(params.dateFrom, params.dateTo),
    municipality: EBPLS_REPORT_HEADING.municipality,
    office: EBPLS_REPORT_HEADING.office,
  };
}

// ── Safe empty data helper ────────────────────────────────────────────────────

/** Returns an empty array — safe default for report data that may have no records. */
export function emptyReportData<T>(): T[] {
  return [];
}

// ── Report display label helpers ──────────────────────────────────────────────

/** Convert DB application type to display label. */
export function labelApplicationType(type: string): string {
  if (type === "NEW") return "New";
  if (type === "RENEWAL") return "Renewal";
  if (type === "CLOSURE") return "Closure";
  return type;
}

/** Convert DB business record status to display label. */
export function labelBusinessStatus(status: string): string {
  if (status === "ACTIVE") return "Active";
  if (status === "INACTIVE") return "Inactive";
  if (status === "CLOSED") return "Closed";
  return status;
}

/** Convert DB permit issuance status to display label. */
export function labelPermitStatus(status: string): string {
  if (status === "PREPARED") return "Prepared";
  if (status === "FOR_RELEASE") return "For Release";
  if (status === "RELEASED") return "Released";
  return status;
}

// ── Report filter definitions (for query param driven pages) ─────────────────

export const APPLICATION_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All Statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "ASSESSED", label: "Assessed" },
  { value: "APPROVED_FOR_PAYMENT", label: "Approved for Payment" },
  { value: "PAID", label: "Paid" },
  { value: "FOR_RELEASE", label: "For Release" },
  { value: "RELEASED", label: "Released" },
  { value: "RETURNED_FOR_CORRECTION", label: "Returned for Correction" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DRAFT", label: "Draft" },
];

export const APPLICATION_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All Types" },
  { value: "NEW", label: "New" },
  { value: "RENEWAL", label: "Renewal" },
  { value: "CLOSURE", label: "Closure" },
];

export const BUSINESS_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "CLOSED", label: "Closed" },
];

export const INSPECTION_COMPLIANCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All Compliance" },
  { value: "PENDING_REVIEW", label: "Pending Review" },
  { value: "COMPLIANT", label: "Compliant" },
  { value: "NON_COMPLIANT", label: "Non-Compliant" },
];

export const INSPECTION_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All Statuses" },
  { value: "COMPLIANT", label: "Compliant" },
  { value: "NON_COMPLIANT", label: "Non-Compliant" },
  { value: "DH_VERIFICATION_PENDING", label: "Pending DH Verification" },
  { value: "VERIFIED_COMPLIANT", label: "Verified Compliant" },
  { value: "VERIFIED_NON_COMPLIANT", label: "Verified Non-Compliant" },
  { value: "REVOCATION_REVIEW", label: "Revocation Review" },
  { value: "REVOCATION_DENIED", label: "Revocation Denied" },
  { value: "REVOKED", label: "Revoked" },
];

export const SMS_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All Statuses" },
  { value: "SENT", label: "Sent" },
  { value: "FAILED", label: "Failed" },
  { value: "SKIPPED", label: "Skipped" },
];

export const AUDIT_MODULE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All Modules" },
  { value: "APPLICATION", label: "Application" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "PAYMENT", label: "Payment" },
  { value: "PERMIT", label: "Permit" },
  { value: "USER", label: "User" },
];

export const ACTOR_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All Roles" },
  { value: "APPLICANT", label: "Applicant" },
  { value: "BPLO", label: "BPLO" },
  { value: "SUPER_ADMIN", label: "IT Administrator" },
  { value: "DEPARTMENT_HEAD", label: "Department Head" },
  { value: "JIT", label: "JIT Inspector Portal" },
];

/**
 * Mask a Philippine mobile number for display.
 * Shows first 4 digits, masks middle, shows last 3.
 * Example: "09171234321" → "0917****321"
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "-";
  const s = phone.replace(/\s/g, "");
  if (s.length <= 7) return s;
  return `${s.slice(0, 4)}${"*".repeat(s.length - 7)}${s.slice(-3)}`;
}
