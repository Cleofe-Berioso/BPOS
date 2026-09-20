"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { defaultBusinessInfo } from "@/lib/applicant-mock";
import { normalizeBusinessInfo as normalizeBusinessInfoRules } from "@/lib/business-rules";
import { isWithinEbMagalona } from "@/lib/eb-magalona";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/lib/numeric-input";
import { isPhilippinesCountry, validateBusinessIdentityFormats } from "@/lib/business-rules";
import { BUSINESS_ACTIVITY_OPTIONS } from "@/lib/business-rules";
import { phMobileFieldError, sanitizePhMobileInput } from "@/lib/ph-mobile";
import {
  EB_MAGALONA_CITY,
  EB_MAGALONA_COUNTRY,
  EB_MAGALONA_COUNTRY_CODE,
  EB_MAGALONA_PROVINCE,
  EB_MAGALONA_ZIP_CODE,
  isEbMagalonaCity,
  isEbMagalonaProvince,
} from "@/lib/address-options";

import { BusinessInformationFields } from "./business-information-fields";
import { ApplicationVerificationTemplate } from "@/components/print/application-verification-template";
import { FormStepper } from "@/components/applicant/form-stepper";
import { RequirementsUploadTable } from "@/components/applicant/requirements-upload-table";
import {
  applicantCheckboxCardClass,
  applicantErrorPanelClass,
  applicantFormControlClass,
  applicantHighlightPanelClass,
  applicantPanelClass,
  applicantRadioLabelClass,
  applicantSummaryLabelClass,
  applicantSummaryTileClass,
  applicantSummaryValueClass,
  applicantWarningPanelClass,
} from "@/components/applicant/applicant-ui-styles";
import {
  getMissingRequiredDocuments,
  getDocumentRequirementDescription,
  normalizeDocumentName,
  resolveRequiredDocuments,
} from "@/lib/required-documents";
import {
  buildDocumentMaxSizeError,
  DOCUMENT_FILE_INPUT_ACCEPT,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  validateDocumentFileUpload,
  validateTotalPendingUploadSize,
} from "@/lib/document-upload-rules";
import { isValidLineOfBusiness } from "@/lib/business-options";
import { useLineOfBusinessOptions } from "@/hooks/use-line-of-business-options";
import type {
  ApplicationDocumentInput,
  BusinessInfo,
  PersistMode,
  PropertyOwnership,
  SaveApplicationInput,
  SubmitValidationErrorDetail,
} from "@/lib/applicant-types";
import { actionButtonStyles } from "@/components/ui/action-button";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InfoBanner } from "@/components/ui/info-banner";
import { SectionCard } from "@/components/ui/section-card";
import {
  getApplicationSubmitButtonLabel,
  getApplicationSubmitSuccessMessage,
  getResubmissionConfirmMessage,
  isReturnedCorrectionResubmission,
} from "@/lib/resubmission-copy";

const steps = [
  {
    title: "Select Existing Business",
    description: "Choose the registered business record to renew.",
  },
  {
    title: "Business Information",
    description: "Review and update core business identity and contact details.",
  },
  {
    title: "Business Operation",
    description: "Provide operational, staffing, and property details.",
  },
  {
    title: "Document Upload",
    description: "Attach all current clearances and supporting files.",
  },
  {
    title: "Assessment Notice",
    description: "Final fees are assessed by BPLO after application review.",
  },
  {
    title: "Review and Submit",
    description: "Confirm the renewal package before submission.",
  },
];

const lockedFields: Array<keyof BusinessInfo> = [
  "businessType",
  "registrationNumber",
  "tin",
  "businessName",
  "tradeName",
  "ownerName",
  "ownerFirstName",
  "ownerMiddleName",
  "ownerSurname",
  "ownerSuffix",
  "nationality",
];

const RENEWAL_OPERATION_FIELDS: Array<{
  label: string;
  key: keyof BusinessInfo;
  helperText?: string;
  numericKind?: "integer" | "decimal";
}> = [
  { label: "Business Area", key: "businessArea", helperText: "Use the declared operating area.", numericKind: "decimal" },
  { label: "Total Floor Area", key: "totalFloorArea", numericKind: "decimal" },
  { label: "Total Employees", key: "totalEmployees", numericKind: "integer" },
  { label: "Male Employees", key: "maleEmployees", numericKind: "integer" },
  { label: "Female Employees", key: "femaleEmployees", numericKind: "integer" },
  { label: "Employees Residing within Municipality", key: "employeesWithinMunicipality", numericKind: "integer" },
  { label: "Van / Truck", key: "deliveryVanTruck", helperText: "Number of vans or trucks, if applicable.", numericKind: "integer" },
  { label: "Motorcycle", key: "deliveryMotorcycle", helperText: "Number of motorcycles, if applicable.", numericKind: "integer" },
  { label: "Asset Size", key: "assetSize", helperText: "Use the declared amount in pesos.", numericKind: "decimal" },
];

const BUSINESS_ACTIVITY_OTHER_OPTION = "Others, please specify";

function normalizeBusinessInfo(next: BusinessInfo): BusinessInfo {
  return normalizeBusinessInfoRules(next);
}

function resolveRenewalLineOfBusiness(value: string | null | undefined): string {
  return isValidLineOfBusiness(value) ? value.trim() : "";
}

const BUSINESS_LOCATION_ERROR = "Please pin the business location inside EB Magalona.";

async function parseApiResponseSafely(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 413) {
    return {
      error:
        "The uploaded files exceeded the server limit (4.5 MB on Vercel). Please compress your documents or upload smaller copies.",
    };
  }

  const responseText = await response.text();

  try {
    return responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
  } catch {
    return {
      error:
        response.status === 413
          ? "The uploaded files exceeded the server upload limit. Please compress your files."
          : response.status >= 500
            ? `The server encountered an error (HTTP ${response.status}). Please try again later.`
            : "The server returned an unexpected response. Please check your connection or contact support.",
      rawResponse: responseText.slice(0, 300),
    };
  }
}

function validateBusinessLocation(info: BusinessInfo): Partial<Record<keyof BusinessInfo, string>> {
  const nextErrors: Partial<Record<keyof BusinessInfo, string>> = {};

  const latitude = Number(info.businessLatitude);
  const longitude = Number(info.businessLongitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    nextErrors.businessLatitude = BUSINESS_LOCATION_ERROR;
    return nextErrors;
  }

  if (!isWithinEbMagalona(latitude, longitude)) {
    nextErrors.businessLatitude = BUSINESS_LOCATION_ERROR;
  }

  return nextErrors;
}

function requiresBarangay(info: BusinessInfo): boolean {
  return isPhilippinesCountry(info.mainOfficeCountry, info.mainOfficeCountryCode);
}

function validateFixedEbMagalonaAddress(info: BusinessInfo): Partial<Record<keyof BusinessInfo, string>> {
  const nextErrors: Partial<Record<keyof BusinessInfo, string>> = {};

  if (info.country.trim() !== EB_MAGALONA_COUNTRY) {
    nextErrors.country = `Business country must be fixed to ${EB_MAGALONA_COUNTRY}.`;
  }

  if ((info.countryCode ?? "").trim().toUpperCase() !== EB_MAGALONA_COUNTRY_CODE) {
    nextErrors.countryCode = `Country code must be ${EB_MAGALONA_COUNTRY_CODE}.`;
  }

  if (!isEbMagalonaProvince(info.province)) {
    nextErrors.province = `Business province must be ${EB_MAGALONA_PROVINCE}.`;
  }

  if (!isEbMagalonaCity(info.cityMunicipality)) {
    nextErrors.cityMunicipality = `Business city/municipality must be ${EB_MAGALONA_CITY}.`;
  }

  return nextErrors;
}

function logStepValidationDebug(params: {
  step: number;
  missingKeys: string[];
  info: BusinessInfo;
}) {
  if (process.env.NODE_ENV === "production") return;
  if (params.missingKeys.length === 0) return;

  const businessAddressRelatedEntries = Object.entries(params.info).filter(([key]) =>
    key.startsWith("business") ||
    ["country", "countryCode", "province", "provinceCode", "cityMunicipality", "streetAddress", "barangay"].includes(key)
  );

  console.info("[RenewalApplicationForm] Step validation missing fields", {
    stepIndex: params.step,
    stepName: steps[params.step]?.title ?? "Unknown",
    missingKeys: params.missingKeys,
    businessAddressSnapshot: {
      country: params.info.country,
      province: params.info.province,
      cityMunicipality: params.info.cityMunicipality,
      barangay: params.info.barangay,
      streetAddress: params.info.streetAddress,
      businessBarangay: params.info.businessBarangay,
      businessStreet: params.info.businessStreetAddress,
      businessStreetAddress: params.info.businessStreetAddress,
      businessLatitude: params.info.businessLatitude,
      businessLatitudeType: typeof params.info.businessLatitude,
      businessLongitude: params.info.businessLongitude,
      businessLongitudeType: typeof params.info.businessLongitude,
    },
    businessAddressRelatedFormData: Object.fromEntries(businessAddressRelatedEntries),
  });
}

function parsePositiveAmount(value: string): number | null {
  const normalized = value.replace(/[,\s]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function readBusinessActivitySelection(value: string | undefined): {
  selected: string;
  otherText: string;
} {
  const trimmed = (value ?? "").trim();

  if (!trimmed) {
    return { selected: "", otherText: "" };
  }

  if (trimmed.startsWith("Others:")) {
    return {
      selected: BUSINESS_ACTIVITY_OTHER_OPTION,
      otherText: trimmed.slice("Others:".length).trim(),
    };
  }

  if (trimmed === BUSINESS_ACTIVITY_OTHER_OPTION) {
    return { selected: BUSINESS_ACTIVITY_OTHER_OPTION, otherText: "" };
  }

  if ((BUSINESS_ACTIVITY_OPTIONS as readonly string[]).includes(trimmed)) {
    return { selected: trimmed, otherText: "" };
  }

  return {
    selected: BUSINESS_ACTIVITY_OTHER_OPTION,
    otherText: trimmed,
  };
}

function validateRenewalBusinessOperations(info: BusinessInfo): Partial<Record<keyof BusinessInfo, string>> {
  const nextErrors: Partial<Record<keyof BusinessInfo, string>> = {};
  const activity = readBusinessActivitySelection(info.businessActivity);

  if (!activity.selected) {
    nextErrors.businessActivity = "Business Activity is required.";
  } else if (activity.selected === BUSINESS_ACTIVITY_OTHER_OPTION && !activity.otherText) {
    nextErrors.businessActivity = "Please specify the Business Activity when selecting Others.";
  }

  const grossRaw = info.grossProfit?.trim() ?? "";
  if (!grossRaw) {
    nextErrors.grossProfit = "Gross Profit / Gross Receipts is required.";
  } else if (parsePositiveAmount(grossRaw) == null) {
    nextErrors.grossProfit = "Gross Profit / Gross Receipts must be a non-negative amount.";
  }

  if (info.hasTaxIncentives !== "YES" && info.hasTaxIncentives !== "NO") {
    nextErrors.hasTaxIncentives = "Please select Yes or No for tax incentives.";
  } else if (info.hasTaxIncentives === "YES" && !info.taxIncentives?.trim()) {
    nextErrors.taxIncentives = "Please describe the tax incentive.";
  }

  return nextErrors;
}

function validateRenewalPaymentFrequency(info: BusinessInfo): Partial<Record<keyof BusinessInfo, string>> {
  const nextErrors: Partial<Record<keyof BusinessInfo, string>> = {};
  if (!["ANNUAL", "BI_ANNUAL", "QUARTERLY"].includes(info.paymentFrequency)) {
    nextErrors.paymentFrequency = "Mode of Payment is required.";
  }
  return nextErrors;
}

function sanitizeDocumentMetadata(documents: ApplicationDocumentInput[]): ApplicationDocumentInput[] {
  return documents.map((doc) => ({
    id: doc.id,
    documentType: doc.documentType ?? doc.documentName,
    documentName: doc.documentName,
    fileName: doc.fileName,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    fileSize: doc.fileSize,
    bucket: doc.bucket,
    storagePath: doc.storagePath,
    filePath: doc.filePath,
  }));
}

function buildCleanPayload(params: {
  applicationId?: string;
  selectedBusinessId: string;
  mode: PersistMode;
  info: BusinessInfo;
  documents: ApplicationDocumentInput[];
}): SaveApplicationInput {
  return {
    applicationId: params.applicationId,
    applicationType: "RENEWAL",
    businessRecordId: params.selectedBusinessId || undefined,
    formData: {
      ...normalizeBusinessInfo(params.info),
      paymentFrequency: params.info.paymentFrequency ?? "ANNUAL",
    },
    documents: sanitizeDocumentMetadata(params.documents),
    mode: params.mode,
  };
}

function ReviewStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className={applicantSummaryTileClass}>
      <p className={applicantSummaryLabelClass}>{label}</p>
      <p className={applicantSummaryValueClass}>{value}</p>
      {helper ? <p className="mt-1 ui-caption">{helper}</p> : null}
    </div>
  );
}

function ValidationPanel({
  detail,
  onBack,
}: {
  detail: SubmitValidationErrorDetail;
  onBack?: () => void;
}) {
  return (
    <div className={applicantErrorPanelClass}>
      <p className="font-semibold">Submission requirements still missing</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="ui-caption font-semibold uppercase tracking-wide">
            Missing Fields
          </p>
          <ul className="mt-2 space-y-1">
            {detail.missingFields.length > 0 ? (
              detail.missingFields.map((item) => <li key={item}>• {item}</li>)
            ) : (
              <li>• None</li>
            )}
          </ul>
        </div>
        <div>
          <p className="ui-caption font-semibold uppercase tracking-wide">
            Missing Documents
          </p>
          <ul className="mt-2 space-y-1">
            {detail.missingDocuments.length > 0 ? (
              detail.missingDocuments.map((item) => <li key={item}>• {item}</li>)
            ) : (
              <li>• None</li>
            )}
          </ul>
        </div>
      </div>
      {onBack ? (
        <button type="button" onClick={onBack} className={`${actionButtonStyles("secondary", "sm")} mt-3`}>
          Back
        </button>
      ) : null}
    </div>
  );
}

type RenewalBlockedRecord = {
  id: string;
  registrationNumber: string;
  businessName: string;
  closedAt: string | null;
  renewalEligibility: {
    eligible: boolean;
    reasonCode: string | null;
    userFriendlyReason: string | null;
    blockingInspectionId: string | null;
    complianceCaseStatus: string | null;
    nonComplianceType: string | null;
  };
};

function humanizeCaseStatus(value: string | null): string {
  if (value === "FLAGGED_UNSETTLED") return "Flagged / Unsettled";
  if (value === "SETTLED") return "Settled";
  if (value === "EXPIRED_UNSETTLED") return "Expired / Unsettled";
  if (value === "FORCED_CLOSURE_PENDING") return "Forced Closure Pending";
  if (value === "CLOSED_NON_COMPLIANT") return "Closed Non-Compliant";
  return value ?? "-";
}

function humanizeNonComplianceType(value: string | null): string {
  if (value === "GOVERNMENT_AGENCY_RELATED") return "Government Agency Related";
  if (value === "RENEWAL_RELATED") return "Renewal Related";
  return value ?? "-";
}

export function RenewalApplicationForm() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("applicationId");
  const [step, setStep] = useState(0);
  const [applicationId, setApplicationId] = useState<string | undefined>(editId ?? undefined);
  const [draftLoading, setDraftLoading] = useState(Boolean(editId));
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [records, setRecords] = useState<
    Array<{ id: string; registrationNumber: string; businessName: string; businessInfo: BusinessInfo }>
  >([]);
  const [blockedRecords, setBlockedRecords] = useState<RenewalBlockedRecord[]>([]);
  const [info, setInfo] = useState<BusinessInfo>(defaultBusinessInfo);
  const lineOfBusinessOptions = useLineOfBusinessOptions([info.lineOfBusiness]);
  const [uploadedDocuments, setUploadedDocuments] = useState<Record<string, ApplicationDocumentInput>>({});
  const [pendingDocuments, setPendingDocuments] = useState<Record<string, File>>({});
  const [pendingDocumentPreviews, setPendingDocumentPreviews] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showVerificationPrint, setShowVerificationPrint] = useState(false);
  const [validationDetail, setValidationDetail] = useState<SubmitValidationErrorDetail | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof BusinessInfo, string>>>({});
  const [unavailableCount, setUnavailableCount] = useState(0);
  const [existingApplicationAccess, setExistingApplicationAccess] = useState<{
    canEdit: boolean;
    status: string;
  } | null>(null);
  const selectedBusinessIdRef = useRef(selectedBusinessId);
  const pendingDocumentPreviewsRef = useRef<Record<string, string>>({});

  const isReadOnly = Boolean(editId && existingApplicationAccess && !existingApplicationAccess.canEdit);
  const isResubmission = isReturnedCorrectionResubmission({
    editId,
    applicationStatus: existingApplicationAccess?.status,
  });
  const lockInteractivityClass = isReadOnly ? "pointer-events-none" : "";

  useEffect(() => {
    selectedBusinessIdRef.current = selectedBusinessId;
  }, [selectedBusinessId]);

  useEffect(() => {
    pendingDocumentPreviewsRef.current = pendingDocumentPreviews;
  }, [pendingDocumentPreviews]);

  useEffect(() => {
    return () => {
      for (const previewUrl of Object.values(pendingDocumentPreviewsRef.current)) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    const normalizedInfo = normalizeBusinessInfo(info);
    const identityFormats = validateBusinessIdentityFormats(normalizedInfo);

    setFieldErrors((current) => {
      const nextErrors = { ...current };

      if (normalizedInfo.registrationNumber.trim().length > 0 && !identityFormats.registrationNumber) {
        nextErrors.registrationNumber = "Wrong Format";
      } else if (nextErrors.registrationNumber === "Wrong Format" || nextErrors.registrationNumber === "This already exist") {
        delete nextErrors.registrationNumber;
      }

      if (normalizedInfo.tin.trim().length > 0 && !identityFormats.tin) {
        nextErrors.tin = "Wrong Format";
      } else if (nextErrors.tin === "Wrong Format" || nextErrors.tin === "This already exist") {
        delete nextErrors.tin;
      }

      return nextErrors;
    });
  }, [info]);

  const requiredRenewalDocs = useMemo(
    () =>
      resolveRequiredDocuments({
        applicationType: "RENEWAL",
        formData: info,
      }),
    [info]
  );

  const getUploadedDocumentForRequiredName = (requiredName: string) =>
    Object.values(uploadedDocuments).find(
      (doc) => normalizeDocumentName(doc.documentName) === normalizeDocumentName(requiredName)
    );

  const uploadedRequiredCount = requiredRenewalDocs.filter((doc) => getUploadedDocumentForRequiredName(doc)).length;
  const selectedRecord = records.find((item) => item.id === selectedBusinessId);
  const selectedBusinessActivity = readBusinessActivitySelection(info.businessActivity);
  const selectedRecordLineOfBusiness = (selectedRecord?.businessInfo.lineOfBusiness ?? "").trim();
  const hasLockedRecordLineOfBusiness =
    selectedRecordLineOfBusiness.length > 0 &&
    (isValidLineOfBusiness(selectedRecordLineOfBusiness) ||
      lineOfBusinessOptions.includes(selectedRecordLineOfBusiness));
  const renewalLineOfBusinessLocked = hasLockedRecordLineOfBusiness || isReadOnly;

  useEffect(() => {
    if (!hasLockedRecordLineOfBusiness) return;
    if (info.lineOfBusiness === selectedRecordLineOfBusiness) return;

    setInfo((current) =>
      normalizeBusinessInfo({
        ...current,
        lineOfBusiness: selectedRecordLineOfBusiness,
      })
    );
  }, [hasLockedRecordLineOfBusiness, info.lineOfBusiness, selectedRecordLineOfBusiness]);

  function validateFieldOnBlur(field: keyof BusinessInfo) {
    if (isReadOnly) return;
    const nextErrors = { ...fieldErrors };
    const normalizedInfo = normalizeBusinessInfo(info);
    const value = normalizedInfo[field];

    const requiredFields: Array<keyof BusinessInfo> = ["email", "mainOfficeAddress", "phone", "businessAddress"];
    if (field === "phone") {
      const phoneError = phMobileFieldError(normalizedInfo.phone);
      if (phoneError) nextErrors.phone = phoneError;
      else if (nextErrors.phone !== "This already exist") delete nextErrors.phone;
    } else if (requiredFields.includes(field) && (typeof value !== "string" || value.trim().length === 0)) {
      nextErrors[field] = `${field === "mainOfficeAddress" ? "Main Office Address" : field === "businessAddress" ? "Business Address" : "Email"} is required.`;
    } else if (nextErrors[field] !== "This already exist") {
      delete nextErrors[field];
    }

    if (field === "mainOfficeBarangay") {
      if (requiresBarangay(normalizedInfo) && !normalizedInfo.mainOfficeBarangay?.trim()) {
        nextErrors.mainOfficeBarangay = "Select a barangay for the Philippine main office address.";
      } else if (nextErrors.mainOfficeBarangay !== "This already exist") {
        delete nextErrors.mainOfficeBarangay;
      }
    }

    if (field === "country" || field === "countryCode" || field === "province" || field === "cityMunicipality") {
      const fixedAddressErrors = validateFixedEbMagalonaAddress(normalizedInfo);
      if (fixedAddressErrors[field]) {
        nextErrors[field] = fixedAddressErrors[field] as string;
      }
    }

    if (field === "birthDate") {
      // Birthdate removed from Renewal form per Phase 1.
    }

    if (field === "grossProfit") {
      const grossRaw = normalizedInfo.grossProfit?.trim() ?? "";
      if (!grossRaw) {
        nextErrors.grossProfit = "Gross Profit / Gross Receipts is required.";
      } else if (parsePositiveAmount(grossRaw) == null) {
        nextErrors.grossProfit = "Gross Profit / Gross Receipts must be a non-negative amount.";
      } else if (nextErrors.grossProfit !== "This already exist") {
        delete nextErrors.grossProfit;
      }
    }

    if (field === "businessActivity") {
      const activityError = validateRenewalBusinessOperations(normalizedInfo).businessActivity;
      if (activityError) {
        nextErrors.businessActivity = activityError;
      } else if (nextErrors.businessActivity !== "This already exist") {
        delete nextErrors.businessActivity;
      }
    }

    if (field === "lineOfBusiness") {
      if (!hasLockedRecordLineOfBusiness && !normalizedInfo.lineOfBusiness.trim()) {
        nextErrors.lineOfBusiness = "Line of Business is required.";
      } else if (nextErrors.lineOfBusiness !== "This already exist") {
        delete nextErrors.lineOfBusiness;
      }
    }

    if (field === "registrationNumber" && normalizedInfo.registrationNumber.trim().length > 0) {
      const valid = validateBusinessIdentityFormats(normalizedInfo).registrationNumber;
      if (!valid) nextErrors.registrationNumber = "Wrong Format";
    }

    if (field === "tin" && normalizedInfo.tin.trim().length > 0) {
      const valid = validateBusinessIdentityFormats(normalizedInfo).tin;
      if (!valid) nextErrors.tin = "Wrong Format";
    }

    setFieldErrors(nextErrors);
  }

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      const response = await fetch("/api/applicant/business-records?applicationType=RENEWAL", { cache: "no-store" });
      const data = (await parseApiResponseSafely(response)) as {
        records?: Array<{ id: string; registrationNumber: string; businessName: string; businessInfo: BusinessInfo }>;
        blockedRecords?: RenewalBlockedRecord[];
      };

      if (!active || !response.ok || !data.records) return;

      setRecords(data.records);
      setBlockedRecords(data.blockedRecords ?? []);
      setUnavailableCount(data.blockedRecords?.length ?? 0);
      if (data.records[0] && !selectedBusinessIdRef.current) {
        selectedBusinessIdRef.current = data.records[0].id;
        setSelectedBusinessId(data.records[0].id);
          setInfo(
            normalizeBusinessInfo({
              ...defaultBusinessInfo,
              ...data.records[0].businessInfo,
              lineOfBusiness: resolveRenewalLineOfBusiness(data.records[0].businessInfo.lineOfBusiness),
              paymentFrequency: data.records[0].businessInfo.paymentFrequency ?? "ANNUAL",
            })
          );
      }
    }

    void loadRecords();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadExistingApplication() {
      if (!editId) {
        setDraftLoading(false);
        return;
      }
      setDraftLoading(true);

      const response = await fetch(`/api/applicant/applications/${editId}`, { cache: "no-store" });
      const data = (await parseApiResponseSafely(response)) as {
        application?: {
          id: string;
          status: string;
          canEdit: boolean;
          businessRecordId?: string;
          formData: BusinessInfo;
          documents: ApplicationDocumentInput[];
        };
      };

      if (!active || !response.ok || !data.application) {
        setDraftLoading(false);
        return;
      }

      setApplicationId(data.application.id);
      setExistingApplicationAccess({
        canEdit: Boolean(data.application.canEdit),
        status: data.application.status,
      });
      setInfo(
        normalizeBusinessInfo({
          ...defaultBusinessInfo,
          ...data.application.formData,
          paymentFrequency: data.application.formData.paymentFrequency ?? "ANNUAL",
        })
      );
      if (data.application.businessRecordId) {
        selectedBusinessIdRef.current = data.application.businessRecordId;
        setSelectedBusinessId(data.application.businessRecordId);
      }
      setUploadedDocuments(
        data.application.documents.reduce<Record<string, ApplicationDocumentInput>>((acc, doc) => {
          acc[doc.documentName] = doc;
          return acc;
        }, {})
      );
      setPendingDocuments({});
      setPendingDocumentPreviews({});
      setDraftLoading(false);
    }

    void loadExistingApplication();
    return () => {
      active = false;
    };
  }, [editId]);

  if (editId && draftLoading) {
    return (
      <SectionCard title="Loading saved draft" description="Restoring your renewal draft values.">
        <LoadingState message="Loading draft…" compact />
      </SectionCard>
    );
  }

  function next() {
    if (isReadOnly) return;
    if (step === 0 && !selectedBusinessId) {
      setFieldErrors({ businessName: "Select an existing business record first." });
      setStatusMessage({ kind: "error", text: "Select an existing business record before proceeding." });
      return;
    }

    if (step === 1) {
      const normalizedInfo = normalizeBusinessInfo(info);
      const nextErrors: Partial<Record<keyof BusinessInfo, string>> = {};
      if (!normalizedInfo.email.trim()) nextErrors.email = "Email is required.";
      if (!normalizedInfo.mainOfficeAddress.trim()) nextErrors.mainOfficeAddress = "Main Office Address is required.";
      const phoneError = phMobileFieldError(normalizedInfo.phone);
      if (phoneError) nextErrors.phone = phoneError;
      if (requiresBarangay(normalizedInfo) && !normalizedInfo.mainOfficeBarangay?.trim()) {
        nextErrors.mainOfficeBarangay = "Barangay is required for Philippine main office addresses.";
      }
      if (!normalizedInfo.businessBarangay?.trim()) {
        nextErrors.businessBarangay = "Business Barangay is required.";
      }
      if (!normalizedInfo.businessStreetAddress?.trim()) {
        nextErrors.businessStreetAddress = "Business Street / Purok / Building / Unit is required.";
      }

      Object.assign(nextErrors, validateFixedEbMagalonaAddress(normalizedInfo));

      const identityFormats = validateBusinessIdentityFormats(normalizedInfo);
      if (normalizedInfo.registrationNumber.trim().length > 0 && !identityFormats.registrationNumber) {
        nextErrors.registrationNumber = "Wrong Format";
      }
      if (normalizedInfo.tin.trim().length > 0 && !identityFormats.tin) {
        nextErrors.tin = "Wrong Format";
      }

      Object.assign(nextErrors, validateBusinessLocation(normalizedInfo));

      logStepValidationDebug({
        step,
        missingKeys: Object.keys(nextErrors),
        info: normalizedInfo,
      });

      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        setStatusMessage({ kind: "error", text: "Complete required fields before moving to the next step." });
        return;
      }
    }

    if (step === 2) {
      const normalizedInfo = normalizeBusinessInfo(info);
      const nextErrors: Partial<Record<keyof BusinessInfo, string>> = {};

      if (!hasLockedRecordLineOfBusiness && !normalizedInfo.lineOfBusiness.trim()) {
        nextErrors.lineOfBusiness = "Line of Business is required.";
      }

      const grossRaw = normalizedInfo.grossProfit?.trim() ?? "";
      if (!grossRaw) {
        nextErrors.grossProfit = "Gross Profit / Gross Receipts is required.";
      } else if (parsePositiveAmount(grossRaw) == null) {
        nextErrors.grossProfit = "Gross Profit / Gross Receipts must be a non-negative amount.";
      }

      Object.assign(nextErrors, validateRenewalBusinessOperations(normalizedInfo));

      logStepValidationDebug({
        step,
        missingKeys: Object.keys(nextErrors),
        info: normalizedInfo,
      });

      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        setStatusMessage({ kind: "error", text: "Complete Business Operation fields before moving to the next step." });
        return;
      }
    }

    if (step === 4) {
      const paymentErrors = validateRenewalPaymentFrequency(normalizeBusinessInfo(info));
      if (Object.keys(paymentErrors).length > 0) {
        setFieldErrors(paymentErrors);
        setStatusMessage({ kind: "error", text: "Select a mode of payment before proceeding." });
        return;
      }
    }

    setFieldErrors({});
    setStatusMessage(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function back() {
    if (isReadOnly) return;
    setStep((current) => Math.max(current - 1, 0));
  }

  function handleFinalSubmit() {
    if (isResubmission && !window.confirm(getResubmissionConfirmMessage("RENEWAL"))) {
      return;
    }
    void persist("SUBMIT");
  }

  async function persist(mode: PersistMode) {
    if (isReadOnly) {
      setStatusMessage({
        kind: "error",
        text: "This application has already been submitted and is now locked for review.",
      });
      return null;
    }

    setSubmitting(true);
    setStatusMessage(null);
    setValidationDetail(null);
    setFieldErrors({});

    const identityFormats = validateBusinessIdentityFormats(info);
    const identityErrors: Partial<Record<keyof BusinessInfo, string>> = {};

    if (info.registrationNumber.trim().length > 0 && !identityFormats.registrationNumber) {
      identityErrors.registrationNumber = "Wrong Format";
    }
    if (info.tin.trim().length > 0 && !identityFormats.tin) {
      identityErrors.tin = "Wrong Format";
    }

    if (Object.keys(identityErrors).length > 0) {
      setFieldErrors(identityErrors);
      setStatusMessage({ kind: "error", text: "Wrong Format" });
      setSubmitting(false);
      return null;
    }

    if (!selectedRecord) {
      setStatusMessage({
        kind: "error",
        text: unavailableCount > 0
          ? "Select an eligible business record before submitting renewal. Some businesses are currently unavailable for renewal."
          : "Select an eligible business record before submitting renewal.",
      });
      setSubmitting(false);
      return null;
    }

    if (mode === "SUBMIT") {
      const locationErrors = validateBusinessLocation(info);
      if (Object.keys(locationErrors).length > 0) {
        setFieldErrors(locationErrors);
        setStatusMessage({ kind: "error", text: BUSINESS_LOCATION_ERROR });
        setSubmitting(false);
        return null;
      }

      if (requiresBarangay(info) && !info.mainOfficeBarangay?.trim()) {
        setFieldErrors({ mainOfficeBarangay: "Barangay is required for Philippine main office addresses." });
        setStatusMessage({ kind: "error", text: "Barangay is required for Philippine main office addresses." });
        setSubmitting(false);
        return null;
      }

      const fixedAddressErrors = validateFixedEbMagalonaAddress(info);
      if (Object.keys(fixedAddressErrors).length > 0) {
        setFieldErrors(fixedAddressErrors);
        setStatusMessage({ kind: "error", text: "Business address must remain within fixed EB Magalona values." });
        setSubmitting(false);
        return null;
      }

      // Birthdate validation removed from Renewal form per Phase 1.

      const grossRaw = info.grossProfit?.trim() ?? "";
      if (!grossRaw || parsePositiveAmount(grossRaw) == null) {
        setFieldErrors({ grossProfit: "Gross Profit / Gross Receipts must be a non-negative amount." });
        setStatusMessage({ kind: "error", text: "Gross Profit / Gross Receipts must be a non-negative amount." });
        setSubmitting(false);
        return null;
      }

      const operationErrors = {
        ...validateRenewalBusinessOperations(info),
        ...validateRenewalPaymentFrequency(info),
      };
      if (Object.keys(operationErrors).length > 0) {
        setFieldErrors(operationErrors);
        setStatusMessage({ kind: "error", text: "Complete Business Operations fields before submitting." });
        setSubmitting(false);
        return null;
      }

      if (!hasLockedRecordLineOfBusiness && !info.lineOfBusiness.trim()) {
        setFieldErrors({ lineOfBusiness: "Line of Business is required." });
        setStatusMessage({ kind: "error", text: "Line of Business is required for renewal submission." });
        setSubmitting(false);
        return null;
      }

      const missingDocuments = getMissingRequiredDocuments(requiredRenewalDocs, [
        ...Object.values(uploadedDocuments).map((doc) => doc.documentName),
        ...Object.keys(pendingDocuments),
      ]);
      if (missingDocuments.length > 0) {
        setStep(3);
        setValidationDetail({ missingFields: [], missingDocuments });
        setStatusMessage({
          kind: "error",
          text: "Upload all required renewal documents before submitting.",
        });
        setSubmitting(false);
        return null;
      }
    }

    const payload = buildCleanPayload({
      applicationId,
      selectedBusinessId,
      mode,
      info,
      documents: Object.values(uploadedDocuments),
    });

    const hasPendingFiles = Object.keys(pendingDocuments).length > 0;
    if (mode === "SUBMIT" && hasPendingFiles) {
      const totalSizeError = validateTotalPendingUploadSize(Object.values(pendingDocuments));
      if (totalSizeError) {
        setStatusMessage({
          kind: "error",
          text: totalSizeError,
        });
        setSubmitting(false);
        return null;
      }
    }

    const draftTargetUrl = applicationId ? `/api/applicant/applications/${applicationId}` : "/api/applicant/applications";
    const draftTargetMethod = applicationId ? "PATCH" : "POST";
    const saveUrl = mode === "SUBMIT" ? "/api/applicant/applications" : draftTargetUrl;
    const saveMethod = mode === "SUBMIT" ? "POST" : draftTargetMethod;

    const response = hasPendingFiles
      ? await (async () => {
          const formData = new FormData();
          formData.append("payload", JSON.stringify(payload));
          for (const [documentName, file] of Object.entries(pendingDocuments)) {
            formData.append("documentNames", documentName);
            formData.append("documentFiles", file, file.name);
          }

          return fetch(saveUrl, {
            method: saveMethod,
            body: formData,
          });
        })()
      : await fetch(saveUrl, {
          method: saveMethod,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    const data = (await parseApiResponseSafely(response)) as {
      application?: { id: string; applicationNumber: string; status: string };
      error?: string;
      detail?: SubmitValidationErrorDetail;
      duplicateField?: string;
      message?: string;
      rawResponse?: string;
    };
    setSubmitting(false);

    if (!response.ok || !data.application) {
      if (data.duplicateField === "registrationNumber" || data.duplicateField === "tin") {
        setFieldErrors({ [data.duplicateField]: "This already exist" });
      }
      const detail =
        typeof data.rawResponse === "string" && data.rawResponse.length > 0
          ? ` (${data.rawResponse})`
          : "";
      const duplicateMessage =
        data.duplicateField === "registrationNumber" || data.duplicateField === "tin"
          ? data.message ??
            `An application with this ${
              data.duplicateField === "registrationNumber" ? "Registration Number" : "TIN"
            } already exists. Do not proceed with submission.`
          : null;
      setStatusMessage({
        kind: "error",
        text:
          duplicateMessage ??
          data.error ??
          `Unable to save renewal application (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}).${detail}`,
      });
      if (data.detail) setValidationDetail(data.detail);
      return null;
    }

    setApplicationId(data.application.id);

    if (mode === "SUBMIT") {
      for (const previewUrl of Object.values(pendingDocumentPreviews)) {
        URL.revokeObjectURL(previewUrl);
      }
      setPendingDocuments({});
      setPendingDocumentPreviews({});
      setStatusMessage({
        kind: "success",
        text: getApplicationSubmitSuccessMessage("RENEWAL", isResubmission, data.application.applicationNumber),
      });
      return data.application.id;
    }

    if (hasPendingFiles || Object.keys(uploadedDocuments).length > 0) {
      try {
        const docsResponse = await fetch(`/api/applicant/applications/${data.application.id}/documents`, {
          cache: "no-store",
        });
        const docsData = (await parseApiResponseSafely(docsResponse)) as {
          documents?: ApplicationDocumentInput[];
        };
        if (docsResponse.ok && Array.isArray(docsData.documents)) {
          setUploadedDocuments(
            docsData.documents.reduce<Record<string, ApplicationDocumentInput>>((acc, doc) => {
              acc[doc.documentName] = doc;
              return acc;
            }, {})
          );
        }
      } catch {
        // Keep local metadata if refresh fails; files are already persisted server-side.
      }
    }

    for (const previewUrl of Object.values(pendingDocumentPreviews)) {
      URL.revokeObjectURL(previewUrl);
    }
    setPendingDocuments({});
    setPendingDocumentPreviews({});
    setStatusMessage({
      kind: "success",
      text: `Renewal draft ${data.application.applicationNumber} saved successfully. Uploaded documents are kept with this draft.`,
    });
    return data.application.id;
  }

  async function handleDocumentUpload(documentName: string, file: File | null) {
    if (isReadOnly) return;
    if (!file) return;

    if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      setStatusMessage({ kind: "error", text: buildDocumentMaxSizeError(file.name) });
      return;
    }

    const fileValidationError = validateDocumentFileUpload(file);
    if (fileValidationError) {
      setStatusMessage({ kind: "error", text: fileValidationError });
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    const previousPreviewUrl = pendingDocumentPreviews[documentName];
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }

    setPendingDocuments((current) => ({
      ...current,
      [documentName]: file,
    }));
    setPendingDocumentPreviews((current) => ({
      ...current,
      [documentName]: nextPreviewUrl,
    }));

    setUploadedDocuments((current) => ({
      ...current,
      [documentName]: {
        documentType: documentName,
        documentName,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        fileSize: file.size,
        validationStatus: "Pending Review",
        validationRemarks: null,
      },
    }));
    setStatusMessage({
      kind: "success",
      text: `${documentName} selected. It will be saved with your draft or on final submit.`,
    });
  }

  async function handleDocumentDelete(documentName: string) {
    if (isReadOnly) return;
    const doc = uploadedDocuments[documentName];
    const hasSavedDocument = Boolean(doc?.id && applicationId);

    if (!hasSavedDocument) {
      const previewUrl = pendingDocumentPreviews[documentName];
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setUploadedDocuments((current) => {
        const nextState = { ...current };
        delete nextState[documentName];
        return nextState;
      });
      setPendingDocuments((current) => {
        const nextState = { ...current };
        delete nextState[documentName];
        return nextState;
      });
      setPendingDocumentPreviews((current) => {
        const nextState = { ...current };
        delete nextState[documentName];
        return nextState;
      });
      return;
    }

    setSubmitting(true);
    const response = await fetch(`/api/applicant/applications/${applicationId}/documents/${doc.id}`, {
      method: "DELETE",
    });
    setSubmitting(false);

    if (!response.ok) return;

    setUploadedDocuments((current) => {
      const nextState = { ...current };
      delete nextState[documentName];
      return nextState;
    });
    setPendingDocuments((current) => {
      const nextState = { ...current };
      delete nextState[documentName];
      return nextState;
    });
    setPendingDocumentPreviews((current) => {
      const nextState = { ...current };
      delete nextState[documentName];
      return nextState;
    });
    setStatusMessage({
      kind: "success",
      text: `${documentName} removed.`,
    });
  }

  return (
    <div className="ui-page-stack">
      <FormStepper steps={steps} currentStep={step} />

      {statusMessage ? (
        <InfoBanner
          title={statusMessage.kind === "success" ? "Renewal update" : "Renewal issue"}
          description={statusMessage.text}
          variant={statusMessage.kind === "success" ? "success" : "danger"}
        />
      ) : null}

      {editId && existingApplicationAccess?.status === "Returned for Correction" ? (
        <InfoBanner
          title="Correction Mode"
          description="This renewal was returned for correction. You may edit and resubmit."
          variant="warning"
        />
      ) : null}

      {isReadOnly ? (
        <InfoBanner
          title="Application Locked"
          description="This application has already been submitted and is now locked for review."
          variant="info"
        />
      ) : null}

      {step === 0 ? (
        <SectionCard
          title="Select Existing Business"
          description="Renewal starts from a registered business record. Core registration fields stay locked to preserve the existing record."
        >
          <div className="space-y-4">
            {records.length === 0 ? (
              <EmptyState
                title={unavailableCount > 0 ? "No eligible renewal records" : "No records available yet"}
                description={
                  unavailableCount > 0
                    ? "Some businesses are currently unavailable for renewal. Review the section below for reasons."
                    : "No action is required right now. This renewal form will populate once you have an existing business record."
                }
              />
            ) : (
              <FormField
                label="Existing Business Record"
                hint="Choose which registered business record you want to renew."
                required
              >
                <select
                  className={applicantFormControlClass}
                  value={selectedBusinessId}
                  disabled={records.length === 0 || isReadOnly}
                  onChange={(event) => {
                    const selectedId = event.target.value;
                    selectedBusinessIdRef.current = selectedId;
                    setSelectedBusinessId(selectedId);
                    const selected = records.find((item) => item.id === selectedId);
                    if (selected) {
                      setInfo(
                        normalizeBusinessInfo({
                          ...defaultBusinessInfo,
                          ...selected.businessInfo,
                          lineOfBusiness: resolveRenewalLineOfBusiness(selected.businessInfo.lineOfBusiness),
                          paymentFrequency: selected.businessInfo.paymentFrequency ?? "ANNUAL",
                        })
                      );
                      setFieldErrors({});
                    }
                  }}
                >
                  {records.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.businessName} ({business.registrationNumber})
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            {selectedRecord ? (
              <div className={applicantPanelClass}>
                <p className="font-semibold text-[var(--foreground)]">{selectedRecord.businessName}</p>
                <p className="mt-1">Registration: {selectedRecord.registrationNumber}</p>
                <p className="mt-1">Email: {selectedRecord.businessInfo.email}</p>
              </div>
            ) : null}

            {blockedRecords.length > 0 ? (
              <div className={applicantWarningPanelClass}>
                <p className="text-sm font-semibold text-[var(--foreground)]">Unavailable for renewal</p>
                <div className="mt-3 space-y-3">
                  {blockedRecords.map((record) => (
                    <div key={record.id} className={`${applicantHighlightPanelClass} text-sm text-[var(--ink-muted)]`}>
                      <p className="font-semibold text-[var(--foreground)]">{record.businessName}</p>
                      <p className="ui-caption">{record.registrationNumber}</p>
                      <p className="mt-1 text-sm text-[var(--ink-muted)]">
                        {record.renewalEligibility.userFriendlyReason ?? "Unavailable for renewal."}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="ui-badge bg-[var(--muted-surface)] text-[var(--ink-muted)]">
                          {humanizeNonComplianceType(record.renewalEligibility.nonComplianceType)}
                        </span>
                        <span className="ui-badge bg-[var(--muted-surface)] text-[var(--ink-muted)]">
                          {humanizeCaseStatus(record.renewalEligibility.complianceCaseStatus)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {step === 1 ? (
        <div className={`space-y-4 ${lockInteractivityClass}`}>
          <InfoBanner
            title="Locked fields come from the selected business record"
            description="Business type, registration details, and owner identity remain read-only during renewal. Editable fields can still be updated if needed."
            variant="readOnly"
          />
          <SectionCard
            title="Business Information"
            description="Required fields are marked clearly. Locked values are visually separated and remain unchanged."
          >
            <BusinessInformationFields
              value={info}
              onChange={(nextInfo) => {
                const normalizedNext = normalizeBusinessInfo(nextInfo);
                setInfo({
                  ...normalizedNext,
                  // Preserve live typing (spaces / multi-word) — trim only on blur/submit.
                  businessName: nextInfo.businessName,
                  tradeName: nextInfo.tradeName,
                  ownerName: nextInfo.ownerName,
                  ownerFirstName: nextInfo.ownerFirstName,
                  ownerMiddleName: nextInfo.ownerMiddleName,
                  ownerSurname: nextInfo.ownerSurname,
                  ownerSuffix: nextInfo.ownerSuffix,
                  businessStreetAddress: nextInfo.businessStreetAddress,
                  streetAddress: nextInfo.streetAddress,
                  mainOfficeStreetAddress: nextInfo.mainOfficeStreetAddress,
                  mainOfficeBarangay: nextInfo.mainOfficeBarangay,
                  barangay: nextInfo.barangay,
                  lineOfBusiness: nextInfo.lineOfBusiness,
                  taxIncentives: nextInfo.taxIncentives,
                  phone: sanitizePhMobileInput(nextInfo.phone ?? ""),
                });
                if (
                  typeof normalizedNext.businessLatitude === "number" &&
                  typeof normalizedNext.businessLongitude === "number" &&
                  isWithinEbMagalona(normalizedNext.businessLatitude, normalizedNext.businessLongitude)
                ) {
                  setFieldErrors((current) => {
                    if (!current.businessLatitude && !current.businessLongitude) {
                      return current;
                    }
                    const nextErrors = { ...current };
                    delete nextErrors.businessLatitude;
                    delete nextErrors.businessLongitude;
                    return nextErrors;
                  });
                }
              }}
              applicationType="RENEWAL"
              onFieldBlur={validateFieldOnBlur}
              onClearFieldError={(field) => {
                setFieldErrors((current) => {
                  if (!current[field]) return current;
                  const nextErrors = { ...current };
                  delete nextErrors[field];
                  return nextErrors;
                });
              }}
              lockedFields={lockedFields}
              fieldErrors={fieldErrors}
              enableCascadingAddress
            />
          </SectionCard>
        </div>
      ) : null}

      {step === 2 ? (
        <div className={`space-y-4 ${lockInteractivityClass}`}>
          <InfoBanner
            title="Business operation details"
            description="Update operational, staffing, and property details for this renewal period."
            variant="info"
          />
          <SectionCard
            title="Business Operations"
            description="Update operation details for this renewal period before document upload and review."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {RENEWAL_OPERATION_FIELDS.map((field) => (
                <FormField key={field.key} label={field.label} hint={field.helperText}>
                  <input
                    aria-label={field.label}
                    className={applicantFormControlClass}
                    value={(info[field.key] as string | undefined) ?? ""}
                    inputMode={field.numericKind === "integer" ? "numeric" : field.numericKind === "decimal" ? "decimal" : undefined}
                    onBlur={() => validateFieldOnBlur(field.key)}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const next =
                        field.numericKind === "integer"
                          ? sanitizeIntegerInput(raw)
                          : field.numericKind === "decimal"
                            ? sanitizeDecimalInput(raw)
                            : raw;
                      setInfo((current) =>
                        normalizeBusinessInfo({ ...current, [field.key]: next })
                      );
                    }}
                  />
                </FormField>
              ))}

              <FormField
                label="Gross Profit / Gross Receipts"
                hint="Enter the latest declared gross receipts or gross profit amount in pesos (0 or higher)."
                error={fieldErrors.grossProfit}
              >
                <input
                  aria-label="Gross Profit / Gross Receipts"
                  className={applicantFormControlClass}
                  value={info.grossProfit ?? ""}
                  inputMode="decimal"
                  onBlur={() => validateFieldOnBlur("grossProfit")}
                  onChange={(event) =>
                    setInfo((current) =>
                      normalizeBusinessInfo({
                        ...current,
                        grossProfit: sanitizeDecimalInput(event.target.value),
                      })
                    )
                  }
                />
              </FormField>

              <FormField
                label="Business Activity"
                hint="Please select one"
                required
                error={fieldErrors.businessActivity}
              >
                <select
                  aria-label="Business Activity"
                  onBlur={() => validateFieldOnBlur("businessActivity")}
                  onChange={(event) => {
                    const value = event.target.value;
                    setInfo((current) =>
                      normalizeBusinessInfo({
                        ...current,
                        businessActivity:
                          value === BUSINESS_ACTIVITY_OTHER_OPTION
                            ? BUSINESS_ACTIVITY_OTHER_OPTION
                            : value,
                      })
                    );
                  }}
                >
                  <option value="">Select business activity</option>
                  {BUSINESS_ACTIVITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </FormField>

              {selectedBusinessActivity.selected === BUSINESS_ACTIVITY_OTHER_OPTION ? (
                <FormField
                  label="Other Business Activity / Specify Activity"
                  required
                  error={fieldErrors.businessActivity}
                >
                  <input
                    type="text"
                    aria-label="Other Business Activity / Specify Activity"
                    className={applicantFormControlClass}
                    placeholder="Enter your business activity"
                    value={selectedBusinessActivity.otherText}
                    onBlur={() => validateFieldOnBlur("businessActivity")}
                    onChange={(event) => {
                      const customText = event.target.value;
                      setInfo((current) =>
                        normalizeBusinessInfo({
                          ...current,
                          businessActivity: customText ? `Others: ${customText}` : BUSINESS_ACTIVITY_OTHER_OPTION,
                        })
                      );
                    }}
                  />
                </FormField>
              ) : null}

              <FormField
                label="Line of Business"
                hint={
                  hasLockedRecordLineOfBusiness
                    ? "Line of Business is based on your existing business record."
                    : "Please select the line of business for this business."
                }
                error={fieldErrors.lineOfBusiness}
              >
                <select
                  className={applicantFormControlClass}
                  value={info.lineOfBusiness}
                  disabled={renewalLineOfBusinessLocked}
                  onChange={(event) => {
                    setInfo((current) =>
                      normalizeBusinessInfo({ ...current, lineOfBusiness: event.target.value })
                    );
                    setFieldErrors((current) => {
                      const next = { ...current };
                      delete next.lineOfBusiness;
                      return next;
                    });
                  }}
                >
                  <option value="" disabled>Select line of business</option>
                  {lineOfBusinessOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {fieldErrors.lineOfBusiness ? (
                  <p className="mt-1 text-xs font-medium text-[var(--danger)]">{fieldErrors.lineOfBusiness}</p>
                ) : null}
              </FormField>

              <label className={applicantCheckboxCardClass}>
                <input
                  data-field-key="isMarket"
                  type="checkbox"
                  className="mt-1"
                  checked={info.isMarket}
                  disabled={isReadOnly}
                  onChange={(event) =>
                    setInfo((current) =>
                      normalizeBusinessInfo({ ...current, isMarket: event.target.checked })
                    )
                  }
                />
                <span>
                  <span className="block font-semibold text-[var(--foreground)]">Market business</span>
                  Keep this checked when the registered business still operates inside a public market or market stall.
                </span>
              </label>

              <label className={applicantCheckboxCardClass}>
                <input
                  data-field-key="isAgriculture"
                  type="checkbox"
                  className="mt-1"
                  checked={info.isAgriculture}
                  disabled={isReadOnly}
                  onChange={(event) =>
                    setInfo((current) =>
                      normalizeBusinessInfo({ ...current, isAgriculture: event.target.checked })
                    )
                  }
                />
                <span>
                  <span className="block font-semibold text-[var(--foreground)]">Agriculture-related business</span>
                  Keep this checked when Department of Agriculture clearance is still required for this renewal.
                </span>
              </label>

              <label className={`${applicantCheckboxCardClass} md:col-span-2`}>
                <input
                  data-field-key="isLiquorOrTobacco"
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(info.isLiquorOrTobacco)}
                  disabled={isReadOnly}
                  onChange={(event) =>
                    setInfo((current) =>
                      normalizeBusinessInfo({ ...current, isLiquorOrTobacco: event.target.checked })
                    )
                  }
                />
                <span>
                  <span className="block font-semibold text-[var(--foreground)]">Liquor/Tobacco business</span>
                  If selected, BPLO will automatically apply the required 25% surcharge during assessment.
                </span>
              </label>
            </div>
          </SectionCard>

          <SectionCard
            title="Property and Tax Basis"
            description="Property details for business location and assessment basis."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Property Ownership">
                <select
                  className={applicantFormControlClass}
                  value={info.propertyOwnership}
                  onChange={(event) =>
                    setInfo((current) =>
                      normalizeBusinessInfo({
                        ...current,
                        propertyOwnership: event.target.value as PropertyOwnership,
                      })
                    )
                  }
                >
                  <option>Owned</option>
                  <option>Not Owned</option>
                </select>
              </FormField>

              <div className={applicantPanelClass}>
                {info.propertyOwnership === "Owned" ? (
                  <div className="space-y-3">
                    <FormField label="Tax Declaration Number">
                      <input
                        aria-label="Tax Declaration Number"
                        className={applicantFormControlClass}
                        value={info.taxDeclarationNumber ?? ""}
                        onChange={(event) =>
                          setInfo((current) =>
                            normalizeBusinessInfo({ ...current, taxDeclarationNumber: event.target.value })
                          )
                        }
                      />
                    </FormField>
                    <FormField label="Property Identification Number">
                      <input
                        aria-label="Property Identification Number"
                        className={applicantFormControlClass}
                        value={info.propertyIdentificationNumber ?? ""}
                        onChange={(event) =>
                          setInfo((current) =>
                            normalizeBusinessInfo({
                              ...current,
                              propertyIdentificationNumber: event.target.value,
                            })
                          )
                        }
                      />
                    </FormField>
                  </div>
                ) : (
                  <p>Property is not owned — no tax declaration or property identification required.</p>
                )}
              </div>

              <div className="md:col-span-2">
                <FormField
                  label="Tax Incentives from Government Entity"
                  hint="Select whether this business currently holds any government-granted tax incentive."
                  error={fieldErrors.hasTaxIncentives}
                >
                  <div className="grid gap-3 sm:grid-cols-2" data-field-key="hasTaxIncentives">
                    <label className={applicantRadioLabelClass}>
                      <input
                        type="radio"
                        name="renewalHasTaxIncentives"
                        value="YES"
                        checked={info.hasTaxIncentives === "YES"}
                        disabled={isReadOnly}
                        onChange={() => {
                          setInfo((current) =>
                            normalizeBusinessInfo({ ...current, hasTaxIncentives: "YES" })
                          );
                          setFieldErrors((current) => {
                            const next = { ...current };
                            delete next.hasTaxIncentives;
                            return next;
                          });
                        }}
                      />
                      Yes
                    </label>
                    <label className={applicantRadioLabelClass}>
                      <input
                        type="radio"
                        name="renewalHasTaxIncentives"
                        value="NO"
                        checked={info.hasTaxIncentives === "NO"}
                        disabled={isReadOnly}
                        onChange={() => {
                          setInfo((current) =>
                            normalizeBusinessInfo({ ...current, hasTaxIncentives: "NO", taxIncentives: "" })
                          );
                          setFieldErrors((current) => {
                            const next = { ...current };
                            delete next.hasTaxIncentives;
                            delete next.taxIncentives;
                            return next;
                          });
                        }}
                      />
                      No
                    </label>
                  </div>
                </FormField>

                {info.hasTaxIncentives === "YES" ? (
                  <FormField
                    label="Tax Incentive Details"
                    hint="Describe the tax incentive granted (e.g., program name, granting agency)."
                    error={fieldErrors.taxIncentives}
                  >
                    <input
                      data-field-key="taxIncentives"
                      aria-label="Tax Incentive Details"
                      className={applicantFormControlClass}
                      value={info.taxIncentives ?? ""}
                      disabled={isReadOnly}
                      onBlur={() => validateFieldOnBlur("taxIncentives")}
                      onChange={(event) =>
                        setInfo((current) =>
                          normalizeBusinessInfo({ ...current, taxIncentives: event.target.value })
                        )
                      }
                    />
                  </FormField>
                ) : null}
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {step === 3 ? (
        <div className={`space-y-4 ${lockInteractivityClass}`}>
          <InfoBanner
            title={`Required documents uploaded: ${uploadedRequiredCount} of ${requiredRenewalDocs.length}`}
            description="Upload each required document now. Saving a draft keeps these files so you do not need to re-upload them later."
            variant="info"
          />
          <SectionCard
            title="Document Upload"
            description="Conditional clearances may appear depending on the line of business and recorded activity."
          >
            <RequirementsUploadTable
              accept={DOCUMENT_FILE_INPUT_ACCEPT}
              rows={requiredRenewalDocs.map((doc) => {
                const uploadedDoc = getUploadedDocumentForRequiredName(doc);
                const isMissing = (validationDetail?.missingDocuments ?? []).some(
                  (m) => normalizeDocumentName(m) === normalizeDocumentName(doc)
                );
                return {
                  documentName: doc,
                  description: getDocumentRequirementDescription(doc),
                  required: true,
                  fileName: uploadedDoc?.fileName,
                  uploadedAt: uploadedDoc?.uploadedAt,
                  previewUrl:
                    pendingDocumentPreviews[doc] ??
                    (uploadedDoc?.id && applicationId
                      ? `/api/applicant/applications/${applicationId}/documents/${uploadedDoc.id}/download`
                      : undefined),
                  error: isMissing ? "This document is required." : undefined,
                  remarks: uploadedDoc?.validationRemarks ?? undefined,
                  validationStatus: uploadedDoc?.fileName
                    ? uploadedDoc.validationStatus ?? "Pending Review"
                    : undefined,
                  disabled: submitting || records.length === 0 || isReadOnly,
                };
              })}
              onFileChange={(documentName, file) => {
                void handleDocumentUpload(documentName, file);
              }}
              onRemove={(documentName) => {
                const uploadedDoc = getUploadedDocumentForRequiredName(documentName);
                void handleDocumentDelete(uploadedDoc?.documentName ?? documentName);
              }}
            />
          </SectionCard>
        </div>
      ) : null}

      {step === 4 ? (
        <div className={`space-y-4 ${lockInteractivityClass}`}>
          <SectionCard
            title="Preferred Mode of Payment"
            description="Choose how you prefer to pay the assessed fees. Final payment details are confirmed after BPLO assessment."
          >
            <FormField
              label="Mode of Payment"
              hint="Applicant-selected payment preference for renewal assessment."
              required
              error={fieldErrors.paymentFrequency}
            >
              <div className="grid gap-3 md:grid-cols-3">
                <label className={applicantRadioLabelClass}>
                  <input
                    type="radio"
                    name="renewalPaymentFrequency"
                    value="ANNUAL"
                    checked={info.paymentFrequency === "ANNUAL"}
                    disabled={isReadOnly}
                    onChange={() => {
                      setInfo((current) => normalizeBusinessInfo({ ...current, paymentFrequency: "ANNUAL" }));
                      setFieldErrors((curr) => {
                        const next = { ...curr };
                        delete next.paymentFrequency;
                        return next;
                      });
                    }}
                  />
                  Annual
                </label>
                <label className={applicantRadioLabelClass}>
                  <input
                    type="radio"
                    name="renewalPaymentFrequency"
                    value="BI_ANNUAL"
                    checked={info.paymentFrequency === "BI_ANNUAL"}
                    disabled={isReadOnly}
                    onChange={() => {
                      setInfo((current) => normalizeBusinessInfo({ ...current, paymentFrequency: "BI_ANNUAL" }));
                      setFieldErrors((curr) => {
                        const next = { ...curr };
                        delete next.paymentFrequency;
                        return next;
                      });
                    }}
                  />
                  Bi-Annual
                </label>
                <label className={applicantRadioLabelClass}>
                  <input
                    type="radio"
                    name="renewalPaymentFrequency"
                    value="QUARTERLY"
                    checked={info.paymentFrequency === "QUARTERLY"}
                    disabled={isReadOnly}
                    onChange={() => {
                      setInfo((current) => normalizeBusinessInfo({ ...current, paymentFrequency: "QUARTERLY" }));
                      setFieldErrors((curr) => {
                        const next = { ...curr };
                        delete next.paymentFrequency;
                        return next;
                      });
                    }}
                  />
                  Quarterly
                </label>
              </div>
            </FormField>
          </SectionCard>

          <InfoBanner
            title="BPLO assessment"
            description="Fees will be assessed by BPLO after application review."
            variant="info"
          />
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-4">
          <SectionCard
            title="Review and Submit"
            description="Confirm the selected business, uploaded requirements, and readiness for final validation."
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={back}
                  className={actionButtonStyles("ghost", "md")}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={records.length === 0}
                  onClick={() => setShowVerificationPrint(true)}
                  className={actionButtonStyles("secondary", "md")}
                >
                  Print Verification Form
                </button>
                <button
                  type="button"
                  disabled={submitting || records.length === 0 || isReadOnly}
                  onClick={() => {
                    void persist("DRAFT");
                  }}
                  className={actionButtonStyles("secondary", "md")}
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={submitting || records.length === 0 || isReadOnly}
                  onClick={handleFinalSubmit}
                  className={actionButtonStyles("primary", "md")}
                >
                  {getApplicationSubmitButtonLabel("RENEWAL", isResubmission)}
                </button>
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-3">
              <ReviewStat
                label="Business Name"
                value={info.businessName || "-"}
                helper="Loaded from the selected business record"
              />
              <ReviewStat
                label="Application Type"
                value="Renewal"
                helper="Renewal workflow behavior remains unchanged"
              />
              <ReviewStat
                label="Required Documents"
                value={`${uploadedRequiredCount} / ${requiredRenewalDocs.length}`}
                helper="Uploaded required document count"
              />
              <ReviewStat
                label="Business Activity"
                value={
                  selectedBusinessActivity.selected === BUSINESS_ACTIVITY_OTHER_OPTION
                    ? selectedBusinessActivity.otherText || "Others"
                    : selectedBusinessActivity.selected || "-"
                }
                helper="Renewal business activity declaration"
              />
              <ReviewStat
                label="Business Gross / Gross Profit"
                value={info.grossProfit?.trim() || "-"}
                helper="Latest declared renewal gross amount"
              />
              <ReviewStat
                label="Mode of Payment"
                value={info.paymentFrequency.replace("_", "-")}
                helper="Applicant-selected payment preference"
              />
            </div>

            <div className={`mt-4 ${applicantPanelClass}`}>
              <p className="font-semibold text-[var(--foreground)]">Main Office Address</p>
              <p className="mt-1">{info.mainOfficeAddress || "-"}</p>
              <p className="mt-1 ui-caption">Zip Code: {info.mainOfficeZipCode?.trim() || "-"}</p>
            </div>

            <div className={`mt-4 ${applicantPanelClass}`}>
              <p className="font-semibold text-[var(--foreground)]">Business Address</p>
              <p className="mt-1">{info.businessAddress || "-"}</p>
              <p className="mt-1 ui-caption">Zip Code: {info.businessZipCode?.trim() || EB_MAGALONA_ZIP_CODE}</p>
            </div>

            <div className={`mt-4 ${applicantPanelClass}`}>
              <p className="font-semibold text-[var(--foreground)]">Before you submit</p>
              <ul className="mt-2 space-y-1">
                <li>• Verify the selected business record is correct.</li>
                <li>• Review editable contact and address details for updates.</li>
                <li>• Confirm the renewal document set is complete and readable.</li>
              </ul>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border-color)] pt-4">
              <button
                type="button"
                disabled={isReadOnly}
                onClick={back}
                className={actionButtonStyles("secondary", "md")}
              >
                Back
              </button>
            </div>
          </SectionCard>

          {validationDetail ? <ValidationPanel detail={validationDetail} onBack={back} /> : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          disabled={step === 0 || isReadOnly}
          onClick={back}
          className={actionButtonStyles("ghost", "md")}
        >
          Back
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            disabled={isReadOnly}
            onClick={next}
            className={actionButtonStyles("primary", "md")}
          >
            Next
          </button>
        ) : null}
      </div>

      {showVerificationPrint ? (
        <ApplicationVerificationTemplate
          info={info}
          applicationTypeLabel="Business Permit Renewal Application"
          requiredDocuments={requiredRenewalDocs}
          uploadedDocumentNames={Object.values(uploadedDocuments).map((doc) => doc.documentName)}
          onClose={() => setShowVerificationPrint(false)}
        />
      ) : null}
    </div>
  );
}
