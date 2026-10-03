export type PaymentReferenceStatus = "PENDING" | "VERIFIED" | "RETURNED" | "REJECTED";

export interface PaymentReferenceEntry {
  id: string;
  transactionNumber: string;
  amountPaid: number;
  submittedAt: string;
  status: PaymentReferenceStatus;
  reviewerRemarks: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
}

const VERIFIED_APP_STATUSES = new Set(["PAID", "FOR_RELEASE", "RELEASED"]);

function parseNumber(val: unknown): number {
  const n = typeof val === "number" ? val : parseFloat(String(val ?? "0"));
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function parseStatus(
  raw: unknown,
  fallbackStatus: string
): PaymentReferenceStatus {
  if (raw === "PENDING" || raw === "VERIFIED" || raw === "RETURNED" || raw === "REJECTED") {
    return raw;
  }
  return VERIFIED_APP_STATUSES.has(fallbackStatus) ? "VERIFIED" : "PENDING";
}

function parseDateIso(raw: unknown, fallback: string): string {
  const value = typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

function fromRaw(
  raw: Record<string, unknown>,
  fallbackId: string,
  fallbackStatus: string
): PaymentReferenceEntry | null {
  const transactionNumber =
    typeof raw.transactionNumber === "string" ? raw.transactionNumber.trim() : "";

  if (!transactionNumber) return null;

  const submittedAtFallback = new Date().toISOString();
  const submittedAt = parseDateIso(raw.submittedAt, submittedAtFallback);

  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : fallbackId,
    transactionNumber,
    amountPaid: parseNumber(raw.amountPaid),
    submittedAt,
    status: parseStatus(raw.status, fallbackStatus),
    reviewerRemarks:
      typeof raw.reviewerRemarks === "string" && raw.reviewerRemarks.trim()
        ? raw.reviewerRemarks.trim()
        : null,
    reviewedAt:
      typeof raw.reviewedAt === "string" && raw.reviewedAt.trim()
        ? parseDateIso(raw.reviewedAt, submittedAt)
        : null,
    reviewedById:
      typeof raw.reviewedById === "string" && raw.reviewedById.trim()
        ? raw.reviewedById.trim()
        : null,
  };
}

export function getPaymentReferencesFromFormData(
  formDataInput: unknown,
  applicationId: string,
  applicationStatus: string
): PaymentReferenceEntry[] {
  const formData = (formDataInput ?? {}) as Record<string, unknown>;
  const refs: PaymentReferenceEntry[] = [];

  const rawArray = Array.isArray(formData.paymentReferences)
    ? (formData.paymentReferences as unknown[])
    : [];

  for (let i = 0; i < rawArray.length; i += 1) {
    const item = rawArray[i];
    if (!item || typeof item !== "object") continue;

    const parsed = fromRaw(
      item as Record<string, unknown>,
      `${applicationId}-ref-${i + 1}`,
      applicationStatus
    );

    if (parsed) refs.push(parsed);
  }

  if (refs.length === 0) {
    const legacy = formData.paymentReference;
    if (legacy && typeof legacy === "object") {
      const parsedLegacy = fromRaw(
        legacy as Record<string, unknown>,
        `legacy-${applicationId}`,
        applicationStatus
      );
      if (parsedLegacy) refs.push(parsedLegacy);
    }
  }

  refs.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  return refs;
}

export function getLatestPaymentReference(
  formDataInput: unknown,
  applicationId: string,
  applicationStatus: string
): PaymentReferenceEntry | null {
  const refs = getPaymentReferencesFromFormData(
    formDataInput,
    applicationId,
    applicationStatus
  );
  return refs.length > 0 ? refs[refs.length - 1] : null;
}

export function upsertPaymentReferencesInFormData(
  formDataInput: unknown,
  references: PaymentReferenceEntry[]
): Record<string, unknown> {
  const formData =
    formDataInput && typeof formDataInput === "object"
      ? { ...(formDataInput as Record<string, unknown>) }
      : {};

  const normalized = references
    .slice()
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  formData.paymentReferences = normalized;
  formData.paymentReference = normalized.length > 0 ? normalized[normalized.length - 1] : null;

  return formData;
}
