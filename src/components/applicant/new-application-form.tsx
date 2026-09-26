"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { defaultBusinessInfo } from "@/lib/applicant-mock";
import { normalizeBusinessInfo as normalizeBusinessInfoRules } from "@/lib/business-rules";
import {
  isPhilippinesCountry,
  validateBusinessIdentityFormats,
  BUSINESS_ACTIVITY_OPTIONS,
} from "@/lib/business-rules";
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
import { isWithinEbMagalona } from "@/lib/eb-magalona";
import type {
  ApplicationDocumentInput,
  BusinessInfo,
  PersistMode,
  PropertyOwnership,
  SaveApplicationInput,
} from "@/lib/applicant-types";
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
import { useLineOfBusinessOptions } from "@/hooks/use-line-of-business-options";
import { resolveBusinessBarangayFromFormState } from "@/lib/business-rules";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/lib/numeric-input";
import { BusinessInformationFields } from "./business-information-fields";
import { ApplicationVerificationTemplate } from "@/components/print/application-verification-template";
import { FormStepper } from "@/components/applicant/form-stepper";
import { RequirementsUploadTable } from "@/components/applicant/requirements-upload-table";
import {
  applicantCheckboxCardClass,
  applicantErrorPanelClass,
  applicantFormControlClass,
  applicantPanelClass,
  applicantRadioLabelClass,
  applicantSummaryLabelClass,
  applicantSummaryTileClass,
  applicantSummaryValueClass,
} from "@/components/applicant/applicant-ui-styles";
import { actionButtonStyles } from "@/components/ui/action-button";
import { FormField } from "@/components/ui/form-field";
import { InfoBanner } from "@/components/ui/info-banner";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingState } from "@/components/ui/loading-state";
import {
  getApplicationSubmitButtonLabel,
  getApplicationSubmitSuccessMessage,
  getResubmissionConfirmMessage,
  isReturnedCorrectionResubmission,
} from "@/lib/resubmission-copy";

type NewApplicationFieldKey = keyof BusinessInfo | "requiredDocuments";

type FieldNavigationConfig = {
  step: number;
  label: string;
  selector: string;
};

const steps = [
  {
    title: "Business Information",
    description: "Enter core business identity and contact details.",
  },
  {
    title: "Business Operation",
    description: "Provide operational, staffing, and property details.",
  },
  {
    title: "Document Upload",
    description: "Upload all required clearances and supporting files.",
  },
  {
    title: "Assessment Notice",
    description: "Final fees are assessed by BPLO after application review.",
  },
  {
    title: "Review and Submit",
    description: "Check completeness, then save draft or submit.",
  },
];

const operationFields: Array<{
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
  {
    label: "Employees Residing within Municipality",
    key: "employeesWithinMunicipality",
    numericKind: "integer",
  },
  { label: "Van / Truck", key: "deliveryVanTruck", helperText: "Number of vans or trucks, if applicable.", numericKind: "integer" },
  { label: "Motorcycle", key: "deliveryMotorcycle", helperText: "Number of motorcycles, if applicable.", numericKind: "integer" },
  { label: "Asset Size", key: "assetSize", helperText: "Use the declared amount in pesos.", numericKind: "decimal" },
];

// taxIncentives restored on Business Operation step (field preserved in DB / type for existing records)

const FIELD_LABELS: Partial<Record<keyof BusinessInfo, string>> = {
  businessType: "Business Type",
  registrationNumber: "Registration Number",
  tin: "TIN",
  businessName: "Business Name",
  tradeName: "Trade Name",
  ownerName: "Owner / President Name",
  ownerFirstName: "First Name",
  ownerSurname: "Last Name",
  ownerSuffix: "Suffix",
  ownerAge: "Owner Age",
  capitalInvestment: "Capital Investment",
  barangay: "Barangay",
  businessOperationType: "Business Office Type",
  nationality: "Nationality",
  email: "Email",
  phone: "Mobile Number",
  telephone: "Telephone Number",
  corporationNationality: "Corporation Nationality",
  country: "Country",
  countryCode: "Country Code",
  province: "Province",
  provinceCode: "Province Code",
  cityMunicipality: "City / Municipality",
  streetAddress: "Street Address",
  mainOfficeCountry: "Main Office Country",
  mainOfficeCountryCode: "Main Office Country Code",
  mainOfficeProvince: "Main Office Province / State",
  mainOfficeProvinceCode: "Main Office Province / State Code",
  mainOfficeCityMunicipality: "Main Office City / Municipality",
  mainOfficeStreetAddress: "Main Office Street / Address Line",
  mainOfficeBarangay: "Main Office Barangay",
  mainOfficeAddress: "Main Office Address",
  businessAddress: "Business Address",
  businessBarangay: "Business Barangay",
  businessStreetAddress: "Business Street / Purok / Building / Unit",
  businessLatitude: "Business Location Latitude",
  businessLongitude: "Business Location Longitude",
  businessArea: "Business Area",
  totalFloorArea: "Total Floor Area",
  totalEmployees: "Total Employees",
  maleEmployees: "Male Employees",
  femaleEmployees: "Female Employees",
  employeesWithinMunicipality: "Employees Residing within Municipality",
  deliveryVanTruck: "Van / Truck",
  deliveryMotorcycle: "Motorcycle",
  deliveryVehicles: "Delivery Vehicles",
  businessActivity: "Business Activity",
  lineOfBusiness: "Line of Business",
  assetSize: "Asset Size",
  taxDeclarationNumber: "Tax Declaration Number",
  propertyIdentificationNumber: "Property Identification Number",
  orNumber: "OR Number",
};

const BUSINESS_LOCATION_ERROR = "Please pin the business location inside EB Magalona.";

const STEP_REQUIRED_FIELDS: Record<number, Array<keyof BusinessInfo>> = {
  0: [
    "businessType",
    "registrationNumber",
    "tin",
    "businessName",
    "ownerFirstName",
    "ownerSurname",
    "nationality",
    "email",
    "phone",
    "mainOfficeCountry",
    "mainOfficeProvince",
    "mainOfficeCityMunicipality",
    "mainOfficeAddress",
    "businessLatitude",
    "businessLongitude",
    "businessBarangay",
    "businessStreetAddress",
  ],
  1: [
    "businessArea",
    "totalFloorArea",
    "totalEmployees",
    "maleEmployees",
    "femaleEmployees",
    "employeesWithinMunicipality",
    "deliveryVanTruck",
    "deliveryMotorcycle",
    "businessActivity",
    "lineOfBusiness",
    "assetSize",
  ],
};

const FIELD_NAVIGATION_MAP: Record<NewApplicationFieldKey, FieldNavigationConfig> = {
  email: { step: 0, label: "Email Address", selector: '[data-field-key="email"]' },
  assetSize: {
    step: 1,
    label: "Capital Investment / Asset Size",
    selector: '[data-field-key="assetSize"]',
  },
  barangay: { step: 0, label: "Business Barangay", selector: '[data-field-key="businessBarangay"]' },
  businessBarangay: {
    step: 0,
    label: "Business Barangay",
    selector: '[data-field-key="businessBarangay"]',
  },
  totalEmployees: {
    step: 1,
    label: "Total Employees",
    selector: '[data-field-key="totalEmployees"]',
  },
  businessName: { step: 0, label: "Business Name", selector: '[data-field-key="businessName"]' },
  registrationNumber: {
    step: 0,
    label: "Registration Number",
    selector: '[data-field-key="registrationNumber"]',
  },
  tin: { step: 0, label: "TIN", selector: '[data-field-key="tin"]' },
  businessAddress: { step: 0, label: "Business Address", selector: '[data-field-key="businessAddress"]' },
  businessLatitude: {
    step: 0,
    label: "Business Location Pin",
    selector: '[data-field-key="businessLatitude"]',
  },
  businessLongitude: {
    step: 0,
    label: "Business Location Pin",
    selector: '[data-field-key="businessLongitude"]',
  },
  capitalInvestment: {
    step: 1,
    label: "Capital Investment / Asset Size",
    selector: '[data-field-key="capitalInvestment"]',
  },
  paymentFrequency: {
    step: 4,
    label: "Mode of Payment",
    selector: '[data-field-key="errorSummary"]',
  },
  lineOfBusiness: { step: 1, label: "Line of Business", selector: '[data-field-key="lineOfBusiness"]' },
  businessActivity: {
    step: 1,
    label: "Business Activity",
    selector: '[data-field-key="businessActivity"]',
  },
  requiredDocuments: {
    step: 2,
    label: "Required Documents",
    selector: '[data-field-key="requiredDocuments"]',
  },
  businessType: { step: 0, label: "Business Type", selector: '[data-field-key="businessType"]' },
  tradeName: { step: 0, label: "Trade Name", selector: '[data-field-key="tradeName"]' },
  ownerName: { step: 0, label: "Owner / President Name", selector: '[data-field-key="ownerFirstName"]' },
  ownerFirstName: { step: 0, label: "Owner / President First Name", selector: '[data-field-key="ownerFirstName"]' },
  ownerMiddleName: { step: 0, label: "Owner / President Middle Name", selector: '[data-field-key="ownerMiddleName"]' },
  ownerSurname: { step: 0, label: "Owner / President Surname", selector: '[data-field-key="ownerSurname"]' },
  ownerSuffix: { step: 0, label: "Owner / President Suffix", selector: '[data-field-key="ownerSuffix"]' },
  birthDate: { step: 0, label: "Birthdate", selector: '[data-field-key="ownerFirstName"]' },
  ownerAge: { step: 0, label: "Owner Age", selector: '[data-field-key="ownerFirstName"]' },
  sex: { step: 0, label: "Sex", selector: '[data-field-key="sex"]' },
  nationality: { step: 0, label: "Nationality", selector: '[data-field-key="nationality"]' },
  phone: { step: 0, label: "Mobile Number", selector: '[data-field-key="phone"]' },
  telephone: { step: 0, label: "Telephone Number", selector: '[data-field-key="telephone"]' },
  corporationNationality: {
    step: 0,
    label: "Corporation Nationality",
    selector: '[data-field-key="corporationNationality"]',
  },
  country: { step: 0, label: "Country", selector: '[data-field-key="businessAddress"]' },
  countryCode: { step: 0, label: "Country Code", selector: '[data-field-key="businessAddress"]' },
  province: { step: 0, label: "Province", selector: '[data-field-key="businessAddress"]' },
  provinceCode: { step: 0, label: "Province", selector: '[data-field-key="businessAddress"]' },
  cityMunicipality: { step: 0, label: "City / Municipality", selector: '[data-field-key="businessAddress"]' },
  streetAddress: {
    step: 0,
    label: "Business Street / Purok / Building / Unit",
    selector: '[data-field-key="businessStreetAddress"]',
  },
  mainOfficeCountry: { step: 0, label: "Main Office Country", selector: '[data-field-key="mainOfficeCountry"]' },
  mainOfficeCountryCode: { step: 0, label: "Main Office Country", selector: '[data-field-key="mainOfficeCountry"]' },
  mainOfficeProvince: {
    step: 0,
    label: "Main Office Province / State",
    selector: '[data-field-key="mainOfficeProvince"]',
  },
  mainOfficeProvinceCode: {
    step: 0,
    label: "Main Office Province / State",
    selector: '[data-field-key="mainOfficeProvince"]',
  },
  mainOfficeCityMunicipality: {
    step: 0,
    label: "Main Office City / Municipality",
    selector: '[data-field-key="mainOfficeCityMunicipality"]',
  },
  mainOfficeStreetAddress: {
    step: 0,
    label: "Main Office Street / Address Line",
    selector: '[data-field-key="mainOfficeStreetAddress"]',
  },
  mainOfficeBarangay: {
    step: 0,
    label: "Main Office Barangay",
    selector: '[data-field-key="mainOfficeBarangay"]',
  },
  mainOfficeAddress: {
    step: 0,
    label: "Main Office Address",
    selector: '[data-field-key="mainOfficeAddress"]',
  },
  businessStreetAddress: {
    step: 0,
    label: "Business Street / Purok / Building / Unit",
    selector: '[data-field-key="businessStreetAddress"]',
  },
  businessArea: { step: 1, label: "Business Area", selector: '[data-field-key="businessArea"]' },
  totalFloorArea: { step: 1, label: "Total Floor Area", selector: '[data-field-key="totalFloorArea"]' },
  maleEmployees: { step: 1, label: "Male Employees", selector: '[data-field-key="maleEmployees"]' },
  femaleEmployees: { step: 1, label: "Female Employees", selector: '[data-field-key="femaleEmployees"]' },
  employeesWithinMunicipality: {
    step: 1,
    label: "Employees Residing within Municipality",
    selector: '[data-field-key="employeesWithinMunicipality"]',
  },
  deliveryVanTruck: { step: 1, label: "Van / Truck", selector: '[data-field-key="deliveryVanTruck"]' },
  deliveryMotorcycle: { step: 1, label: "Motorcycle", selector: '[data-field-key="deliveryMotorcycle"]' },
  deliveryVehicles: { step: 1, label: "Delivery Vehicles", selector: '[data-field-key="deliveryVanTruck"]' },
  propertyOwnership: { step: 1, label: "Property Ownership", selector: '[data-field-key="propertyOwnership"]' },
  taxDeclarationNumber: {
    step: 1,
    label: "Tax Declaration Number",
    selector: '[data-field-key="taxDeclarationNumber"]',
  },
  propertyIdentificationNumber: {
    step: 1,
    label: "Property Identification Number",
    selector: '[data-field-key="propertyIdentificationNumber"]',
  },
  orNumber: {
    step: 1,
    label: "OR Number",
    selector: '[data-field-key="orNumber"]',
  },
  taxIncentives: { step: 1, label: "Tax Incentives", selector: '[data-field-key="taxIncentives"]' },
  hasTaxIncentives: {
    step: 1,
    label: "Tax Incentives from Government Entity",
    selector: '[data-field-key="hasTaxIncentives"]',
  },
  mainOfficeZipCode: {
    step: 0,
    label: "Main Office Zip Code",
    selector: '[data-field-key="mainOfficeZipCode"]',
  },
  businessZipCode: {
    step: 0,
    label: "Business Zip Code",
    selector: '[data-field-key="businessZipCode"]',
  },
  isMarket: { step: 1, label: "Market Business", selector: '[data-field-key="isMarket"]' },
  isAgriculture: { step: 1, label: "Agriculture-related Business", selector: '[data-field-key="isAgriculture"]' },
  isLiquorOrTobacco: {
    step: 1,
    label: "Liquor/Tobacco Business",
    selector: '[data-field-key="isLiquorOrTobacco"]',
  },
  sameAsMainOffice: { step: 0, label: "Same as Main Office", selector: '[data-field-key="mainOfficeAddress"]' },
  grossProfit: { step: 1, label: "Gross Profit", selector: '[data-field-key="assetSize"]' },
  businessOperationType: { step: 0, label: "Business Office Type", selector: '[data-field-key="businessAddress"]' },
  closureLineOfBusiness: { step: 1, label: "Line of Business", selector: '[data-field-key="lineOfBusiness"]' },
  closureBusinessActivity: {
    step: 1,
    label: "Business Activity",
    selector: '[data-field-key="businessActivity"]',
  },
  closureLastDateOfOperation: {
    step: 1,
    label: "Last Date of Operation",
    selector: '[data-field-key="assetSize"]',
  },
  closureReason: { step: 1, label: "Reason for Closure", selector: '[data-field-key="assetSize"]' },
  closureRemarks: { step: 1, label: "Closure Remarks", selector: '[data-field-key="assetSize"]' },
};

function extractFieldKey(raw: string): string {
  const trimmed = raw.trim();
  const key = trimmed.split(/[\s(]/)[0] ?? trimmed;
  return key.trim();
}

function normalizeBusinessInfo(next: BusinessInfo): BusinessInfo {
  return normalizeBusinessInfoRules(next);
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
  if (/^\d+(?:\.0+)?$/.test(compact)) {
    return String(Number(compact));
  }
  return value.trim();
}

function resolveSelectedBusinessBarangay(info: BusinessInfo): string {
  return resolveBusinessBarangayFromFormState({
    barangay: info.barangay,
    businessBarangay: info.businessBarangay,
    sameAsMainOffice: info.sameAsMainOffice,
    mainOfficeCountry: info.mainOfficeCountry,
    mainOfficeCountryCode: info.mainOfficeCountryCode,
    mainOfficeProvince: info.mainOfficeProvince,
    mainOfficeCityMunicipality: info.mainOfficeCityMunicipality,
    mainOfficeBarangay: info.mainOfficeBarangay,
  });
}

function isMissingRequiredValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "number") return !Number.isFinite(value);
  return false;
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
  mode: PersistMode;
  info: BusinessInfo;
  documents: ApplicationDocumentInput[];
}): SaveApplicationInput {
  const normalizedInfo = normalizeBusinessInfo(params.info);
  const resolvedBarangay = resolveSelectedBusinessBarangay(normalizedInfo);
  const resolvedAssetSize = (normalizedInfo.assetSize.trim() || normalizedInfo.capitalInvestment?.trim() || "").trim();
  const resolvedTotalEmployees = normalizeEmployeeCountInput(normalizedInfo.totalEmployees);

  return {
    applicationId: params.applicationId,
    applicationType: "NEW",
    mode: params.mode,
    formData: normalizeBusinessInfo({
      ...normalizedInfo,
      barangay: resolvedBarangay,
      businessBarangay: resolvedBarangay,
      assetSize: resolvedAssetSize,
      totalEmployees: resolvedTotalEmployees,
    }),
    documents: sanitizeDocumentMetadata(params.documents),
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

function FieldCard({
  label,
  value,
  onChange,
  onBlur,
  helperText,
  error,
  disabled,
  fieldKey,
  numericKind,
  placeholder,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  fieldKey?: keyof BusinessInfo;
  numericKind?: "integer" | "decimal";
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <FormField label={label} required={required} hint={helperText} error={error}>
      <input
        data-field-key={fieldKey}
        aria-label={label}
        placeholder={placeholder}
        className={applicantFormControlClass}
        value={value}
        disabled={disabled}
        inputMode={numericKind === "integer" ? "numeric" : numericKind === "decimal" ? "decimal" : undefined}
        onBlur={onBlur}
        onChange={(event) => {
          const raw = event.target.value;
          const next =
            numericKind === "integer"
              ? sanitizeIntegerInput(raw)
              : numericKind === "decimal"
                ? sanitizeDecimalInput(raw)
                : raw;
          onChange(next);
        }}
      />
    </FormField>
  );
}

const READ_ONLY_LOCKED_FIELDS: Array<keyof BusinessInfo> = [
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
  "ownerAge",
  "sex",
  "nationality",
  "email",
  "phone",
  "mainOfficeCountry",
  "mainOfficeCountryCode",
  "mainOfficeProvince",
  "mainOfficeProvinceCode",
  "mainOfficeCityMunicipality",
  "mainOfficeStreetAddress",
  "mainOfficeBarangay",
  "mainOfficeAddress",
  "businessAddress",
  "businessBarangay",
  "businessStreetAddress",
  "businessLatitude",
  "businessLongitude",
  "businessArea",
  "totalFloorArea",
  "totalEmployees",
  "maleEmployees",
  "femaleEmployees",
  "employeesWithinMunicipality",
  "deliveryVanTruck",
  "deliveryMotorcycle",
  "businessActivity",
  "lineOfBusiness",
  "assetSize",
  "propertyOwnership",
  "taxDeclarationNumber",
  "propertyIdentificationNumber",
  "orNumber",
  "capitalInvestment",
  "paymentFrequency",
  "isMarket",
  "isAgriculture",
  "isLiquorOrTobacco",
];

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

function buildSubmitValidationMessage(params: { missingFields: string[]; missingDocuments: string[] }): string {
  const parts: string[] = [];

  if (params.missingFields.length > 0) {
    parts.push(`Missing required fields: ${params.missingFields.join(", ")}`);
  }

  if (params.missingDocuments.length > 0) {
    parts.push(`Missing required documents: ${params.missingDocuments.join(", ")}`);
  }

  return parts.join(" ");
}

export function NewApplicationForm() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("applicationId") || searchParams.get("editId");
  const lineOfBusinessOptions = useLineOfBusinessOptions();

  const [step, setStep] = useState(0);
  const [info, setInfo] = useState<BusinessInfo>(defaultBusinessInfo);
  const [uploadedDocuments, setUploadedDocuments] = useState<Record<string, ApplicationDocumentInput>>({});
  const [pendingDocuments, setPendingDocuments] = useState<Record<string, File>>({});
  const [pendingDocumentPreviews, setPendingDocumentPreviews] = useState<Record<string, string>>({});
  const [applicationId, setApplicationId] = useState<string | undefined>(editId ?? undefined);
  const [draftLoading, setDraftLoading] = useState(Boolean(editId));
  const [statusMessage, setStatusMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showVerificationPrint, setShowVerificationPrint] = useState(false);
  const [missingDocNames, setMissingDocNames] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof BusinessInfo, string>>>({});
  const [errorSummaryItems, setErrorSummaryItems] = useState<string[]>([]);
  const [existingApplicationAccess, setExistingApplicationAccess] = useState<{
    canEdit: boolean;
    status: string;
  } | null>(null);

  // Guard: ensures loadDraft cannot run concurrently for the same applicationId.
  const draftLoadingRef = useRef(false);
  const pendingDocumentPreviewsRef = useRef<Record<string, string>>({});

  const clearErrorSummary = useCallback(() => {
    setErrorSummaryItems([]);
  }, []);

  const getFieldConfig = useCallback((rawFieldKey: string): FieldNavigationConfig => {
    const extractedKey = extractFieldKey(rawFieldKey);
    const normalizedKey = extractedKey in FIELD_NAVIGATION_MAP ? (extractedKey as NewApplicationFieldKey) : null;
    if (normalizedKey) {
      return FIELD_NAVIGATION_MAP[normalizedKey];
    }

    return {
      step: 0,
      label: FIELD_LABELS[extractedKey as keyof BusinessInfo] ?? extractedKey,
      selector: `[data-field-key="${extractedKey}"]`,
    };
  }, []);

  const focusFieldByConfig = useCallback((config: FieldNavigationConfig) => {
    window.setTimeout(() => {
      const el = document.querySelector(config.selector) as HTMLElement | null;
      if (!el) return;

      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof el.focus === "function") {
        el.focus({ preventScroll: true });
      } else {
        const focusable = el.querySelector("input, select, textarea, button") as HTMLElement | null;
        focusable?.focus({ preventScroll: true });
      }
    }, 120);
  }, []);

  const navigateToFirstMissingField = useCallback(
    (missingFieldKeys: string[], missingDocuments: string[]) => {
      const firstKey = missingFieldKeys[0] ?? (missingDocuments.length > 0 ? "requiredDocuments" : null);
      if (!firstKey) return;

      const config = getFieldConfig(firstKey);
      if (process.env.NODE_ENV === "development") {
        console.info("[NewApplicationForm] first-missing-field", {
          fieldKey: firstKey,
          mappedStep: config.step,
          mappedLabel: config.label,
        });
      }

      setStep(config.step);
      focusFieldByConfig(config);
    },
    [focusFieldByConfig, getFieldConfig]
  );

  const isReadOnly = Boolean(editId && existingApplicationAccess && !existingApplicationAccess.canEdit);
  const isResubmission = isReturnedCorrectionResubmission({
    editId,
    applicationStatus: existingApplicationAccess?.status,
  });
  const lockInteractivityClass = isReadOnly ? "pointer-events-none" : "";

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

  const requiredDocs = useMemo(
    () =>
      resolveRequiredDocuments({
        applicationType: "NEW",
        formData: info,
      }),
    [info]
  );

  const getUploadedDocumentForRequiredName = (requiredName: string) =>
    Object.values(uploadedDocuments).find(
      (doc) => normalizeDocumentName(doc.documentName) === normalizeDocumentName(requiredName)
    );

  const uploadedRequiredCount = requiredDocs.filter((doc) => getUploadedDocumentForRequiredName(doc)).length;

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
    let active = true;

    async function loadExistingApplication() {
      if (!editId) {
        setDraftLoading(false);
        return;
      }
      setDraftLoading(true);
      // Prevent concurrent loads for the same editId.
      if (draftLoadingRef.current) return;
      draftLoadingRef.current = true;

      const response = await fetch(`/api/applicant/applications/${editId}`, { cache: "no-store" });
      const data = (await parseApiResponseSafely(response)) as {
        application?: {
          id: string;
          status: string;
          canEdit: boolean;
          formData: BusinessInfo;
          documents: ApplicationDocumentInput[];
        };
      };

      if (!active || !response.ok || !data.application) {
        draftLoadingRef.current = false;
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
      setUploadedDocuments(
        data.application.documents.reduce<Record<string, ApplicationDocumentInput>>((acc, doc) => {
          acc[doc.documentName] = doc;
          return acc;
        }, {})
      );
      setPendingDocuments({});
      setPendingDocumentPreviews({});
      draftLoadingRef.current = false;
      setDraftLoading(false);
    }

    void loadExistingApplication();
    return () => {
      active = false;
    };
  }, [editId]);

  const applyInfoChange = useCallback((next: BusinessInfo) => {
    if (isReadOnly) return;
    const normalizedNext = normalizeBusinessInfo(next);
    const nextInfo = {
      ...normalizedNext,
      // Keep raw typed values while editing — live .trim() blocks multi-word input
      // (trailing spaces are stripped before the next word can be typed).
      businessName: next.businessName,
      tradeName: next.tradeName,
      ownerName: next.ownerName,
      ownerFirstName: next.ownerFirstName,
      ownerMiddleName: next.ownerMiddleName,
      ownerSurname: next.ownerSurname,
      ownerSuffix: next.ownerSuffix,
      businessStreetAddress: next.businessStreetAddress,
      streetAddress: next.streetAddress,
      mainOfficeStreetAddress: next.mainOfficeStreetAddress,
      mainOfficeBarangay: next.mainOfficeBarangay,
      barangay: next.barangay,
      lineOfBusiness: next.lineOfBusiness,
      taxIncentives: next.taxIncentives,
      taxDeclarationNumber: next.taxDeclarationNumber,
      propertyIdentificationNumber: next.propertyIdentificationNumber,
      orNumber: next.orNumber,
      phone: sanitizePhMobileInput(next.phone ?? ""),
    };

    setInfo(nextInfo);
    if (
      typeof nextInfo.businessLatitude === "number" &&
      typeof nextInfo.businessLongitude === "number" &&
      isWithinEbMagalona(nextInfo.businessLatitude, nextInfo.businessLongitude)
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
  }, [isReadOnly]);

  if (editId && draftLoading) {
    return (
      <SectionCard title="Loading saved draft" description="Restoring your saved application values.">
        <LoadingState message="Loading draft…" compact />
      </SectionCard>
    );
  }

  function validateFieldOnBlur(field: keyof BusinessInfo) {
    if (isReadOnly) return;
    const normalizedInfo = normalizeBusinessInfo(info);
    const nextErrors = { ...fieldErrors };
    const value = normalizedInfo[field];
    const philippinesMainOffice = requiresBarangay(normalizedInfo);
    let isRequired = (STEP_REQUIRED_FIELDS[0] ?? []).includes(field) || (STEP_REQUIRED_FIELDS[1] ?? []).includes(field);

    if (field === "mainOfficeBarangay") {
      isRequired = philippinesMainOffice;
    }

    if (field === "mainOfficeStreetAddress") {
      isRequired = !philippinesMainOffice;
    }

    if (isRequired && isMissingRequiredValue(value)) {
      if (field === "mainOfficeAddress") {
        nextErrors[field] = philippinesMainOffice
          ? "Fill in Country, Province, City/Municipality, and Barangay to auto-generate."
          : "Fill in Country, Province, City/Municipality, and Street Address to auto-generate.";
      } else if (field === "mainOfficeBarangay") {
        nextErrors[field] = "Select a barangay for the Philippine main office address.";
      } else if (field === "mainOfficeStreetAddress") {
        nextErrors[field] = "Street Address is required for non-Philippine main office addresses.";
      } else {
        nextErrors[field] = `${FIELD_LABELS[field] ?? field} is required.`;
      }
    } else if (nextErrors[field] !== "This already exist") {
      delete nextErrors[field];
    }

    if (field === "phone") {
      const phoneError = phMobileFieldError(normalizedInfo.phone);
      if (phoneError) nextErrors.phone = phoneError;
      else if (nextErrors.phone !== "This already exist") delete nextErrors.phone;
    }

    if (field === "registrationNumber" && normalizedInfo.registrationNumber.trim().length > 0) {
      const valid = validateBusinessIdentityFormats(normalizedInfo).registrationNumber;
      if (!valid) nextErrors.registrationNumber = "Wrong Format";
    }

    if (field === "tin" && normalizedInfo.tin.trim().length > 0) {
      const valid = validateBusinessIdentityFormats(normalizedInfo).tin;
      if (!valid) nextErrors.tin = "Wrong Format";
    }

    if (field === "mainOfficeBarangay") {
      if (philippinesMainOffice && !normalizedInfo.mainOfficeBarangay?.trim()) {
        nextErrors.mainOfficeBarangay = "Select a barangay for the Philippine main office address.";
      } else if (nextErrors.mainOfficeBarangay !== "This already exist") {
        delete nextErrors.mainOfficeBarangay;
      }
    }

    if (field === "mainOfficeStreetAddress") {
      if (!philippinesMainOffice && !normalizedInfo.mainOfficeStreetAddress?.trim()) {
        nextErrors.mainOfficeStreetAddress = "Street Address is required for non-Philippine main office addresses.";
      } else if (nextErrors.mainOfficeStreetAddress !== "This already exist") {
        delete nextErrors.mainOfficeStreetAddress;
      }
    }

    if (field === "country" || field === "countryCode" || field === "province" || field === "cityMunicipality") {
      const fixedAddressErrors = validateFixedEbMagalonaAddress(normalizedInfo);
      if (fixedAddressErrors[field]) {
        nextErrors[field] = fixedAddressErrors[field] as string;
      }
    }

    if (field === "birthDate") {
      // Birthdate field removed from New application form per Phase 1.
    }

    if (field === "capitalInvestment") {
      const capitalRaw = normalizedInfo.capitalInvestment?.trim() ?? "";
      if (!capitalRaw) {
        nextErrors.capitalInvestment = "Capital Investment is required.";
      } else if (parsePositiveAmount(capitalRaw) == null) {
        nextErrors.capitalInvestment = "Capital Investment must be a positive amount.";
      } else if (nextErrors.capitalInvestment !== "This already exist") {
        delete nextErrors.capitalInvestment;
      }
    }

    if (field === "nationality" && normalizedInfo.nationality.trim().length === 0) {
      nextErrors.nationality = "Nationality is required.";
    }

    if (field === "taxDeclarationNumber") {
      if (normalizedInfo.propertyOwnership === "Owned" && normalizedInfo.taxDeclarationNumber.trim().length === 0) {
        nextErrors.taxDeclarationNumber = "Tax Declaration Number is required for owned properties.";
      } else {
        delete nextErrors.taxDeclarationNumber;
      }
    }

    if (field === "propertyIdentificationNumber") {
      delete nextErrors.propertyIdentificationNumber;
    }

    if (field === "orNumber") {
      delete nextErrors.orNumber;
    }

    setFieldErrors(nextErrors);
  }

  function getStepValidationErrors(
    currentStep: number,
    normalizedInfo: BusinessInfo
  ): Partial<Record<keyof BusinessInfo, string>> {
    const requiredFields = STEP_REQUIRED_FIELDS[currentStep] ?? [];
    const nextErrors: Partial<Record<keyof BusinessInfo, string>> = {};

    for (const key of requiredFields) {
      const value = normalizedInfo[key];
      if (key === "phone") {
        const phoneError = phMobileFieldError(normalizedInfo.phone);
        if (phoneError) nextErrors.phone = phoneError;
        continue;
      }
      if (isMissingRequiredValue(value)) {
        if (key === "mainOfficeAddress") {
          nextErrors[key] = requiresBarangay(normalizedInfo)
            ? "Fill in Country, Province, City/Municipality, and Barangay to auto-generate."
            : "Fill in Country, Province, City/Municipality, and Street Address to auto-generate.";
        } else {
          nextErrors[key] = `${FIELD_LABELS[key] ?? key} is required.`;
        }
      }
    }

    if (requiresBarangay(normalizedInfo) && normalizedInfo.mainOfficeBarangay?.trim().length === 0) {
      nextErrors.mainOfficeBarangay = "Barangay is required for Philippine main office addresses.";
    }

    if (normalizedInfo.mainOfficeCountry && !isPhilippinesCountry(normalizedInfo.mainOfficeCountry, normalizedInfo.mainOfficeCountryCode)) {
      if (normalizedInfo.mainOfficeStreetAddress?.trim().length === 0) {
        nextErrors.mainOfficeStreetAddress = "Street Address is required for non-Philippine main office addresses.";
      }
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

    if (currentStep === 1 && normalizedInfo.propertyOwnership === "Owned") {
      if (normalizedInfo.taxDeclarationNumber.trim().length === 0 && normalizedInfo.propertyIdentificationNumber.trim().length === 0) {
        nextErrors.taxDeclarationNumber = "Tax Declaration Number is required for owned properties.";
      }
    }

    // Birthdate validation removed from New application form per Phase 1.

    if (currentStep === 1) {
      const capitalRaw = normalizedInfo.capitalInvestment?.trim() ?? "";
      if (!capitalRaw) {
        nextErrors.capitalInvestment = "Capital Investment is required.";
      } else if (parsePositiveAmount(capitalRaw) == null) {
        nextErrors.capitalInvestment = "Capital Investment must be a positive amount.";
      } else if (nextErrors.capitalInvestment !== "This already exist") {
        delete nextErrors.capitalInvestment;
      }
    }

    return nextErrors;
  }


  function next() {
    if (isReadOnly) return;
    if (step === 0 || step === 1) {
      const nextErrors = getStepValidationErrors(step, normalizeBusinessInfo(info));
      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        setErrorSummaryItems(
          Array.from(new Set(Object.keys(nextErrors).map((rawKey) => getFieldConfig(rawKey).label)))
        );
        navigateToFirstMissingField(Object.keys(nextErrors), []);
        setStatusMessage({
          kind: "error",
          text: "Complete required fields before moving to the next step.",
        });
        return;
      }
    } else if (step === 2) {
      const uploadedKeys = [
        ...Object.values(uploadedDocuments).map((d) => d.documentName),
      ];
      const missing = getMissingRequiredDocuments(requiredDocs, uploadedKeys);
      if (missing.length > 0) {
        setMissingDocNames(missing);
        setErrorSummaryItems(["Required Documents"]);
        navigateToFirstMissingField([], missing);
        setStatusMessage({
          kind: "error",
          text: "Upload all required documents before proceeding.",
        });
        return;
      }
      setMissingDocNames([]);
      clearErrorSummary();
    }

    setStatusMessage(null);
    clearErrorSummary();
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function back() {
    if (isReadOnly) return;
    setStep((current) => Math.max(current - 1, 0));
  }

  function handleFinalSubmit() {
    if (isResubmission && !window.confirm(getResubmissionConfirmMessage("NEW"))) {
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
    setFieldErrors({});
    clearErrorSummary();

    const normalizedInfo = normalizeBusinessInfo(info);
    const identityFormats = validateBusinessIdentityFormats(normalizedInfo);
    const identityErrors: Partial<Record<keyof BusinessInfo, string>> = {};

    if (normalizedInfo.registrationNumber.trim().length > 0 && !identityFormats.registrationNumber) {
      identityErrors.registrationNumber = "Wrong Format";
    }

    if (normalizedInfo.tin.trim().length > 0 && !identityFormats.tin) {
      identityErrors.tin = "Wrong Format";
    }

    if (Object.keys(identityErrors).length > 0) {
      setFieldErrors(identityErrors);
      setErrorSummaryItems(
        Object.keys(identityErrors).map((rawKey) => getFieldConfig(rawKey).label)
      );
      navigateToFirstMissingField(Object.keys(identityErrors), []);
      setStatusMessage({ kind: "error", text: "Wrong Format" });
      setSubmitting(false);
      return null;
    }

    if (mode === "SUBMIT") {
      const step0Errors = getStepValidationErrors(0, normalizedInfo);
      const step1Errors = getStepValidationErrors(1, normalizedInfo);
      const submitFieldErrors: Partial<Record<keyof BusinessInfo, string>> = {
        ...step0Errors,
        ...step1Errors,
      };

      const missingDocuments = getMissingRequiredDocuments(requiredDocs, [
        ...Object.values(uploadedDocuments).map((doc) => doc.documentName),
        ...Object.keys(pendingDocuments),
      ]);

      const submitEmail = normalizedInfo.email.trim();
      const submitBarangay = resolveSelectedBusinessBarangay(normalizedInfo);
      const submitAssetSize = (normalizedInfo.assetSize.trim() || normalizedInfo.capitalInvestment?.trim() || "").trim();
      const submitTotalEmployees = normalizeEmployeeCountInput(normalizedInfo.totalEmployees);

      if (!submitEmail) {
        submitFieldErrors.email = "Email is required.";
      }

      if (!submitBarangay) {
        submitFieldErrors.businessBarangay = "Business Barangay is required.";
      }

      if (!submitAssetSize) {
        submitFieldErrors.assetSize = "Asset Size is required.";
      } else if (parseNonNegativeAmount(submitAssetSize) == null) {
        submitFieldErrors.assetSize = "Asset Size must be a non-negative amount.";
      }

      if (!submitTotalEmployees) {
        submitFieldErrors.totalEmployees = "Total Employees is required.";
      } else {
        const parsedEmployees = Number(submitTotalEmployees);
        if (!Number.isInteger(parsedEmployees) || parsedEmployees < 0) {
          submitFieldErrors.totalEmployees = "Total Employees must be a non-negative integer.";
        }
      }

      if (normalizedInfo.hasTaxIncentives !== "YES" && normalizedInfo.hasTaxIncentives !== "NO") {
        submitFieldErrors.hasTaxIncentives = "Please select Yes or No for tax incentives.";
      } else if (normalizedInfo.hasTaxIncentives === "YES" && !normalizedInfo.taxIncentives.trim()) {
        submitFieldErrors.taxIncentives = "Please describe the tax incentive.";
      }

      if (Object.keys(submitFieldErrors).length > 0 || missingDocuments.length > 0) {
        const missingFieldKeys = Object.keys(submitFieldErrors);
        const summaryLabels = [
          ...missingFieldKeys.map((rawKey) => getFieldConfig(rawKey).label),
          ...(missingDocuments.length > 0 ? ["Required Documents"] : []),
        ];

        if (process.env.NODE_ENV === "development") {
          const firstKey = missingFieldKeys[0] ?? (missingDocuments.length > 0 ? "requiredDocuments" : null);
          const mappedStep = firstKey ? getFieldConfig(firstKey).step : null;
          console.info("[NewApplicationForm] pre-submit-validation", {
            firstMissingFieldKey: firstKey,
            mappedStep,
            missingFieldLabels: Array.from(new Set(summaryLabels)),
          });
        }

        setFieldErrors(submitFieldErrors);
        setMissingDocNames(missingDocuments);
        setErrorSummaryItems(Array.from(new Set(summaryLabels)));
        navigateToFirstMissingField(missingFieldKeys, missingDocuments);
        setStatusMessage({
          kind: "error",
          text: "Complete the highlighted required fields and documents before submitting.",
        });
        setSubmitting(false);
        return null;
      }

      setMissingDocNames([]);
    }

    const payload = buildCleanPayload({
      applicationId,
      mode,
      info,
      documents: Object.values(uploadedDocuments),
    });

    if (process.env.NODE_ENV === "development") {
      console.info("[NewApplicationForm] submit-nationality", {
        selectedNationality: normalizeBusinessInfo(info).nationality,
        payloadNationality: payload.formData.nationality,
        applicationType: payload.applicationType,
      });
    }

    const hasPendingFiles = Object.keys(pendingDocuments).length > 0;
    if (mode === "SUBMIT" && hasPendingFiles) {
      const totalSizeError = validateTotalPendingUploadSize(Object.values(pendingDocuments));
      if (totalSizeError) {
        setStatusMessage({
          kind: "error",
          text: totalSizeError,
        });
        setSubmitting(false);
        return;
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
      duplicateField?: string;
      rawResponse?: string;
      message?: string;
      detail?: { missingFields?: string[]; missingDocuments?: string[] };
      missingFieldKeys?: string[];
      fieldErrors?: Record<string, string>;
      missingDocuments?: string[];
    };

    setSubmitting(false);

    if (!response.ok || !data.application) {
      if (process.env.NODE_ENV === "development") {
        console.info("[NewApplicationForm] backend-submit-400", {
          status: response.status,
          body: data,
        });
      }

      const backendMissingFieldKeys = Array.from(
        new Set(
          [
            ...(Array.isArray(data.missingFieldKeys) ? data.missingFieldKeys : []),
            ...((data.detail?.missingFields ?? []).map(extractFieldKey)),
            ...Object.keys(data.fieldErrors ?? {}),
          ]
            .filter((key): key is string => typeof key === "string" && key.trim().length > 0)
            .map((key) => extractFieldKey(key))
        )
      );
      const backendMissingDocuments = Array.isArray(data.missingDocuments)
        ? data.missingDocuments
        : Array.isArray(data.detail?.missingDocuments)
          ? data.detail.missingDocuments
          : [];

      const mappedBackendFieldErrors: Partial<Record<keyof BusinessInfo, string>> = {};
      for (const rawKey of backendMissingFieldKeys) {
        const targetKey = rawKey === "barangay" ? "businessBarangay" : rawKey;
        if (targetKey in FIELD_LABELS) {
          mappedBackendFieldErrors[targetKey as keyof BusinessInfo] =
            data.fieldErrors?.[rawKey] ?? `${getFieldConfig(rawKey).label} is required.`;
        }
      }

      if (data.duplicateField === "registrationNumber" || data.duplicateField === "tin") {
        mappedBackendFieldErrors[data.duplicateField] = "This already exist";
      }

      const backendValidationMessage =
        backendMissingFieldKeys.length > 0 || backendMissingDocuments.length > 0
          ? buildSubmitValidationMessage({
              missingFields: backendMissingFieldKeys.map((rawKey) => getFieldConfig(rawKey).label),
              missingDocuments: backendMissingDocuments,
            })
          : null;

      if (Object.keys(mappedBackendFieldErrors).length > 0 || backendMissingDocuments.length > 0) {
        const summaryLabels = [
          ...backendMissingFieldKeys.map((rawKey) => getFieldConfig(rawKey).label),
          ...(backendMissingDocuments.length > 0 ? ["Required Documents"] : []),
        ];
        setFieldErrors((current) => ({ ...current, ...mappedBackendFieldErrors }));
        setMissingDocNames(backendMissingDocuments);
        setErrorSummaryItems(Array.from(new Set(summaryLabels)));
        navigateToFirstMissingField(backendMissingFieldKeys, backendMissingDocuments);
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
          backendValidationMessage ??
          data.error ??
          data.message ??
          `Unable to save application (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}).${detail}`,
      });
      setSubmitting(false);
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
        text: getApplicationSubmitSuccessMessage("NEW", isResubmission, data.application.applicationNumber),
      });
      return data.application.id;
    }

    // Draft save: keep uploaded documents from the server so reopen doesn't require re-upload.
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
    setSubmitting(false);
    setStatusMessage({
      kind: "success",
      text: `Draft ${data.application.applicationNumber} saved successfully. Uploaded documents are kept with this draft.`,
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
    setMissingDocNames((current) =>
      current.filter(
        (m) => normalizeDocumentName(m) !== normalizeDocumentName(documentName)
      )
    );
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

      {errorSummaryItems.length > 0 ? (
        <div className={applicantErrorPanelClass} data-field-key="errorSummary">
          <p className="font-semibold">Please complete the following fields:</p>
          <ul className="mt-2 list-disc pl-5">
            {errorSummaryItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {step === steps.length - 1 ? (
            <button
              type="button"
              onClick={back}
              className={`${actionButtonStyles("secondary", "sm")} mt-3`}
            >
              Back
            </button>
          ) : null}
        </div>
      ) : null}

      {statusMessage ? (
        <InfoBanner
          title={statusMessage.kind === "success" ? "Application update" : "Application issue"}
          description={statusMessage.text}
          variant={statusMessage.kind === "success" ? "success" : "danger"}
        />
      ) : null}

      {editId && existingApplicationAccess?.status === "Returned for Correction" ? (
        <InfoBanner
          title="Correction Mode"
          description="This application was returned for correction. You may edit the required fields and resubmit."
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
          title="Business Information"
          description="Fields marked with an asterisk are required for draft saving and final submission."
        >
          <div className={lockInteractivityClass}>
          <BusinessInformationFields
            value={info}
            onChange={applyInfoChange}
            applicationType="NEW"
            onFieldBlur={validateFieldOnBlur}
            onClearFieldError={(field) => {
              setFieldErrors((current) => {
                if (!current[field]) return current;
                const nextErrors = { ...current };
                delete nextErrors[field];
                return nextErrors;
              });
            }}
            lockedFields={isReadOnly ? READ_ONLY_LOCKED_FIELDS : []}
            fieldErrors={fieldErrors}
            enableCascadingAddress
          />
          <div className="mt-4" />
          </div>
        </SectionCard>
      ) : null}

      {step === 1 ? (
        <div className={`space-y-4 ${lockInteractivityClass}`}>
          <InfoBanner
            title="Business operation details"
            description="Use current and accurate operating data to keep downstream assessment review consistent."
            variant="info"
          />
          <SectionCard
            title="Operations and Staffing"
            description="Provide the operating profile used later for assessment review."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {operationFields.map((field) => (
                <FieldCard
                  key={field.key}
                  label={field.label}
                  value={info[field.key] as string}
                  fieldKey={field.key}
                  helperText={field.helperText}
                  numericKind={field.numericKind}
                  error={fieldErrors[field.key]}
                  disabled={isReadOnly}
                  onBlur={() => validateFieldOnBlur(field.key)}
                  onChange={(value) =>
                    setInfo((current) => normalizeBusinessInfo({ ...current, [field.key]: value }))
                  }
                />
              ))}

              <FieldCard
                label="Capital Investment"
                value={info.capitalInvestment ?? ""}
                fieldKey="capitalInvestment"
                helperText="Enter the declared capital investment amount in pesos."
                numericKind="decimal"
                error={fieldErrors.capitalInvestment}
                disabled={isReadOnly}
                onBlur={() => validateFieldOnBlur("capitalInvestment")}
                onChange={(value) =>
                  setInfo((current) =>
                    normalizeBusinessInfo({ ...current, capitalInvestment: value })
                  )
                }
              />

              <FormField
                label="Business Activity"
                hint="Please select one"
                required
                error={fieldErrors.businessActivity}
              >
                <select
                  data-field-key="businessActivity"
                  className={applicantFormControlClass}
                  value={(() => {
                    // If the value is "Others: <text>", show just "Others, please specify" in the dropdown
                    if (info.businessActivity?.startsWith("Others:")) {
                      return "Others, please specify";
                    }
                    return info.businessActivity;
                  })()}
                  disabled={isReadOnly}
                  onBlur={() => validateFieldOnBlur("businessActivity")}
                  onChange={(event) => {
                    const value = event.target.value;
                    // Set to empty string if "Others" selected so the text input shows
                    setInfo((current) =>
                      normalizeBusinessInfo({ ...current, businessActivity: value === "Others, please specify" ? "" : value })
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

              {(() => {
                // More reliable check: if one of the standard BUSINESS_ACTIVITY_OPTIONS is selected, don't show input
                const isStandardOption = BUSINESS_ACTIVITY_OPTIONS.some(
                  (opt) => opt !== "Others, please specify" && opt === info.businessActivity
                );

                return !isStandardOption && (info.businessActivity === "" || info.businessActivity?.startsWith("Others:")) ? (
                  <FormField
                    label="Please specify business activity"
                    required
                    error={fieldErrors.businessActivity}
                  >
                    <input
                      data-field-key="businessActivity"
                      type="text"
                      aria-label="Please specify business activity"
                      className={applicantFormControlClass}
                      placeholder="Enter your business activity"
                      value={(() => {
                        // Extract the custom text from "Others: <text>" format
                        if (info.businessActivity?.startsWith("Others:")) {
                          return info.businessActivity.substring(7).trim();
                        }
                        return "";
                      })()}
                      disabled={isReadOnly}
                      onBlur={() => validateFieldOnBlur("businessActivity")}
                      onChange={(event) => {
                        const customText = event.target.value;
                        setInfo((current) =>
                          normalizeBusinessInfo({
                            ...current,
                            businessActivity: customText ? `Others: ${customText}` : "",
                          })
                        );
                      }}
                    />
                  </FormField>
                ) : null;
              })()}

              <FormField
                label="Line of Business"
                required
                error={fieldErrors.lineOfBusiness}
              >
                <select
                  data-field-key="lineOfBusiness"
                  className={applicantFormControlClass}
                  value={info.lineOfBusiness}
                  disabled={isReadOnly}
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
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                  Mark this if the business operates inside a public market or market stall so Market Clearance becomes required.
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
                  Mark this if the business requires Department of Agriculture clearance.
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
            description="These details support the business location and property portion of the application."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[var(--foreground)]">
                  Property Ownership <span className="text-[var(--danger)]">*</span>
                </span>
                <select
                  data-field-key="propertyOwnership"
                  className={applicantFormControlClass}
                  value={info.propertyOwnership}
                  disabled={isReadOnly}
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
              </label>

              <FieldCard
                label="Tax Declaration Number"
                value={info.taxDeclarationNumber}
                fieldKey="taxDeclarationNumber"
                placeholder="2026-18045-00001"
                helperText="Example format: 2026-18045-00001"
                error={fieldErrors.taxDeclarationNumber}
                required={info.propertyOwnership === "Owned"}
                disabled={isReadOnly}
                onBlur={() => validateFieldOnBlur("taxDeclarationNumber")}
                onChange={(value) =>
                  setInfo((current) => ({ ...current, taxDeclarationNumber: value }))
                }
              />

              <FieldCard
                label="Property Identification Number"
                value={info.propertyIdentificationNumber}
                fieldKey="propertyIdentificationNumber"
                placeholder="180-08-002-001-001"
                helperText="Example format: 180-08-002-001-001"
                error={fieldErrors.propertyIdentificationNumber}
                required={false}
                disabled={isReadOnly}
                onBlur={() => validateFieldOnBlur("propertyIdentificationNumber")}
                onChange={(value) =>
                  setInfo((current) => ({ ...current, propertyIdentificationNumber: value }))
                }
              />

              <FieldCard
                label="OR Number"
                value={info.orNumber ?? ""}
                fieldKey="orNumber"
                placeholder="OR-2026-00001"
                helperText="Official Receipt Number of the record/transaction"
                error={fieldErrors.orNumber}
                required={false}
                disabled={isReadOnly}
                onBlur={() => validateFieldOnBlur("orNumber")}
                onChange={(value) =>
                  setInfo((current) => ({ ...current, orNumber: value }))
                }
              />

              <div className={`md:col-span-2 ${applicantPanelClass}`}>
                {info.propertyOwnership === "Owned"
                  ? "Provide the tax declaration and property identification details for your owned property."
                  : "If the property is not owned, provide the tax declaration number if available, and make sure the required lease or consent document is uploaded in the document step."}
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
                        name="hasTaxIncentives"
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
                        name="hasTaxIncentives"
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
                  <div className="mt-3">
                    <FieldCard
                      label="Tax Incentive Details"
                      value={info.taxIncentives}
                      fieldKey="taxIncentives"
                      helperText="Describe the tax incentive granted (e.g., program name, granting agency)."
                      error={fieldErrors.taxIncentives}
                      disabled={isReadOnly}
                      onBlur={() => validateFieldOnBlur("taxIncentives")}
                      onChange={(value) =>
                        setInfo((current) => normalizeBusinessInfo({ ...current, taxIncentives: value }))
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {step === 2 ? (
        <div className={`space-y-4 ${lockInteractivityClass}`}>
          <div data-field-key="requiredDocuments" />
          <InfoBanner
            title={`Required documents uploaded: ${uploadedRequiredCount} of ${requiredDocs.length}`}
            description="Upload each required document now. Saving a draft keeps these files so you do not need to re-upload them later."
            variant="info"
          />
          <SectionCard
            title="Document Upload"
            description="Required files may vary based on business type and property ownership."
          >
            <RequirementsUploadTable
              accept={DOCUMENT_FILE_INPUT_ACCEPT}
              rows={requiredDocs.map((doc) => {
                const uploadedDoc = getUploadedDocumentForRequiredName(doc);
                const isMissing = missingDocNames.some(
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
                  disabled: submitting || isReadOnly,
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

      {step === 3 ? (
        <div className={`space-y-4 ${lockInteractivityClass}`}>
          <SectionCard
            title="Preferred Mode of Payment"
            description="Choose how you prefer to pay the assessed fees. Final payment details are confirmed after BPLO assessment."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <label className={applicantRadioLabelClass}>
                <input
                  type="radio"
                  name="paymentFrequency"
                  value="ANNUAL"
                  checked={info.paymentFrequency === "ANNUAL"}
                  disabled={isReadOnly}
                  onChange={() =>
                    setInfo((current) => normalizeBusinessInfo({ ...current, paymentFrequency: "ANNUAL" }))
                  }
                />
                Annual
              </label>
              <label className={applicantRadioLabelClass}>
                <input
                  type="radio"
                  name="paymentFrequency"
                  value="BI_ANNUAL"
                  checked={info.paymentFrequency === "BI_ANNUAL"}
                  disabled={isReadOnly}
                  onChange={() =>
                    setInfo((current) => normalizeBusinessInfo({ ...current, paymentFrequency: "BI_ANNUAL" }))
                  }
                />
                Bi-Annual
              </label>
              <label className={applicantRadioLabelClass}>
                <input
                  type="radio"
                  name="paymentFrequency"
                  value="QUARTERLY"
                  checked={info.paymentFrequency === "QUARTERLY"}
                  disabled={isReadOnly}
                  onChange={() =>
                    setInfo((current) => normalizeBusinessInfo({ ...current, paymentFrequency: "QUARTERLY" }))
                  }
                />
                Quarterly
              </label>
            </div>
          </SectionCard>

          <InfoBanner
            title="BPLO assessment"
            description="Fees will be assessed by BPLO after application review."
            variant="info"
          />
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <SectionCard
            title="Review and Submit"
            description="Confirm the encoded details and uploaded requirements before running final validation."
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
                  onClick={() => setShowVerificationPrint(true)}
                  className={actionButtonStyles("secondary", "md")}
                >
                  Print Verification Form
                </button>
                <button
                  type="button"
                  disabled={submitting || isReadOnly}
                  onClick={() => {
                    void persist("DRAFT");
                  }}
                  className={actionButtonStyles("secondary", "md")}
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={submitting || isReadOnly}
                  onClick={handleFinalSubmit}
                  className={actionButtonStyles("primary", "md")}
                >
                  {getApplicationSubmitButtonLabel("NEW", isResubmission)}
                </button>
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-3">
              <ReviewStat
                label="Business Name"
                value={info.businessName || "-"}
                helper="Applicant-entered business name"
              />
              <ReviewStat
                label="Application Type"
                value="New Application"
                helper="Workflow logic remains unchanged"
              />
              <ReviewStat
                label="Required Documents"
                value={`${uploadedRequiredCount} / ${requiredDocs.length}`}
                helper="Uploaded required document count"
              />
              <ReviewStat
                label="Mode of Payment"
                value={
                  info.paymentFrequency === "ANNUAL"
                    ? "Annual"
                    : info.paymentFrequency === "BI_ANNUAL"
                      ? "Bi-Annual"
                      : "Quarterly"
                }
                helper="Applicant preference for assessed fee payment"
              />
              <ReviewStat label="Country" value={info.country?.trim() || "-"} />
              <ReviewStat label="Province" value={info.province?.trim() || "-"} />
              <ReviewStat
                label="City / Municipality"
                value={info.cityMunicipality?.trim() || "-"}
              />
              <ReviewStat
                label="Street Address"
                value={info.streetAddress?.trim() || "-"}
              />
              <ReviewStat
                label="Tax Declaration Number"
                value={info.taxDeclarationNumber?.trim() || "-"}
                helper="Declared tax declaration number"
              />
              <ReviewStat
                label="Property Identification Number"
                value={info.propertyIdentificationNumber?.trim() || "-"}
                helper="Declared property identification number"
              />
              <ReviewStat
                label="OR Number"
                value={info.orNumber?.trim() || "-"}
                helper="Official receipt number"
              />
            </div>

            <div className={`mt-4 ${applicantPanelClass}`}>
              <p className="font-semibold text-[var(--foreground)]">Main Office Address</p>
              <p className="mt-1">{info.mainOfficeAddress || "-"}</p>
              <p className="mt-1 ui-caption">Zip Code: {info.mainOfficeZipCode?.trim() || "-"}</p>
            </div>

            <div className={`mt-4 ${applicantPanelClass}`}>
              <p className="font-semibold text-[var(--foreground)]">Business Address</p>
              <p className="mt-0.5 ui-caption">
                {info.businessLatitude != null && info.businessLongitude != null
                  ? "Business location pinned"
                  : "Business location not pinned"}
              </p>
              <p className="mt-1">{info.businessAddress || "-"}</p>
              <p className="mt-1 ui-caption">Zip Code: {info.businessZipCode?.trim() || EB_MAGALONA_ZIP_CODE}</p>
            </div>

            <div className={`mt-4 ${applicantPanelClass}`}>
              <p className="font-semibold text-[var(--foreground)]">Before you submit</p>
              <ul className="mt-2 space-y-1">
                <li>• Review the business information and operational details for accuracy.</li>
                <li>• Confirm each required document is uploaded with a clear file copy.</li>
                <li>• Use Save Draft if you still need to continue later.</li>
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
          applicationTypeLabel="New Business Permit Application"
          requiredDocuments={requiredDocs}
          uploadedDocumentNames={Object.values(uploadedDocuments).map((doc) => doc.documentName)}
          onClose={() => setShowVerificationPrint(false)}
        />
      ) : null}
    </div>
  );
}
