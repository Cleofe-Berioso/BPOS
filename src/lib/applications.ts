import type { ApplicationStatus as PrismaApplicationStatus } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { APPLICANT_ACCOUNT_NOT_FOUND_MESSAGE } from "@/lib/applicant-api";
import { mapDbStatusToUi, isEditableStatus } from "@/lib/application-mappers";
import { getMissingRequiredDocuments, resolveRequiredDocuments } from "@/lib/required-documents";
import { toMoneyNumber } from "@/lib/money";
import { resolveBucketByMimeType } from "@/lib/document-storage";
import { removeApplicantDocument, storeApplicantDocument } from "@/lib/document-storage";
import { mapDocumentValidationStatusToUi } from "@/lib/document-validation";
import {
  DOCUMENT_UPLOAD_ERROR_MAX_SIZE,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  validateDocumentFileUpload,
} from "@/lib/document-upload-rules";
import { buildPaginatedResult, resolvePagination, type PaginatedResult } from "@/lib/pagination";
import type { NotificationType } from "@/types/notifications";

function isRevocationHistoryRemarks(remarks: string | null | undefined): boolean {
  if (!remarks) return false;
  return /revocation/i.test(remarks);
}

function extractRevocationApplicantMessage(remarks: string | null | undefined): string | null {
  if (!remarks) return null;
  const match = remarks.match(/Reason:\s*([^|]+)/i) || remarks.match(/Remarks:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

function resolveRevocationNotificationTitle(type: "REVOCATION_REVIEW_ENTERED" | "REVOCATION_APPROVED" | "REVOCATION_DENIED"): string {
  switch (type) {
    case "REVOCATION_REVIEW_ENTERED":
      return "Permit Revocation Under Review";
    case "REVOCATION_APPROVED":
      return "Business Permit Revoked";
    case "REVOCATION_DENIED":
      return "Permit Revocation Request Denied";
  }
}
import {
  applyLockedBusinessFields,
  BUSINESS_ACTIVITY_OPTIONS,
  resolveBusinessBarangayFromFormState,
  isRecognizedEbMagalonaBarangay as isRecognizedEbMagalonaBarangayFromRules,
  normalizeBusinessInfo,
  normalizeRegistrationNumber,
  normalizeTin,
  optionalDecimalFromDb,
  optionalIntFromDb,
  tinFromDb,
  validateBusinessIdentityFormats,
  requiresCorporationNationality,
  isValidCorporationNationality,
  calculateAgeFromBirthDate,
} from "@/lib/business-rules";
import {
  EB_MAGALONA_CITY,
  EB_MAGALONA_COUNTRY,
  EB_MAGALONA_COUNTRY_CODE,
  EB_MAGALONA_PROVINCE,
  buildEbMagalonaBusinessAddress,
  isEbMagalonaCity,
  isEbMagalonaProvince,
  isPhilippinesCountry,
} from "@/lib/address-options";
import { isValidLineOfBusiness } from "@/lib/business-options";
import { isAllowedLineOfBusiness } from "@/lib/business-options-server";
import { isWithinEbMagalona } from "@/lib/eb-magalona";
import { isValidPhMobile } from "@/lib/ph-mobile";
import { resolveRenewalEligibilityForBusiness } from "@/lib/renewal-eligibility";
import { resolveClosureEligibilityForBusiness } from "@/lib/closure-eligibility";
import type {
  ApplicantApplicationRow,
  ApplicationDocumentInput,
  BusinessInfo,
  SaveApplicationInput,
  SubmitValidationErrorDetail,
} from "@/lib/applicant-types";

type DbApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ASSESSED"
  | "APPROVED_FOR_PAYMENT"
  | "PAID"
  | "FOR_RELEASE"
  | "RELEASED"
  | "RETURNED_FOR_CORRECTION"
  | "REJECTED";

type ApplicationWithDocs = {
  businessApplicationId?: string;
  id?: string;
  applicationNumber: string;
  applicationType: "NEW" | "RENEWAL" | "CLOSURE";
  status: DbApplicationStatus;
  formData: unknown;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  documents: Array<{
    applicationDocumentId?: string;
    id?: string;
    documentName: string;
    fileName: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: Date;
  }>;
  businessRecord: { businessName: string } | null;
};

interface SafeApplicantDocument {
  id: string;
  documentName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  validationStatus: string;
  validationRemarks: string | null;
  validatedAt: Date | null;
}

interface SubmitFileInput {
  documentName: string;
  file: File;
}

interface StagedSubmitDocument {
  documentName: string;
  fileName: string;
  storagePath: string;
  bucket?: string;
  filePath?: string;
  originalName?: string;
  mimeType: string;
  sizeBytes: number;
  fileSize?: number;
}

function toSafeApplicantDocument(doc: {
  applicationDocumentId?: string;
  id?: string;
  documentName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  validationStatus?: string;
  validationRemarks?: string | null;
  validatedAt?: Date | null;
}): SafeApplicantDocument {
  return {
    id: doc.applicationDocumentId ?? doc.id ?? "",
    documentName: doc.documentName,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    uploadedAt: doc.uploadedAt,
    validationStatus: mapDocumentValidationStatusToUi(doc.validationStatus),
    validationRemarks: doc.validationRemarks ?? null,
    validatedAt: doc.validatedAt ?? null,
  };
}

const REQUIRED_FIELD_KEYS: Array<keyof BusinessInfo> = [
  "businessType",
  "registrationNumber",
  "tin",
  "businessName",
  "ownerName",
  "email",
  "phone",
  "businessAddress",
  "lineOfBusiness",
  "businessActivity",
];

const ALLOWED_PAYMENT_FREQUENCIES = ["ANNUAL", "BI_ANNUAL", "QUARTERLY"] as const;

function parsePositiveAmount(value: string): number | null {
  const normalized = value.replace(/[,\s]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseNonNegativeAmount(value: string): number | null {
  const normalized = value.replace(/[,\s]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeEmployeeCountInput(value: string): string {
  const compact = value.replace(/[,\s]/g, "").trim();
  if (!compact) return "";

  // Accept integer-like strings (e.g., "12", "12.0") and normalize to canonical integer string.
  if (/^\d+(?:\.0+)?$/.test(compact)) {
    return String(Number(compact));
  }

  return value.trim();
}

export function resolveBusinessBarangaySelection(
  input: Pick<
    BusinessInfo,
    | "barangay"
    | "businessBarangay"
    | "sameAsMainOffice"
    | "mainOfficeBarangay"
    | "mainOfficeCountry"
    | "mainOfficeCountryCode"
    | "mainOfficeProvince"
    | "mainOfficeCityMunicipality"
  >
): string {
  return resolveBusinessBarangayFromFormState(input);
}

export function isRecognizedEbMagalonaBarangay(value: string): boolean {
  return isRecognizedEbMagalonaBarangayFromRules(value);
}

function normalizeSubmitFormDataCandidate(input: BusinessInfo, applicantEmail: string | null): BusinessInfo {
  const formEmail = input.email.trim();
  const fallbackEmail = applicantEmail?.trim() ?? "";
  const resolvedEmail = formEmail || fallbackEmail;

  const resolvedBarangay = resolveBusinessBarangaySelection(input);
  const resolvedTotalEmployees = normalizeEmployeeCountInput(input.totalEmployees ?? "");
  const resolvedAssetSize = (input.assetSize?.trim() || input.capitalInvestment?.trim() || "").trim();
  const resolvedStreetAddress = (input.businessStreetAddress?.trim() || input.streetAddress?.trim() || "").trim();

  return normalizeBusinessInfo({
    ...input,
    email: resolvedEmail,
    streetAddress: resolvedStreetAddress,
    businessStreetAddress: resolvedStreetAddress,
    barangay: resolvedBarangay,
    businessBarangay: resolvedBarangay,
    businessAddress: buildEbMagalonaBusinessAddress({
      streetAddress: resolvedStreetAddress,
      barangay: resolvedBarangay,
    }),
    totalEmployees: resolvedTotalEmployees,
    assetSize: resolvedAssetSize,
  });
}

function parseBusinessActivity(value: string): { selected: string; otherText: string } {
  const trimmed = value.trim();
  if (!trimmed) return { selected: "", otherText: "" };

  if (trimmed.startsWith("Others:")) {
    return {
      selected: "Others, please specify",
      otherText: trimmed.slice("Others:".length).trim(),
    };
  }

  if (trimmed === "Others, please specify") {
    return { selected: trimmed, otherText: "" };
  }

  if ((BUSINESS_ACTIVITY_OPTIONS as readonly string[]).includes(trimmed)) {
    return { selected: trimmed, otherText: "" };
  }

  return { selected: "Others, please specify", otherText: trimmed };
}

function resolveRenewalLineOfBusiness(source: BusinessInfo | null, candidate: string): string {
  const sourceLineOfBusiness = source?.lineOfBusiness?.trim() ?? "";
  if (isValidLineOfBusiness(sourceLineOfBusiness)) {
    return sourceLineOfBusiness;
  }
  return candidate.trim();
}

export class SubmitValidationError extends Error {
  detail: SubmitValidationErrorDetail;

  constructor(detail: SubmitValidationErrorDetail) {
    super("Submit validation failed");
    this.name = "SubmitValidationError";
    this.detail = detail;
  }
}

export class ApplicantEligibilityError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "ApplicantEligibilityError";
    this.status = status;
  }
}

export const DUPLICATE_BUSINESS_IDENTITY_MESSAGE = "This already exist";

export class DuplicateBusinessIdentityError extends Error {
  field: "registrationNumber" | "tin";

  constructor(field: "registrationNumber" | "tin") {
    super(DUPLICATE_BUSINESS_IDENTITY_MESSAGE);
    this.name = "DuplicateBusinessIdentityError";
    this.field = field;
  }
}

function readFormDataIdentity(formData: unknown): { registrationNumber: string; tin: string } {
  const data = (formData ?? {}) as Record<string, unknown>;
  return {
    registrationNumber:
      typeof data.registrationNumber === "string" ? normalizeRegistrationNumber(data.registrationNumber) : "",
    tin: typeof data.tin === "string" ? normalizeTin(data.tin) : "",
  };
}

/**
 * Blocks save/submit when registration number or TIN exactly matches an existing
 * business record or active application (case/spacing-insensitive for registration,
 * digits-only for TIN). Blank values are ignored so partial drafts can be saved.
 */
async function assertUniqueBusinessIdentity(params: {
  registrationNumber: string;
  tin: string;
  excludeBusinessRecordId?: string | null;
  excludeApplicationId?: string | null;
}): Promise<void> {
  const registrationNumber = normalizeRegistrationNumber(params.registrationNumber);
  const tin = normalizeTin(params.tin);
  const excludeRecordId = params.excludeBusinessRecordId ?? "";
  const excludeAppId = params.excludeApplicationId ?? "";

  if (!registrationNumber && !tin) {
    return;
  }

  if (registrationNumber) {
    const dupRecord = await prisma.businessRecord.findFirst({
      where: {
        registrationNumber: { equals: registrationNumber, mode: "insensitive" },
        ...(excludeRecordId ? { NOT: { businessRecordId: excludeRecordId } } : {}),
      },
      select: { businessRecordId: true },
    });
    if (dupRecord) {
      throw new DuplicateBusinessIdentityError("registrationNumber");
    }
  }

  if (tin) {
    const tinValue = BigInt(tin);
    const tinRecords = await prisma.businessRecord.findMany({
      where: {
        tin: tinValue,
        ...(excludeRecordId ? { NOT: { businessRecordId: excludeRecordId } } : {}),
      },
      select: { businessRecordId: true },
    });
    if (tinRecords.length > 0) {
      throw new DuplicateBusinessIdentityError("tin");
    }
  }

  const activeApplications = await prisma.businessApplication.findMany({
    where: {
      status: { notIn: ["REJECTED", "REVOKED"] },
      ...(excludeAppId ? { businessApplicationId: { not: excludeAppId } } : {}),
      ...(excludeRecordId
        ? {
            OR: [{ businessRecordId: null }, { businessRecordId: { not: excludeRecordId } }],
          }
        : {}),
    },
    select: {
      businessApplicationId: true,
      formData: true,
    },
  });

  for (const application of activeApplications) {
    const identity = readFormDataIdentity(application.formData);
    if (registrationNumber && identity.registrationNumber === registrationNumber) {
      throw new DuplicateBusinessIdentityError("registrationNumber");
    }
    if (tin && identity.tin === tin) {
      throw new DuplicateBusinessIdentityError("tin");
    }
  }
}

const ELIGIBLE_EXISTING_BUSINESS_STATUSES: DbApplicationStatus[] = [
  "PAID",
  "FOR_RELEASE",
  "RELEASED",
];

type ClosureTypeValue = "RETIREMENT" | "NON_COMPLIANT_RELATED" | "OTHERS";

function normalizeClosureType(value?: string | null): ClosureTypeValue | null {
  if (value === "RETIREMENT" || value === "NON_COMPLIANT_RELATED" || value === "OTHERS") {
    return value;
  }
  return null;
}

function validateClosureSubmissionRules(input: SaveApplicationInput, closureEligibility: { isComplianceForcedClosure: boolean } | null) {
  const closureType = normalizeClosureType(input.closureType);
  const otherReason = input.closureTypeOtherReason?.trim() ?? "";

  if (!closureType) {
    throw new Error("Closure type is required");
  }

  if (closureEligibility?.isComplianceForcedClosure && closureType !== "NON_COMPLIANT_RELATED") {
    throw new Error("This business requires non-compliant related closure processing.");
  }

  if (closureType === "OTHERS" && !otherReason) {
    throw new Error("Please specify the closure reason when selecting Others.");
  }

  // Validate closure operation fields stored in formData
  const fd = input.formData;
  const closureMissing: string[] = [];

  if (!fd.closureLineOfBusiness?.trim()) {
    closureMissing.push("closureLineOfBusiness");
  }

  const rawActivity = fd.closureBusinessActivity?.trim() ?? "";
  if (!rawActivity) {
    closureMissing.push("closureBusinessActivity");
  } else if (rawActivity.startsWith("Others:") && rawActivity.substring(7).trim().length === 0) {
    closureMissing.push("closureBusinessActivity (specify is required when Others is selected)");
  }

  if (!fd.closureLastDateOfOperation?.trim()) {
    closureMissing.push("closureLastDateOfOperation");
  } else {
    const parsed = new Date(fd.closureLastDateOfOperation.trim());
    if (!Number.isFinite(parsed.getTime())) {
      closureMissing.push("closureLastDateOfOperation (invalid date)");
    } else if (parsed.getTime() > Date.now()) {
      closureMissing.push("closureLastDateOfOperation (cannot be in the future)");
    }
  }

  if (closureMissing.length > 0) {
    throw new SubmitValidationError({ missingFields: closureMissing, missingDocuments: [] });
  }
}

async function assertEligibleBusinessRecord(
  applicantId: string,
  input: SaveApplicationInput
): Promise<void> {
  if (input.applicationType === "NEW") return;

  if (!input.businessRecordId) {
    throw new ApplicantEligibilityError(
      "Renewal and closure submissions require an existing business record.",
      400
    );
  }

  if (input.applicationType === "RENEWAL") {
    const eligibility = await resolveRenewalEligibilityForBusiness(applicantId, input.businessRecordId);
    if (!eligibility.eligible) {
      throw new ApplicantEligibilityError(
        eligibility.userFriendlyReason ??
          "Selected business record is not yet eligible for renewal or closure. Complete business verification first.",
        eligibility.reasonCode === "BUSINESS_CLOSED" || eligibility.reasonCode === "EXISTING_RENEWAL_RULE_FAILED"
          ? 403
          : 409
      );
    }
    return;
  }

  if (input.applicationType === "CLOSURE") {
    const eligibility = await resolveClosureEligibilityForBusiness(applicantId, input.businessRecordId);
    if (!eligibility.eligible) {
      throw new ApplicantEligibilityError(
        eligibility.userFriendlyReason ??
          "Selected business record is not yet eligible for closure. Complete business verification first.",
        403
      );
    }
    return;
  }

  const businessRecord = await prisma.businessRecord.findFirst({
    where: {
      businessRecordId: input.businessRecordId,
      applicantId,
    },
    select: {
      businessRecordId: true,
      businessStatus: true,
      location: {
        select: {
          status: true,
        },
      },
      applications: {
        where: {
          status: {
            in: ELIGIBLE_EXISTING_BUSINESS_STATUSES,
          },
        },
        select: {
          businessApplicationId: true,
        },
        take: 1,
      },
    },
  });

  if (!businessRecord) {
    throw new ApplicantEligibilityError(
      "Selected business record was not found for this applicant.",
      403
    );
  }

  if (businessRecord.businessStatus === "CLOSED") {
    throw new ApplicantEligibilityError(
      "This business has already been closed and cannot be submitted for renewal or closure again.",
      403
    );
  }

  const hasVerifiedLocation = businessRecord.location?.status === "VERIFIED";
  const hasEligibleHistory = businessRecord.applications.length > 0;

  if (!hasVerifiedLocation && !hasEligibleHistory) {
    throw new ApplicantEligibilityError(
      "Selected business record is not yet eligible for renewal or closure. Complete business verification first.",
      403
    );
  }
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveBusinessName(formData: unknown, fallback: string | null): string {
  const data = (formData ?? {}) as Record<string, unknown>;
  const fromForm =
    typeof data.businessName === "string" && data.businessName.trim().length > 0
      ? data.businessName.trim()
      : null;
  return fromForm ?? fallback ?? "-";
}

function mapApplicationToRow(app: ApplicationWithDocs): ApplicantApplicationRow {
  const formData = app.formData as unknown as Partial<BusinessInfo>;

  return {
    id: app.businessApplicationId ?? app.id ?? "",
    applicationNumber: app.applicationNumber,
    businessName: formData.businessName ?? app.businessRecord?.businessName ?? "-",
    applicationType: app.applicationType as ApplicantApplicationRow["applicationType"],
    status: mapDbStatusToUi(app.status),
    dateSubmitted: app.submittedAt ? toDateOnly(app.submittedAt) : "-",
    updatedAt: app.updatedAt.toISOString(),
    canEdit: isEditableStatus(app.status),
  };
}

function mapSavedApplicationToRow(input: {
  id: string;
  applicationNumber: string;
  applicationType: ApplicantApplicationRow["applicationType"];
  status: DbApplicationStatus;
  submittedAt: Date | null;
  updatedAt: Date;
  formData: BusinessInfo;
}): ApplicantApplicationRow {
  return {
    id: input.id,
    applicationNumber: input.applicationNumber,
    businessName: resolveBusinessName(input.formData, null),
    applicationType: input.applicationType,
    status: mapDbStatusToUi(input.status),
    dateSubmitted: input.submittedAt ? toDateOnly(input.submittedAt) : "-",
    updatedAt: input.updatedAt.toISOString(),
    canEdit: isEditableStatus(input.status),
  };
}

async function generateApplicationNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const countThisYear = await prisma.businessApplication.count({
    where: {
      createdAt: {
        gte: yearStart,
        lt: yearEnd,
      },
    },
  });

  return `EBPLS-${year}-${String(countThisYear + 1).padStart(4, "0")}`;
}

function sanitizeDocuments(documents: SaveApplicationInput["documents"]) {
  return documents
    .filter((doc) => doc.documentName.trim() && doc.fileName.trim())
    .map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      documentName: doc.documentName.trim(),
      fileName: doc.fileName.trim(),
      storagePath: doc.storagePath,
      bucket: doc.bucket,
      filePath: doc.filePath,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      fileSize: doc.fileSize,
    }));
}

function sanitizeSubmitFiles(submitFiles: SubmitFileInput[]) {
  const sanitized = submitFiles
    .filter((entry) => entry.documentName.trim().length > 0)
    .map((entry) => ({
      documentName: entry.documentName.trim(),
      file: entry.file,
    }));

  const oversized = sanitized.find((entry) => entry.file.size > MAX_DOCUMENT_FILE_SIZE_BYTES);
  if (oversized) {
    throw new Error(DOCUMENT_UPLOAD_ERROR_MAX_SIZE);
  }

  for (const entry of sanitized) {
    const fileValidationError = validateDocumentFileUpload(entry.file);
    if (fileValidationError) {
      throw new Error(fileValidationError);
    }
  }

  const seen = new Set<string>();
  for (const entry of sanitized) {
    const normalizedName = entry.documentName.toLowerCase();
    if (seen.has(normalizedName)) {
      throw new Error(`Duplicate uploaded document entry for ${entry.documentName}.`);
    }
    seen.add(normalizedName);
  }

  return sanitized;
}

function buildBusinessInfoFromRecord(record: any): BusinessInfo {
  return normalizeBusinessInfo({
    businessType: record.businessType as BusinessInfo["businessType"],
    registrationNumber: record.registrationNumber,
    paymentFrequency: "ANNUAL",
    tin: tinFromDb(record.tin),
    businessName: record.businessName,
    tradeName: record.tradeName,
    ownerName: record.ownerName,
    sex: record.sex ?? undefined,
    nationality: record.nationality,
    email: record.email,
    phone: record.phone,
    mainOfficeAddress: record.mainOfficeAddress,
    businessAddress: record.businessAddress,
    businessLatitude: record.location?.latitude ?? null,
    businessLongitude: record.location?.longitude ?? null,
    sameAsMainOffice: record.sameAsMainOffice,
    businessArea: optionalDecimalFromDb(record.businessArea),
    totalFloorArea: optionalDecimalFromDb(record.totalFloorArea),
    totalEmployees: optionalIntFromDb(record.totalEmployees),
    maleEmployees: optionalIntFromDb(record.maleEmployees),
    femaleEmployees: optionalIntFromDb(record.femaleEmployees),
    employeesWithinMunicipality: optionalIntFromDb(record.employeesWithinMunicipality),
    deliveryVehicles: optionalIntFromDb(record.deliveryVehicles),
    propertyOwnership: (record.propertyOwnership as BusinessInfo["propertyOwnership"]) ?? "Owned",
    taxDeclarationNumber: record.taxDeclarationNumber ?? "",
    propertyIdentificationNumber: record.propertyIdentificationNumber ?? "",
    orNumber: (record as any).orNumber ?? "",
    taxIncentives: record.taxIncentives ?? "",
    businessActivity: record.businessActivity ?? "",
    lineOfBusiness: record.lineOfBusiness ?? "",
    assetSize: optionalDecimalFromDb(record.assetSize),
    isMarket: Boolean(record.isMarket),
    isAgriculture: Boolean(record.isAgriculture),
    isLiquorOrTobacco: Boolean(record.isLiquorOrTobacco),
    birthDate: "",
    ownerAge: "",
    capitalInvestment: "",
    grossProfit: "",
  });
}

async function getApplicantBusinessRecordSource(applicantId: string, businessRecordId?: string | null) {
  if (!businessRecordId) {
    return null;
  }

  const record = await prisma.businessRecord.findFirst({
    where: {
      businessRecordId,
      applicantId,
    },
  });

  return record ? buildBusinessInfoFromRecord(record) : null;
}

async function validateSubmitPayload(
  input: SaveApplicationInput,
  normalizedFormData: BusinessInfo,
  mergedDocuments: ApplicationDocumentInput[]
) {
  const fieldErrors: Record<string, string> = {};
  const pinRequired = input.applicationType === "NEW" || input.applicationType === "RENEWAL";

  if (pinRequired) {
    if (
      typeof normalizedFormData.businessLatitude !== "number" ||
      typeof normalizedFormData.businessLongitude !== "number" ||
      !isWithinEbMagalona(normalizedFormData.businessLatitude, normalizedFormData.businessLongitude)
    ) {
      throw new Error("Please pin the business location inside EB Magalona.");
    }
  }

  // For CLOSURE applications, businessAddress, lineOfBusiness, and businessActivity
  // are sourced from the existing business record and are not re-entered in the form.
  const closureExcludedKeys = new Set<keyof BusinessInfo>(
    input.applicationType === "CLOSURE"
      ? ["businessAddress", "lineOfBusiness", "businessActivity"]
      : []
  );

  const missingFields = REQUIRED_FIELD_KEYS.filter((key) => {
    if (closureExcludedKeys.has(key)) return false;
    const value = normalizedFormData[key];
    return typeof value !== "string" || value.trim().length === 0;
  }).map((key) => String(key));

  const identityFormats = validateBusinessIdentityFormats(normalizedFormData);
  if (!identityFormats.registrationNumber || !identityFormats.tin) {
    throw new Error("Wrong Format");
  }

  if (input.applicationType === "NEW") {
    const capitalRaw = normalizedFormData.capitalInvestment?.trim() ?? "";
    if (!capitalRaw) {
      missingFields.push("capitalInvestment");
    } else if (parsePositiveAmount(capitalRaw) == null) {
      missingFields.push("capitalInvestment (must be a positive number)");
    }

    const birthDateRaw = normalizedFormData.birthDate?.trim() ?? "";
    if (birthDateRaw) {
      try {
        const age = calculateAgeFromBirthDate(birthDateRaw);
        if (age < 18) {
          missingFields.push("birthDate (owner must be at least 18 years old)");
        }
      } catch {
        missingFields.push("birthDate (invalid format)");
      }
    }
  }

  if (input.applicationType === "RENEWAL") {
    const grossRaw = normalizedFormData.grossProfit?.trim() ?? "";
    if (!grossRaw) {
      missingFields.push("grossProfit");
    } else if (parseNonNegativeAmount(grossRaw) == null) {
      missingFields.push("grossProfit (must be a non-negative number)");
    }

    const activity = parseBusinessActivity(normalizedFormData.businessActivity ?? "");
    if (!activity.selected) {
      missingFields.push("businessActivity");
    } else if (activity.selected === "Others, please specify" && !activity.otherText) {
      missingFields.push("businessActivity (specify activity is required when Others is selected)");
    }
  }

  if (input.applicationType === "NEW" || input.applicationType === "RENEWAL") {
    const normalizedNationality = normalizedFormData.nationality.trim();
    if (normalizedNationality.length === 0) {
      missingFields.push("nationality");
    }

    if (requiresCorporationNationality(normalizedFormData.businessType)) {
      const corpNationality = normalizedFormData.corporationNationality?.trim() ?? "";
      if (!corpNationality || !isValidCorporationNationality(corpNationality)) {
        missingFields.push("corporationNationality");
      }
    }

    if (!ALLOWED_PAYMENT_FREQUENCIES.includes(normalizedFormData.paymentFrequency)) {
      missingFields.push("paymentFrequency (must be ANNUAL, BI_ANNUAL, or QUARTERLY)");
    }

    const normalizedPhone = normalizedFormData.phone.replace(/[\s-]/g, "");
    if (!isValidPhMobile(normalizedPhone)) {
      missingFields.push("phone (must be a valid Philippine mobile number)");
    }

    const normalizedTelephone = normalizedFormData.telephone?.replace(/[\s-]/g, "") ?? "";
    if (normalizedTelephone.length > 0 && !/^(\+63|0)?[\d]{7,12}$/.test(normalizedTelephone)) {
      missingFields.push("telephone (invalid format)");
    }

    const email = normalizedFormData.email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      missingFields.push("email (invalid format)");
    }

    const assetSizeRaw = normalizedFormData.assetSize.trim();
    if (!assetSizeRaw) {
      missingFields.push("assetSize");
    } else if (parseNonNegativeAmount(assetSizeRaw) == null) {
      missingFields.push("assetSize (must be a non-negative number)");
    }
  }

  if (input.applicationType === "NEW" || input.applicationType === "RENEWAL") {
    const mainOfficePhilippines = isPhilippinesCountry(
      normalizedFormData.mainOfficeCountry,
      normalizedFormData.mainOfficeCountryCode
    );
    const requiredAddressFields: Array<keyof BusinessInfo> = [
      "mainOfficeCountry",
      "mainOfficeProvince",
      "mainOfficeCityMunicipality",
      "mainOfficeAddress",
    ];

    requiredAddressFields.push(
      mainOfficePhilippines ? "mainOfficeBarangay" : "mainOfficeStreetAddress"
    );

    for (const key of requiredAddressFields) {
      const value = normalizedFormData[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        missingFields.push(String(key));
      }
    }
  }

  if (input.applicationType === "NEW" || input.applicationType === "RENEWAL") {
    if (!normalizedFormData.lineOfBusiness.trim()) {
      missingFields.push("lineOfBusiness");
    } else if (!(await isAllowedLineOfBusiness(normalizedFormData.lineOfBusiness))) {
      missingFields.push("lineOfBusiness (must be one of the allowed options)");
    }

    if (normalizedFormData.country.trim() !== EB_MAGALONA_COUNTRY) {
      missingFields.push(`country (must be ${EB_MAGALONA_COUNTRY})`);
    }

    if (normalizedFormData.countryCode.trim().toUpperCase() !== EB_MAGALONA_COUNTRY_CODE) {
      missingFields.push(`countryCode (must be ${EB_MAGALONA_COUNTRY_CODE})`);
    }

    if (!isEbMagalonaProvince(normalizedFormData.province)) {
      missingFields.push(`province (must be ${EB_MAGALONA_PROVINCE})`);
    }

    if (!isEbMagalonaCity(normalizedFormData.cityMunicipality)) {
      missingFields.push(`cityMunicipality (must be ${EB_MAGALONA_CITY})`);
    }

    if (!normalizedFormData.streetAddress?.trim()) {
      missingFields.push("streetAddress");
    }

    const resolvedBarangay = resolveBusinessBarangaySelection(normalizedFormData);
    normalizedFormData.barangay = resolvedBarangay;
    normalizedFormData.businessBarangay = resolvedBarangay;

    if (!resolvedBarangay) {
      missingFields.push("barangay");
    } else if (
      !isRecognizedEbMagalonaBarangay(resolvedBarangay)
    ) {
      fieldErrors.barangay = "Business Barangay is not recognized. Please select from the EB Magalona barangay list.";
    }
  }

  if (input.applicationType === "NEW" || input.applicationType === "RENEWAL") {
    if (
      isPhilippinesCountry(
        normalizedFormData.mainOfficeCountry,
        normalizedFormData.mainOfficeCountryCode
      )
    ) {
      if (!normalizedFormData.mainOfficeBarangay?.trim()) {
        missingFields.push("mainOfficeBarangay");
      }
    } else if (!normalizedFormData.mainOfficeStreetAddress?.trim()) {
      missingFields.push("mainOfficeStreetAddress");
    }
  }

  if (input.applicationType === "NEW" || input.applicationType === "RENEWAL") {
    const totalEmployeesRaw = normalizedFormData.totalEmployees.trim();
    if (!totalEmployeesRaw) {
      missingFields.push("totalEmployees");
    } else {
      const employees = Number(totalEmployeesRaw.replace(/[,\s]/g, ""));
      if (!Number.isFinite(employees) || employees < 0 || !Number.isInteger(employees)) {
        missingFields.push("totalEmployees (must be a non-negative integer)");
      }
    }

    if (normalizedFormData.hasTaxIncentives !== "YES" && normalizedFormData.hasTaxIncentives !== "NO") {
      missingFields.push("hasTaxIncentives");
    } else if (
      normalizedFormData.hasTaxIncentives === "YES" &&
      !normalizedFormData.taxIncentives.trim()
    ) {
      missingFields.push("taxIncentives");
    }
  }

  if ((input.applicationType === "RENEWAL" || input.applicationType === "CLOSURE") && !input.businessRecordId) {
    missingFields.push("businessRecordId");
  }

  const requiredDocs = resolveRequiredDocuments({
    applicationType: input.applicationType,
    formData: normalizedFormData,
  });

  const missingDocuments = getMissingRequiredDocuments(
    requiredDocs,
    mergedDocuments.map((doc) => doc.documentName)
  );

  const invalidDocumentMetadata = requiredDocs
    .filter((requiredDoc) => {
      const candidates = mergedDocuments.filter(
        (doc) => doc.documentName.trim().toLowerCase() === requiredDoc.trim().toLowerCase()
      );

      if (candidates.length === 0) return false;

      return !candidates.some(
        (doc) =>
          doc.fileName?.trim() &&
          doc.mimeType?.trim() &&
          typeof doc.sizeBytes === "number" &&
          doc.sizeBytes > 0
      );
    })
    .map((doc) => `${doc} (invalid file metadata)`);

  const oversizedDocuments = mergedDocuments
    .filter((doc) => {
      const size =
        typeof doc.sizeBytes === "number"
          ? doc.sizeBytes
          : typeof doc.fileSize === "number"
            ? doc.fileSize
            : 0;
      return size > MAX_DOCUMENT_FILE_SIZE_BYTES;
    })
    .map((doc) => `${doc.documentName} (exceeds 10MB max file size)`);

  if (
    missingFields.length ||
    Object.keys(fieldErrors).length > 0 ||
    missingDocuments.length ||
    invalidDocumentMetadata.length ||
    oversizedDocuments.length
  ) {
    throw new SubmitValidationError({
      missingFields: [...missingFields, ...invalidDocumentMetadata, ...oversizedDocuments],
      missingDocuments,
      fieldErrors,
    });
  }
}

// Cached query for applicant applications - deduplicates per-request
const getCachedApplicantApplications = cache(
  async (applicantId: string): Promise<ApplicantApplicationRow[]> => {
    const applications = await prisma.businessApplication.findMany({
      where: { applicantId },
      include: {
        documents: true,
        businessRecord: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return (applications as ApplicationWithDocs[]).map(mapApplicationToRow);
  }
);

export async function listApplicantApplications(applicantId: string): Promise<ApplicantApplicationRow[]> {
  return getCachedApplicantApplications(applicantId);
}

export async function listApplicantApplicationsPaginated(
  applicantId: string,
  pagination?: { page?: number | string; pageSize?: number | string }
): Promise<PaginatedResult<ApplicantApplicationRow>> {
  const { page, pageSize, skip, take } = resolvePagination(pagination);

  const [applications, totalCount] = await Promise.all([
    prisma.businessApplication.findMany({
      where: { applicantId },
      include: {
        documents: true,
        businessRecord: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take,
    }),
    prisma.businessApplication.count({ where: { applicantId } }),
  ]);

  return buildPaginatedResult(
    (applications as ApplicationWithDocs[]).map(mapApplicationToRow),
    totalCount,
    page,
    pageSize
  );
}

export async function getApplicantLatestApplication(applicantId: string): Promise<ApplicantApplicationRow | null> {
  const application = await prisma.businessApplication.findFirst({
    where: { applicantId },
    include: {
      documents: true,
      businessRecord: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!application) return null;
  return mapApplicationToRow(application as ApplicationWithDocs);
}

export async function getApplicantApplicationDetail(applicantId: string, applicationId: string) {
  const app = await prisma.businessApplication.findFirst({
    where: {
      businessApplicationId: applicationId,
      applicantId,
    },
    include: {
      documents: true,
      history: {
        orderBy: {
          createdAt: "desc",
        },
      },
      businessRecord: true,
      permitIssuance: {
        select: {
          documentNumber: true,
          documentType: true,
          status: true,
          issuedAt: true,
          releasedAt: true,
        },
      },
    },
  });

  if (!app) return null;

  return {
    id: app.businessApplicationId,
    applicationNumber: app.applicationNumber,
    applicationType: app.applicationType as ApplicantApplicationRow["applicationType"],
    businessRecordId: app.businessRecordId,
    closureType: app.closureType ?? null,
    closureTypeOtherReason: app.closureTypeOtherReason ?? null,
    status: mapDbStatusToUi(app.status),
    canEdit: isEditableStatus(app.status),
    submittedAt: app.submittedAt ? app.submittedAt.toISOString() : null,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    formData: app.formData,
    documents: app.documents.map((doc: any) => ({
      id: doc.applicationDocumentId ?? doc.id,
      documentName: doc.documentName,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      uploadedAt: doc.uploadedAt.toISOString(),
      validationStatus: mapDocumentValidationStatusToUi(doc.validationStatus),
      validationRemarks: doc.validationRemarks ?? null,
      validatedAt: doc.validatedAt ? doc.validatedAt.toISOString() : null,
    })),
    history: app.history.map((item: any) => ({
      id: item.applicationHistoryId ?? item.id,
      fromStatus: item.fromStatus ? mapDbStatusToUi(item.fromStatus) : null,
      toStatus: mapDbStatusToUi(item.toStatus),
      remarks: item.remarks,
      createdAt: item.createdAt.toISOString(),
    })),
    permitIssuance: app.permitIssuance
      ? {
          documentNumber: app.permitIssuance.documentNumber,
          documentType: app.permitIssuance.documentType,
          status: app.permitIssuance.status,
          issuedAt: app.permitIssuance.issuedAt.toISOString(),
          releasedAt: app.permitIssuance.releasedAt
            ? app.permitIssuance.releasedAt.toISOString()
            : null,
        }
      : null,
  };
}

export async function saveApplicantApplication(
  applicantId: string,
  input: SaveApplicationInput,
  submitFiles: SubmitFileInput[] = []
) {
  const applicantUser = await prisma.user.findUnique({
    where: { userId: applicantId },
    select: { userId: true, email: true, role: true, isActive: true },
  });

  if (
    !applicantUser ||
    applicantUser.role !== "APPLICANT" ||
    !applicantUser.isActive
  ) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[ApplicantSubmission] invalid-applicant", {
        requestedApplicantId: applicantId,
        resolvedApplicantId: applicantUser?.userId ?? null,
        resolvedApplicantEmail: applicantUser?.email ?? null,
        resolvedApplicantRole: applicantUser?.role ?? null,
        resolvedApplicantActive: applicantUser?.isActive ?? null,
      });
    }

    throw new ApplicantEligibilityError(APPLICANT_ACCOUNT_NOT_FOUND_MESSAGE, 401);
  }

  const nextStatus = input.mode === "SUBMIT" ? "SUBMITTED" : "DRAFT";
  const normalizedInputFormData = normalizeSubmitFormDataCandidate(input.formData, applicantUser.email);
  const documents = sanitizeDocuments(input.documents);
  const normalizedSubmitFiles = sanitizeSubmitFiles(submitFiles);

  // For DRAFT: only validate format for non-empty fields (allow partial data).
  // For SUBMIT: both fields must be present and valid (format check runs in full).
  const rawRegNum = (normalizedInputFormData.registrationNumber ?? "").trim();
  const rawTin = (normalizedInputFormData.tin ?? "").trim();
  if (rawRegNum || rawTin || input.mode === "SUBMIT") {
    const rawIdentityFormats = validateBusinessIdentityFormats({
      businessType: normalizedInputFormData.businessType,
      registrationNumber: normalizedInputFormData.registrationNumber,
      tin: normalizedInputFormData.tin,
    });
    if (input.mode === "SUBMIT") {
      if (!rawIdentityFormats.registrationNumber || !rawIdentityFormats.tin) {
        throw new Error("Wrong Format");
      }
    } else {
      if (rawRegNum && !rawIdentityFormats.registrationNumber) throw new Error("Wrong Format");
      if (rawTin && !rawIdentityFormats.tin) throw new Error("Wrong Format");
    }
  }

  if (input.applicationType === "RENEWAL") {
    await assertEligibleBusinessRecord(applicantId, input);
  } else if (input.applicationType === "CLOSURE") {
    await assertEligibleBusinessRecord(applicantId, input);
  } else if (input.mode === "SUBMIT") {
    await assertEligibleBusinessRecord(applicantId, input);
  }

  const existing = input.applicationId
    ? await prisma.businessApplication.findFirst({
        where: {
          businessApplicationId: input.applicationId,
          applicantId,
        },
      })
    : null;

  if (input.applicationId && !existing) {
    throw new Error("Application not found");
  }

  if (existing && !isEditableStatus(existing.status)) {
    throw new Error("This application has already been submitted and is now locked for review.");
  }

  const existingDocuments = existing
    ? await prisma.applicationDocument.findMany({
        where: { applicationId: existing.businessApplicationId },
      })
    : [];

  const submitFileDocuments: ApplicationDocumentInput[] = normalizedSubmitFiles.map((entry) => ({
    documentName: entry.documentName,
    fileName: entry.file.name,
    mimeType: entry.file.type,
    sizeBytes: entry.file.size,
  }));

  const mergedDocuments: ApplicationDocumentInput[] = [
    ...existingDocuments.map((doc: any) => ({
      id: doc.id,
      documentName: doc.documentName,
      fileName: doc.fileName,
      storagePath: doc.storagePath,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      uploadedAt: doc.uploadedAt ? doc.uploadedAt.toISOString() : undefined,
    })),
    ...documents,
    ...submitFileDocuments,
  ];

  const sourceBusinessInfo = await getApplicantBusinessRecordSource(applicantId, input.businessRecordId);
  const normalizedFormData = applyLockedBusinessFields(
    input.applicationType,
    normalizedInputFormData,
    sourceBusinessInfo
  );

  if (process.env.NODE_ENV !== "production" && input.mode === "SUBMIT") {
    console.info("[ApplicantSubmission] submit-field-values", {
      applicationType: input.applicationType,
      usedEmailFallback:
        normalizedInputFormData.email.trim().length > 0 &&
        input.formData.email.trim().length === 0,
      rawBarangay: input.formData.barangay ?? null,
      rawBusinessBarangay: input.formData.businessBarangay ?? null,
      canonicalBarangay: normalizedFormData.barangay ?? null,
      barangayValidationState: normalizedFormData.barangay
        ? isRecognizedEbMagalonaBarangay(normalizedFormData.barangay)
          ? "valid"
          : "invalid"
        : "missing",
      cityValueUsedForValidation: normalizedFormData.cityMunicipality,
      email: normalizedFormData.email,
      assetSize: normalizedFormData.assetSize,
      barangay: normalizedFormData.barangay,
      businessBarangay: normalizedFormData.businessBarangay ?? null,
      totalEmployees: normalizedFormData.totalEmployees,
    });
  }

  const closureEligibility =
    input.applicationType === "CLOSURE" && input.businessRecordId
      ? await resolveClosureEligibilityForBusiness(applicantId, input.businessRecordId)
      : null;

  if (input.applicationType === "RENEWAL") {
    normalizedFormData.lineOfBusiness = resolveRenewalLineOfBusiness(
      sourceBusinessInfo,
      normalizedFormData.lineOfBusiness
    );
  }

  if (input.applicationType === "CLOSURE") {
    const closureLine = normalizedFormData.closureLineOfBusiness?.trim() ?? "";
    const closureActivity = normalizedFormData.closureBusinessActivity?.trim() ?? "";
    if (closureLine) {
      normalizedFormData.lineOfBusiness = closureLine;
    }
    if (closureActivity) {
      normalizedFormData.businessActivity = closureActivity;
    }
    if (
      !normalizedFormData.businessAddress.trim() &&
      sourceBusinessInfo?.businessAddress?.trim()
    ) {
      normalizedFormData.businessAddress = sourceBusinessInfo.businessAddress.trim();
    }
  }

  const normalizedRegNum = normalizedFormData.registrationNumber.trim();
  const normalizedTin = normalizedFormData.tin.trim();
  if (normalizedRegNum || normalizedTin || input.mode === "SUBMIT") {
    const identityFormats = validateBusinessIdentityFormats(normalizedFormData);
    if (input.mode === "SUBMIT") {
      if (!identityFormats.registrationNumber || !identityFormats.tin) {
        throw new Error("Wrong Format");
      }
    } else {
      if (normalizedRegNum && !identityFormats.registrationNumber) throw new Error("Wrong Format");
      if (normalizedTin && !identityFormats.tin) throw new Error("Wrong Format");
    }
  }

  await assertUniqueBusinessIdentity({
    registrationNumber: normalizedFormData.registrationNumber,
    tin: normalizedFormData.tin,
    excludeBusinessRecordId: input.businessRecordId ?? null,
    excludeApplicationId: existing?.businessApplicationId ?? null,
  });

  if (input.mode === "SUBMIT") {
    if (input.applicationType === "CLOSURE") {
      validateClosureSubmissionRules(input, closureEligibility);
    }
    await validateSubmitPayload(input, normalizedFormData, mergedDocuments);
  }

  const persistedPayloadDocuments = documents.filter(
    (doc) =>
      typeof doc.storagePath === "string" &&
      doc.storagePath.trim().length > 0 &&
      typeof doc.mimeType === "string" &&
      doc.mimeType.trim().length > 0 &&
      typeof doc.sizeBytes === "number" &&
      doc.sizeBytes > 0
  );

  const writtenStoragePaths: string[] = [];
  const replacedStoragePaths: string[] = [];
  let createdApplicationId: string | null = null;

  try {
    const buildNewDocumentsByName = async (applicationId: string): Promise<Map<string, StagedSubmitDocument>> => {
      const newDocumentsByName = new Map<string, StagedSubmitDocument>();

      for (const doc of persistedPayloadDocuments) {
        newDocumentsByName.set(doc.documentName.toLowerCase(), {
          documentName: doc.documentName,
          fileName: doc.fileName,
          storagePath: doc.storagePath ?? "",
          bucket: doc.bucket ?? resolveBucketByMimeType(doc.mimeType ?? ""),
          filePath: doc.filePath ?? doc.storagePath ?? "",
          originalName: doc.originalName ?? doc.fileName,
          mimeType: doc.mimeType ?? "",
          sizeBytes: doc.sizeBytes ?? 0,
          fileSize: doc.fileSize ?? doc.sizeBytes ?? 0,
        });
      }

      if (input.mode === "SUBMIT" || normalizedSubmitFiles.length > 0) {
        for (const entry of normalizedSubmitFiles) {
          const stored = await storeApplicantDocument(entry.file, {
            applicationId,
            documentType: entry.documentName,
            applicantName: normalizedFormData.ownerName,
          });
          writtenStoragePaths.push(stored.storagePath);
          newDocumentsByName.set(entry.documentName.toLowerCase(), {
            documentName: entry.documentName,
            fileName: stored.fileName,
            storagePath: stored.storagePath,
            bucket: stored.bucket,
            filePath: stored.storagePath,
            originalName: entry.file.name || stored.fileName,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            fileSize: stored.sizeBytes,
          });
        }
      }

      return newDocumentsByName;
    };

    if (existing) {
      // Upload files BEFORE the DB transaction — storage I/O for many documents
      // exceeds Prisma's default 5s interactive transaction timeout on Vercel.
      const newDocumentsByName =
        input.mode === "SUBMIT" || normalizedSubmitFiles.length > 0
          ? await buildNewDocumentsByName(existing.businessApplicationId)
          : null;

      const updated = await prisma.$transaction(
        async (tx: any) => {
          const row = await tx.businessApplication.update({
            where: { businessApplicationId: existing.businessApplicationId },
            data: {
              applicationType: input.applicationType,
              businessRecordId: input.businessRecordId ?? null,
              closureType:
                input.applicationType === "CLOSURE" ? normalizeClosureType(input.closureType) : null,
              closureTypeOtherReason:
                input.applicationType === "CLOSURE"
                  ? normalizeClosureType(input.closureType) === "OTHERS"
                    ? input.closureTypeOtherReason?.trim() || null
                    : null
                  : null,
              status: nextStatus,
              formData: normalizedFormData,
              submittedAt: input.mode === "SUBMIT" ? new Date() : null,
            },
          });

          // Persist newly uploaded files on draft save as well as final submit so
          // reopening a draft does not force the applicant to re-upload documents.
          if (newDocumentsByName) {
            for (const doc of newDocumentsByName.values()) {
              const existingDoc = await tx.applicationDocument.findFirst({
                where: {
                  applicationId: existing.businessApplicationId,
                  documentName: doc.documentName,
                },
              });

              if (existingDoc) {
                if (existingDoc.storagePath !== doc.storagePath) {
                  replacedStoragePaths.push(existingDoc.storagePath);
                }

                const storageChanged = existingDoc.storagePath !== doc.storagePath;

                await tx.applicationDocument.update({
                  where: { applicationDocumentId: existingDoc.applicationDocumentId },
                  data: {
                    fileName: doc.fileName,
                    storagePath: doc.storagePath,
                    bucket: doc.bucket,
                    filePath: doc.filePath,
                    originalName: doc.originalName,
                    mimeType: doc.mimeType,
                    sizeBytes: doc.sizeBytes,
                    fileSize: doc.fileSize,
                    uploadedAt: new Date(),
                    ...(storageChanged
                      ? {
                          validationStatus: "PENDING_REVIEW",
                          validationRemarks: null,
                          validatedAt: null,
                          validatedById: null,
                        }
                      : {}),
                  },
                });
              } else {
                await tx.applicationDocument.create({
                  data: {
                    applicationId: existing.businessApplicationId,
                    documentName: doc.documentName,
                    fileName: doc.fileName,
                    storagePath: doc.storagePath,
                    bucket: doc.bucket,
                    filePath: doc.filePath,
                    originalName: doc.originalName,
                    mimeType: doc.mimeType,
                    sizeBytes: doc.sizeBytes,
                    fileSize: doc.fileSize,
                  },
                });
              }
            }
          }

          await tx.applicationHistory.create({
            data: {
              applicationId: existing.businessApplicationId,
              actorId: applicantId,
              actorRole: "APPLICANT",
              fromStatus: existing.status,
              toStatus: nextStatus,
              remarks: input.mode === "SUBMIT" ? "Applicant submitted application" : "Applicant saved draft",
            },
          });

          return row;
        },
        { timeout: 30_000, maxWait: 10_000 }
      );

      for (const storagePath of replacedStoragePaths) {
        await removeApplicantDocument(storagePath);
      }

      if (process.env.NODE_ENV !== "production") {
        console.info("[ApplicantSubmission] update", {
          applicantId,
          applicationId: updated.businessApplicationId,
          applicationNumber: updated.applicationNumber,
          mode: input.mode,
          applicationType: input.applicationType,
          status: updated.status,
          submittedAt: updated.submittedAt ? updated.submittedAt.toISOString() : null,
        });
      }

      return mapSavedApplicationToRow({
        id: updated.businessApplicationId,
        applicationNumber: updated.applicationNumber,
        applicationType: input.applicationType,
        status: updated.status,
        submittedAt: updated.submittedAt,
        updatedAt: updated.updatedAt,
        formData: normalizedFormData,
      });
    }

    const applicationNumber = await generateApplicationNumber();

    // Create the application row first so storage uploads have a stable applicationId,
    // then upload outside any interactive transaction, then write document rows.
    const created = await prisma.businessApplication.create({
      data: {
        applicationNumber,
        applicantId,
        businessRecordId: input.businessRecordId ?? null,
        applicationType: input.applicationType,
        closureType:
          input.applicationType === "CLOSURE" ? normalizeClosureType(input.closureType) : null,
        closureTypeOtherReason:
          input.applicationType === "CLOSURE"
            ? normalizeClosureType(input.closureType) === "OTHERS"
              ? input.closureTypeOtherReason?.trim() || null
              : null
            : null,
        status: nextStatus,
        formData: normalizedFormData as object,
        submittedAt: input.mode === "SUBMIT" ? new Date() : null,
      },
    });
    createdApplicationId = created.businessApplicationId;
    const newDocumentsByName =
      input.mode === "SUBMIT" || normalizedSubmitFiles.length > 0
        ? await buildNewDocumentsByName(created.businessApplicationId)
        : null;

    await prisma.$transaction(
      async (tx: any) => {
        if (newDocumentsByName) {
          for (const doc of newDocumentsByName.values()) {
            await tx.applicationDocument.create({
              data: {
                applicationId: created.businessApplicationId,
                documentName: doc.documentName,
                fileName: doc.fileName,
                storagePath: doc.storagePath,
                bucket: doc.bucket,
                filePath: doc.filePath,
                originalName: doc.originalName,
                mimeType: doc.mimeType,
                sizeBytes: doc.sizeBytes,
                fileSize: doc.fileSize,
              },
            });
          }
        }

        await tx.applicationHistory.create({
          data: {
            applicationId: created.businessApplicationId,
            actorId: applicantId,
            actorRole: "APPLICANT",
            fromStatus: null,
            toStatus: nextStatus,
            remarks: input.mode === "SUBMIT" ? "Applicant submitted application" : "Applicant saved draft",
          },
        });
      },
      { timeout: 30_000, maxWait: 10_000 }
    );
    if (process.env.NODE_ENV !== "production") {
      console.info("[ApplicantSubmission] create", {
        applicantId,
        applicationId: created.businessApplicationId,
        applicationNumber: created.applicationNumber,
        mode: input.mode,
        applicationType: input.applicationType,
        status: created.status,
        submittedAt: created.submittedAt ? created.submittedAt.toISOString() : null,
      });
    }

    return mapSavedApplicationToRow({
      id: created.businessApplicationId,
      applicationNumber: created.applicationNumber,
      applicationType: input.applicationType,
      status: nextStatus,
      submittedAt: created.submittedAt,
      updatedAt: created.updatedAt,
      formData: normalizedFormData,
    });
  } catch (error) {
    for (const storagePath of writtenStoragePaths) {
      await removeApplicantDocument(storagePath);
    }
    if (createdApplicationId) {
      await prisma.businessApplication
        .delete({ where: { businessApplicationId: createdApplicationId } })
        .catch(() => undefined);
    }
    throw error;
  }
}

export async function createApplicantDocument(
  applicantId: string,
  applicationId: string,
  input: {
    documentName: string;
    fileName: string;
    storagePath: string;
    bucket?: string;
    filePath?: string;
    originalName?: string;
    mimeType: string;
    sizeBytes: number;
    fileSize?: number;
  }
) {
  const application = await prisma.businessApplication.findFirst({
    where: {
      businessApplicationId: applicationId,
      applicantId,
    },
  });

  if (!application) throw new Error("Application not found");
  if (!isEditableStatus(application.status)) {
    throw new Error("This application has already been submitted and is now locked for review.");
  }

  const existing = await prisma.applicationDocument.findFirst({
    where: {
      applicationId,
      documentName: input.documentName,
    },
  });

  if (existing) {
    const storageChanged = existing.storagePath !== input.storagePath;
    const updated = await prisma.applicationDocument.update({
      where: { applicationDocumentId: existing.applicationDocumentId },
      data: {
        fileName: input.fileName,
        storagePath: input.storagePath,
        bucket: input.bucket ?? resolveBucketByMimeType(input.mimeType),
        filePath: input.filePath ?? input.storagePath,
        originalName: input.originalName ?? input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        fileSize: input.fileSize ?? input.sizeBytes,
        uploadedAt: new Date(),
        ...(storageChanged
          ? {
              validationStatus: "PENDING_REVIEW",
              validationRemarks: null,
              validatedAt: null,
              validatedById: null,
            }
          : {}),
      },
    } as any);
    return updated;
  }

  const created = await prisma.applicationDocument.create({
    data: {
      applicationId,
      documentName: input.documentName,
      fileName: input.fileName,
      storagePath: input.storagePath,
      bucket: input.bucket ?? resolveBucketByMimeType(input.mimeType),
      filePath: input.filePath ?? input.storagePath,
      originalName: input.originalName ?? input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      fileSize: input.fileSize ?? input.sizeBytes,
    },
  } as any);

  return created;
}

export async function listApplicantDocuments(applicantId: string, applicationId: string) {
  const application = await prisma.businessApplication.findFirst({
    where: {
      businessApplicationId: applicationId,
      applicantId,
    },
    include: {
      documents: true,
    },
  });

  if (!application) throw new Error("Application not found");

  return application.documents.map(toSafeApplicantDocument);
}

export async function getApplicantOwnedDocument(applicantId: string, applicationId: string, documentId: string) {
  const document = await prisma.applicationDocument.findFirst({
    where: {
      applicationDocumentId: documentId,
      applicationId,
      application: {
        applicantId,
      },
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  return document;
}

export async function deleteApplicantDocument(applicantId: string, applicationId: string, documentId: string) {
  const application = await prisma.businessApplication.findFirst({
    where: {
      businessApplicationId: applicationId,
      applicantId,
    },
  });

  if (!application) throw new Error("Application not found");
  if (!isEditableStatus(application.status)) {
    throw new Error("This application has already been submitted and is now locked for review.");
  }

  const doc = await prisma.applicationDocument.findFirst({
    where: {
      applicationDocumentId: documentId,
      applicationId,
    },
  });

  if (!doc) throw new Error("Document not found");

  await prisma.applicationDocument.delete({ where: { applicationDocumentId: doc.applicationDocumentId } });
  return doc;
}

// Map a DB application status to a NotificationType for the notification dropdown.
function dbStatusToNotificationType(
  dbStatus: string,
  fromStatus?: string | null,
  remarks?: string | null
): NotificationType {
  if (isRevocationHistoryRemarks(remarks)) {
    if (dbStatus === "REVOCATION_REVIEW") return "REVOCATION_REVIEW";
    if (dbStatus === "REVOKED") return "REVOCATION_APPROVED";
    if (dbStatus === "RELEASED" && fromStatus === "REVOCATION_REVIEW") return "REVOCATION_DENIED";
  }

  switch (dbStatus) {
    case "SUBMITTED":
      return "APPLICATION_SUBMITTED";
    case "RETURNED_FOR_CORRECTION":
      return "RETURNED_FOR_CORRECTION";
    case "ASSESSED":
    case "APPROVED_FOR_PAYMENT":
      return "APPROVED_FOR_PAYMENT";
    case "REJECTED":
      return "REJECTED";
    case "REVOKED":
      return "REVOCATION_APPROVED";
    case "REVOCATION_REVIEW":
      return "REVOCATION_REVIEW";
    case "PAID":
    case "FOR_RELEASE":
      return "PAYMENT_VERIFIED";
    case "RELEASED":
      return "PERMIT_RELEASED";
    default:
      return "APPLICATION_SUBMITTED";
  }
}

// Build a human-readable title and message for a history event.
function buildNotificationContent(
  dbStatus: string,
  applicationNumber: string,
  remarks: string | null,
  fromStatus?: string | null
): { title: string; message: string } {
  const appNum = applicationNumber ?? "your application";

  if (isRevocationHistoryRemarks(remarks)) {
    const extracted = extractRevocationApplicantMessage(remarks);
    if (dbStatus === "REVOCATION_REVIEW") {
      return {
        title: resolveRevocationNotificationTitle("REVOCATION_REVIEW_ENTERED"),
        message: extracted ?? `Application ${appNum} is under permit revocation review.`,
      };
    }
    if (dbStatus === "REVOKED") {
      return {
        title: resolveRevocationNotificationTitle("REVOCATION_APPROVED"),
        message: extracted ?? `Your business permit for application ${appNum} has been revoked.`,
      };
    }
    if (dbStatus === "RELEASED" && fromStatus === "REVOCATION_REVIEW") {
      return {
        title: resolveRevocationNotificationTitle("REVOCATION_DENIED"),
        message: extracted ?? `The revocation request for application ${appNum} was denied and your permit status was restored.`,
      };
    }
  }

  switch (dbStatus) {
    case "SUBMITTED":
      return {
        title: "Application Submitted",
        message: `Your application ${appNum} has been successfully submitted for review.`,
      };
    case "RETURNED_FOR_CORRECTION":
      return {
        title: "Returned for Correction",
        message: remarks
          ? `Application ${appNum} was returned: ${remarks}`
          : `Application ${appNum} has been returned. Please review the remarks and resubmit.`,
      };
    case "ASSESSED":
      return {
        title: "Assessment Generated",
        message: `Fee assessment for application ${appNum} is now available for review.`,
      };
    case "APPROVED_FOR_PAYMENT":
      return {
        title: "Approved for Payment",
        message: `Application ${appNum} has been assessed. Please proceed to payment.`,
      };
    case "PAID":
      return {
        title: "Payment Verified",
        message: `Payment for application ${appNum} has been verified successfully.`,
      };
    case "FOR_RELEASE":
      return {
        title: "Ready for Release",
        message: `Your permit for application ${appNum} is being prepared for release.`,
      };
    case "RELEASED":
      return {
        title: "Permit Released",
        message: `Your business permit for application ${appNum} is now available for pickup.`,
      };
    case "REJECTED":
      return {
        title: "Application Rejected",
        message: remarks
          ? `Application ${appNum} was rejected: ${remarks}`
          : `Application ${appNum} has been rejected. Please contact BPLO for details.`,
      };
    case "REVOCATION_REVIEW":
      return {
        title: "Permit Revocation Under Review",
        message: remarks
          ? `Application ${appNum} is under permit revocation review: ${remarks}`
          : `Application ${appNum} is under permit revocation review. Contact BPLO for details.`,
      };
    case "REVOKED":
      return {
        title: "Business Permit Revoked",
        message: remarks
          ? `Permit for application ${appNum} was revoked: ${remarks}`
          : `Your business permit for application ${appNum} has been revoked.`,
      };
    case "UNDER_REVIEW":
    case "DEPARTMENT_HEAD_REVIEW":
    case "DEPARTMENT_HEAD_APPROVED":
      return {
        title: "Application Under Review",
        message: `Application ${appNum} is currently being reviewed by the BPLO.`,
      };
    default:
      return {
        title: "Application Updated",
        message: `There has been an update to your application ${appNum}.`,
      };
  }
}

// Cached query for applicant notifications - deduplicates per-request
const getCachedApplicantNotifications = cache(async (applicantId: string) => {
  const apps = await prisma.businessApplication.findMany({
    where: { applicantId },
    select: {
      businessApplicationId: true,
      applicationNumber: true,
      applicationType: true,
      history: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const notifications = apps.flatMap((app: any) =>
    app.history.map((item: any) => {
      const { title, message } = buildNotificationContent(
        item.toStatus,
        app.applicationNumber,
        item.remarks ?? null,
        item.fromStatus ?? null
      );
      return {
        id: item.applicationHistoryId ?? item.id,
        applicationId: app.businessApplicationId,
        applicationNumber: app.applicationNumber,
        type: dbStatusToNotificationType(item.toStatus, item.fromStatus ?? null, item.remarks ?? null),
        title,
        message,
        timestamp: item.createdAt.toISOString(),
        isRead: false,
      };
    })
  );

  return notifications.sort(
    (a: { timestamp: string }, b: { timestamp: string }) =>
      b.timestamp.localeCompare(a.timestamp)
  );
});

export async function listApplicantNotifications(
  applicantId: string,
  pagination?: { page?: number | string; pageSize?: number | string }
) {
  if (!pagination) {
    return getCachedApplicantNotifications(applicantId);
  }

  const { page, pageSize, skip, take } = resolvePagination(pagination);

  const where = {
    application: { applicantId },
  };

  const [historyRows, totalCount] = await Promise.all([
    prisma.applicationHistory.findMany({
      where,
      include: {
        application: {
          select: {
            businessApplicationId: true,
            applicationNumber: true,
            applicationType: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.applicationHistory.count({ where }),
  ]);

  const records = historyRows.map((item) => {
    const { title, message } = buildNotificationContent(
      item.toStatus,
      item.application.applicationNumber,
      item.remarks ?? null,
      item.fromStatus ?? null
    );
    return {
      id: item.applicationHistoryId,
      applicationId: item.application.businessApplicationId,
      applicationNumber: item.application.applicationNumber,
      type: dbStatusToNotificationType(item.toStatus, item.fromStatus ?? null, item.remarks ?? null),
      title,
      message,
      timestamp: item.createdAt.toISOString(),
      isRead: false,
    };
  });

  return buildPaginatedResult(records, totalCount, page, pageSize);
}

const applicantTopInclude = {
  businessRecord: {
    select: {
      businessName: true,
    },
  },
  feeAssessment: {
    select: {
      feeAssessmentId: true,
      assessmentNumber: true,
      status: true,
      paymentFrequency: true,
      annualAssessedAmount: true,
      releasePaymentAmount: true,
      paymentStatus: true,
      mayorsPermitFee: true,
      regulatoryFees: true,
      additionalCharges: true,
      penalties: true,
      surcharge: true,
      interest: true,
      closureCertificateFee: true,
      otherCharges: true,
      closurePaymentDues: true,
      totalAmount: true,
      remarks: true,
      generatedAt: true,
      reassessmentRequestedAt: true,
      lineItems: {
        orderBy: { sortOrder: "asc" as const },
      },
    },
  },
  paymentReferences: {
    orderBy: { submittedAt: "desc" as const },
    take: 1,
  },
} as const;

const applicantTopWhere = {
  feeAssessment: {
    is: {
      status: "GENERATED" as const,
    },
  },
};

function mapApplicationToTopSummary(application: {
  businessApplicationId?: string;
  id?: string;
  applicationNumber: string;
  applicationType: string;
  status: PrismaApplicationStatus;
  formData: unknown;
  businessRecord: { businessName: string } | null;
  feeAssessment: {
    feeAssessmentId?: string;
    assessmentNumber: string;
    status: string;
    paymentFrequency: string;
    annualAssessedAmount: Parameters<typeof toMoneyNumber>[0];
    releasePaymentAmount: Parameters<typeof toMoneyNumber>[0];
    paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    mayorsPermitFee: Parameters<typeof toMoneyNumber>[0];
    regulatoryFees: Parameters<typeof toMoneyNumber>[0];
    additionalCharges: Parameters<typeof toMoneyNumber>[0];
    penalties: Parameters<typeof toMoneyNumber>[0];
    surcharge: Parameters<typeof toMoneyNumber>[0];
    interest: Parameters<typeof toMoneyNumber>[0];
    closureCertificateFee: Parameters<typeof toMoneyNumber>[0];
    otherCharges: Parameters<typeof toMoneyNumber>[0];
    closurePaymentDues: Parameters<typeof toMoneyNumber>[0];
    totalAmount: Parameters<typeof toMoneyNumber>[0];
    remarks: string | null;
    generatedAt: Date | null;
    reassessmentRequestedAt: Date | null;
    lineItems: Array<{
      feeAssessmentLineItemId?: string;
      id?: string;
      description: string;
      amount: Parameters<typeof toMoneyNumber>[0];
      isSystemGenerated: boolean;
    }>;
  } | null;
  paymentReferences: Array<{
    paymentReferenceId?: string;
    id?: string;
    transactionNumber: string;
    paymentDate: Date;
    submittedAt: Date;
    status: "PENDING" | "VERIFIED" | "REJECTED";
    reviewerRemarks: string | null;
    reviewedAt: Date | null;
    proofFileName: string;
  }>;
}) {
  const payment = application.paymentReferences[0] ?? null;
  const fa = application.feeAssessment;
  const appId = application.businessApplicationId ?? application.id ?? "";
  const paymentAmt = toMoneyNumber(fa?.releasePaymentAmount ?? fa?.totalAmount);

  return {
    applicationId: appId,
    applicationNumber: application.applicationNumber,
    businessName: resolveBusinessName(application.formData, application.businessRecord?.businessName ?? null),
    applicationType: application.applicationType as string,
    status: mapDbStatusToUi(application.status),
    rawStatus: application.status,
    hasTaxIncentives: (application.formData as Partial<BusinessInfo> | null)?.hasTaxIncentives === "YES",
    topNumber: fa?.assessmentNumber ?? null,
    assessmentStatus: (fa?.status ?? null) as "DRAFT" | "GENERATED" | null,
    paymentFrequency: (fa?.paymentFrequency ?? null) as "ANNUAL" | "BI_ANNUAL" | "QUARTERLY" | null,
    annualAssessedAmount: toMoneyNumber(fa?.annualAssessedAmount),
    releasePaymentAmount: toMoneyNumber(fa?.releasePaymentAmount),
    amountPaid: payment ? paymentAmt : 0,
    remainingBalance: 0,
    paymentStatus: fa?.paymentStatus ?? "UNPAID",
    mayorsPermitFee: toMoneyNumber(fa?.mayorsPermitFee),
    regulatoryFees: toMoneyNumber(fa?.regulatoryFees),
    additionalCharges: toMoneyNumber(fa?.additionalCharges),
    penalties: toMoneyNumber(fa?.penalties),
    surcharge: toMoneyNumber(fa?.surcharge),
    interest: toMoneyNumber(fa?.interest),
    closurePaymentDues: toMoneyNumber(fa?.closurePaymentDues),
    closureCertificateFee: toMoneyNumber(fa?.closureCertificateFee),
    arrears: 0,
    otherCharges: toMoneyNumber(fa?.otherCharges),
    totalAmount: toMoneyNumber(fa?.totalAmount),
    remarks: fa?.remarks ?? null,
    generatedAt: fa?.generatedAt ? fa.generatedAt.toISOString() : null,
    reassessmentRequestedAt: fa?.reassessmentRequestedAt ? fa.reassessmentRequestedAt.toISOString() : null,
    lineItems: (fa?.lineItems ?? []).map((item) => ({
      id: item.feeAssessmentLineItemId ?? item.id ?? "",
      description: item.description,
      amount: toMoneyNumber(item.amount),
      isSystemGenerated: item.isSystemGenerated,
    })),
    paymentReference: payment
      ? {
          id: payment.paymentReferenceId ?? payment.id ?? "",
          transactionNumber: payment.transactionNumber,
          officialReceiptNumber: payment.transactionNumber,
          amountPaid: paymentAmt,
          paymentDate: payment.paymentDate.toISOString(),
          submittedAt: payment.submittedAt.toISOString(),
          status: payment.status,
          reviewerRemarks: payment.reviewerRemarks,
          reviewedAt: payment.reviewedAt ? payment.reviewedAt.toISOString() : null,
          proofFileName: payment.proofFileName,
        }
      : null,
  };
}

function resolveBestActiveTopSummary(
  summaries: ReturnType<typeof mapApplicationToTopSummary>[]
) {
  const approvedSummaries = summaries.filter((s) => s.rawStatus === "APPROVED_FOR_PAYMENT");
  return (
    approvedSummaries.find((s) => !s.paymentReference) ??
    approvedSummaries.find((s) => s.paymentReference?.status === "REJECTED") ??
    approvedSummaries.find((s) => s.paymentReference?.status === "PENDING") ??
    approvedSummaries[0] ??
    summaries[0] ??
    null
  );
}

export type ApplicantTopSummary = ReturnType<typeof mapApplicationToTopSummary>;

export type ApplicantTopPageData = {
  activeSummary: ApplicantTopSummary | null;
} & PaginatedResult<ApplicantTopSummary>;

export async function getApplicantTopSummary(
  applicantId: string,
  pagination?: { page?: number | string | null; pageSize?: number | string | null }
): Promise<ApplicantTopPageData | null> {
  const where = {
    applicantId,
    ...applicantTopWhere,
  };

  const totalCount = await prisma.businessApplication.count({ where });
  if (totalCount === 0) return null;

  const { page, pageSize, skip, take } = resolvePagination(pagination);

  const [paginatedApplications, allApplications] = await Promise.all([
    prisma.businessApplication.findMany({
      where,
      include: applicantTopInclude,
      orderBy: [{ updatedAt: "desc" }],
      skip,
      take,
    }),
    prisma.businessApplication.findMany({
      where,
      include: applicantTopInclude,
      orderBy: [{ updatedAt: "desc" }],
    }),
  ]);

  const allSummaries = allApplications.map(mapApplicationToTopSummary);
  const paginatedSummaries = paginatedApplications.map(mapApplicationToTopSummary);

  return {
    activeSummary: resolveBestActiveTopSummary(allSummaries),
    ...buildPaginatedResult(paginatedSummaries, totalCount, page, pageSize),
  };
}

export async function submitApplicantPaymentReference(
  applicantId: string,
  applicationId: string,
  transactionNumber: string,
  proof: {
    proofFileName: string;
    proofStoragePath: string;
    proofBucket?: string;
    proofMimeType: string;
    proofSizeBytes: number;
  }
) {
  const application = await prisma.businessApplication.findFirst({
    where: {
      businessApplicationId: applicationId,
      applicantId,
    },
    include: {
      feeAssessment: true,
    },
  });

  if (!application) throw new Error("Application not found");

  if (application.status !== "APPROVED_FOR_PAYMENT") {
    throw new Error("Payment reference can only be submitted once the Tax Order of Payment has been generated");
  }

  if (!application.feeAssessment || application.feeAssessment.status !== "GENERATED") {
    throw new Error("Generated TOP is required before submitting payment reference");
  }

  if (application.feeAssessment.reassessmentRequestedAt) {
    throw new Error(
      "Your assessment is under re-assessment request. Please wait for BPLO to review before submitting payment."
    );
  }

  const duplicate = await prisma.paymentReference.findUnique({
    where: { transactionNumber: transactionNumber.trim() },
    select: { paymentReferenceId: true },
  });

  if (duplicate) {
    throw new Error("This OR number has already been submitted. Please check your payment details.");
  }

  const latest = await prisma.paymentReference.findFirst({
    where: { applicationId: application.businessApplicationId },
    orderBy: { submittedAt: "desc" },
    select: { status: true },
  });

  if (latest?.status === "PENDING") {
    throw new Error("An OR submission is already pending verification");
  }

  if (latest?.status === "VERIFIED") {
    throw new Error("Payment has already been verified and is read-only");
  }

  const parsedPaymentDate = new Date();

  const normalizedAmountPaid = Math.round(Math.max(0, toMoneyNumber(application.feeAssessment.totalAmount)) * 100) / 100;
  if (normalizedAmountPaid <= 0) {
    throw new Error("TOP amount is invalid for payment submission");
  }

  const updated = await prisma.$transaction(async (tx: any) => {
    await tx.paymentReference.create({
      data: {
        applicationId: application.businessApplicationId,
        transactionNumber: transactionNumber.trim(),
        paymentDate: parsedPaymentDate,
        proofFileName: proof.proofFileName,
        proofStoragePath: proof.proofStoragePath,
        proofBucket: proof.proofBucket ?? resolveBucketByMimeType(proof.proofMimeType),
        proofMimeType: proof.proofMimeType,
        proofSizeBytes: proof.proofSizeBytes,
        status: "PENDING",
      },
    });

    await tx.applicationHistory.create({
      data: {
        applicationId: application.businessApplicationId,
        actorId: applicantId,
        actorRole: "APPLICANT",
        fromStatus: application.status,
        toStatus: application.status,
        remarks: `Applicant submitted OR number ${transactionNumber.trim()} with amount ₱${toMoneyNumber(normalizedAmountPaid).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
      },
    });

    return tx.businessApplication.findUniqueOrThrow({
      where: { businessApplicationId: application.businessApplicationId },
      select: { businessApplicationId: true, applicationNumber: true, status: true },
    });
  });

  return {
    applicationId: updated.businessApplicationId,
    applicationNumber: updated.applicationNumber,
    status: mapDbStatusToUi(updated.status),
  };
}

export async function listApplicantBusinessRecords(applicantId: string) {
  const rows = await prisma.businessRecord.findMany({
    where: { applicantId },
    include: {
      applications: {
        select: {
          status: true,
        },
      },
      location: {
        select: {
          latitude: true,
          longitude: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return rows.map((row: any) => ({
    id: row.id,
    registrationNumber: row.registrationNumber,
    businessName: row.businessName,
    businessStatus: row.businessStatus as "ACTIVE" | "INACTIVE" | "CLOSED",
    hasRevokedPermit: row.applications.some((application: any) => application.status === "REVOKED"),
    closedAt: row.closedAt ? (row.closedAt as Date).toISOString() : null,
    businessInfo: {
      businessType: row.businessType as BusinessInfo["businessType"],
      registrationNumber: row.registrationNumber,
      paymentFrequency: "ANNUAL",
      tin: tinFromDb(row.tin),
      businessName: row.businessName,
      tradeName: row.tradeName,
      ownerName: row.ownerName,
      nationality: row.nationality,
      email: row.email,
      phone: row.phone,
      mainOfficeAddress: row.mainOfficeAddress,
      businessAddress: row.businessAddress,
      businessLatitude: row.location?.latitude ?? null,
      businessLongitude: row.location?.longitude ?? null,
      sameAsMainOffice: row.sameAsMainOffice,
      businessArea: optionalDecimalFromDb(row.businessArea),
      totalFloorArea: optionalDecimalFromDb(row.totalFloorArea),
      totalEmployees: optionalIntFromDb(row.totalEmployees),
      maleEmployees: optionalIntFromDb(row.maleEmployees),
      femaleEmployees: optionalIntFromDb(row.femaleEmployees),
      employeesWithinMunicipality: optionalIntFromDb(row.employeesWithinMunicipality),
      deliveryVehicles: optionalIntFromDb(row.deliveryVehicles),
      propertyOwnership: (row.propertyOwnership as BusinessInfo["propertyOwnership"]) ?? "Owned",
      taxDeclarationNumber: row.taxDeclarationNumber ?? "",
      propertyIdentificationNumber: row.propertyIdentificationNumber ?? "",
      orNumber: (row as any).orNumber ?? "",
      taxIncentives: row.taxIncentives ?? "",
      businessActivity: row.businessActivity ?? "",
      lineOfBusiness: row.lineOfBusiness ?? "",
      assetSize: optionalDecimalFromDb(row.assetSize),
      isMarket: Boolean(row.isMarket),
      isAgriculture: Boolean(row.isAgriculture),
      isLiquorOrTobacco: Boolean(row.isLiquorOrTobacco),
    } satisfies BusinessInfo,
    permitExpirationDate: row.permitExpirationDate ? (row.permitExpirationDate as Date).toISOString() : null,
  }));
}
