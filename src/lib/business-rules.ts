import type { ApplicationType, BusinessInfo, BusinessType } from "@/lib/applicant-types";
import {
  buildEbMagalonaBusinessAddress,
  buildMainOfficeAddress,
  EB_MAGALONA_CITY,
  EB_MAGALONA_COUNTRY,
  EB_MAGALONA_COUNTRY_CODE,
  EB_MAGALONA_PROVINCE,
  EB_MAGALONA_ZIP_CODE,
  isEbMagalonaCity,
  isEbMagalonaProvince,
  isPhilippinesCountry,
} from "@/lib/address-options";
import { formatOwnerName } from "@/lib/person-name";

export { isPhilippinesCountry } from "@/lib/address-options";

export const EB_MAGALONA_BARANGAYS = [
  "Alacaygan",
  "Alicante",
  "Poblacion I (Barangay 1)",
  "Poblacion II (Barangay 2)",
  "Poblacion III (Barangay 3)",
  "Batea",
  "Consing",
  "Cudangdang",
  "Damgo",
  "Gahit",
  "Canlusong",
  "Latasan",
  "Madalag",
  "Manta-angan",
  "Nanca",
  "Pasil",
  "San Isidro",
  "San Jose",
  "Santo Niño",
  "Tabigue",
  "Tanza",
  "Tuburan",
  "Tomongtong",
] as const;

const EB_MAGALONA_BARANGAY_VARIANTS: Array<[string, (typeof EB_MAGALONA_BARANGAYS)[number]]> = [
  ["Barangay 1 (Pob.)", "Poblacion I (Barangay 1)"],
  ["Barangay 2 (Pob.)", "Poblacion II (Barangay 2)"],
  ["Barangay 3 (Pob.)", "Poblacion III (Barangay 3)"],
  ["Poblacion 1", "Poblacion I (Barangay 1)"],
  ["Poblacion 2", "Poblacion II (Barangay 2)"],
  ["Poblacion 3", "Poblacion III (Barangay 3)"],
];

function normalizeBarangayToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[.'’,-]/g, " ")
    .replace(/\b(barangay|pob|pob\.)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EB_MAGALONA_BARANGAY_LOOKUP = new Map<string, (typeof EB_MAGALONA_BARANGAYS)[number]>();

for (const barangay of EB_MAGALONA_BARANGAYS) {
  EB_MAGALONA_BARANGAY_LOOKUP.set(normalizeBarangayToken(barangay), barangay);
}

for (const [variant, canonical] of EB_MAGALONA_BARANGAY_VARIANTS) {
  EB_MAGALONA_BARANGAY_LOOKUP.set(normalizeBarangayToken(variant), canonical);
}

export function normalizeEbMagalonaBarangayName(value: string): string {
  const normalized = normalizeBarangayToken(value);
  return EB_MAGALONA_BARANGAY_LOOKUP.get(normalized) ?? value.trim();
}

export function isRecognizedEbMagalonaBarangay(value: string): boolean {
  return EB_MAGALONA_BARANGAY_LOOKUP.has(normalizeBarangayToken(value));
}

export function canUseMainOfficeAsBusinessLocation(
  input: Pick<
    BusinessInfo,
    "sameAsMainOffice" | "mainOfficeCountry" | "mainOfficeCountryCode" | "mainOfficeProvince" | "mainOfficeCityMunicipality"
  >
): boolean {
  if (!input.sameAsMainOffice) {
    return false;
  }

  return (
    isPhilippinesCountry(input.mainOfficeCountry, input.mainOfficeCountryCode) &&
    isEbMagalonaProvince(input.mainOfficeProvince) &&
    isEbMagalonaCity(input.mainOfficeCityMunicipality)
  );
}

export function resolveBusinessBarangayFromFormState(
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
  const resolved = (
    input.businessBarangay?.trim() ||
    input.barangay?.trim() ||
    (canUseMainOfficeAsBusinessLocation(input) ? input.mainOfficeBarangay?.trim() : "") ||
    ""
  ).trim();

  return resolved ? normalizeEbMagalonaBarangayName(resolved) : "";
}

export const BUSINESS_ACTIVITY_OPTIONS = [
  "Main Office",
  "Branch Office",
  "Admin Office Only",
  "Warehouse",
  "Others, please specify",
] as const;

function parseBirthDateInput(value: string | Date): Date {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new Error("Birthdate is invalid.");
    }
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Birthdate is required.");
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new Error("Birthdate is invalid.");
    }
    return parsed;
  }

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Birthdate is invalid.");
  }
  return parsed;
}

export function calculateAgeFromBirthDate(birthDate: string | Date, now = new Date()): number {
  const parsedBirthDate = parseBirthDateInput(birthDate);
  const birth = new Date(
    Date.UTC(
      parsedBirthDate.getUTCFullYear(),
      parsedBirthDate.getUTCMonth(),
      parsedBirthDate.getUTCDate(),
      12,
      0,
      0
    )
  );

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));

  if (birth.getTime() > today.getTime()) {
    throw new Error("Birthdate cannot be in the future.");
  }

  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const hasHadBirthdayThisYear =
    today.getUTCMonth() > birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() >= birth.getUTCDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  if (!Number.isInteger(age) || age < 0 || age > 120) {
    throw new Error("Computed age is out of allowed range.");
  }

  return age;
}

export function splitOwnerName(ownerName: string): {
  ownerFirstName: string;
  ownerMiddleName: string;
  ownerSurname: string;
  ownerSuffix: string;
} {
  const trimmed = ownerName.trim();
  if (!trimmed) {
    return { ownerFirstName: "", ownerMiddleName: "", ownerSurname: "", ownerSuffix: "" };
  }

  const suffixCandidates = new Set(["JR", "JR.", "SR", "SR.", "II", "III", "IV", "V"]);
  const parts = trimmed.split(/\s+/);
  const maybeSuffix = (parts[parts.length - 1] ?? "").toUpperCase();
  const hasSuffix = suffixCandidates.has(maybeSuffix);
  const suffix = hasSuffix ? parts.pop() ?? "" : "";

  if (parts.length === 1) {
    return {
      ownerFirstName: parts[0] ?? "",
      ownerMiddleName: "",
      ownerSurname: "",
      ownerSuffix: suffix,
    };
  }
  if (parts.length === 2) {
    return {
      ownerFirstName: parts[0] ?? "",
      ownerMiddleName: "",
      ownerSurname: parts[1] ?? "",
      ownerSuffix: suffix,
    };
  }
  return {
    ownerFirstName: parts[0] ?? "",
    ownerMiddleName: parts.slice(1, -1).join(" "),
    ownerSurname: parts[parts.length - 1] ?? "",
    ownerSuffix: suffix,
  };
}

const REGISTRATION_NUMBER_REGEX_BY_BUSINESS_TYPE: Record<BusinessType, RegExp> = {
  "Sole Proprietorship": /^DTI-\d{4}-\d{6}$/,
  "One Person Corporation": /^CS\d{4}-\d{5}$/,
  Partnership: /^CS\d{4}-\d{5}$/,
  Corporation: /^CS\d{4}-\d{5}$/,
  Cooperative: /^CDA-\d{4}-\d{6}$/,
};

const TIN_REGEX = /^\d{9,15}$/;

export const REGISTRATION_METADATA: Record<
  BusinessType,
  {
    label: string;
    agency: string;
    helperText: string;
  }
> = {
  "Sole Proprietorship": {
    label: "DTI Registration Number",
    agency: "Department of Trade and Industry",
    helperText: "Use DTI-YYYY-NNNNNN format (example: DTI-2026-123456).",
  },
  Partnership: {
    label: "SEC Registration Number",
    agency: "Securities and Exchange Commission",
    helperText: "Use CSYYYY-NNNNN format (example: CS2026-12345).",
  },
  Corporation: {
    label: "SEC Registration Number",
    agency: "Securities and Exchange Commission",
    helperText: "Use CSYYYY-NNNNN format (example: CS2026-12345).",
  },
  "One Person Corporation": {
    label: "SEC Registration Number",
    agency: "Securities and Exchange Commission",
    helperText: "Use CSYYYY-NNNNN format (example: CS2026-12345).",
  },
  Cooperative: {
    label: "CDA Registration Number",
    agency: "Cooperative Development Authority",
    helperText: "Use CDA-YYYY-NNNNNN format (example: CDA-2026-123456).",
  },
};

export const RENEWAL_LOCKED_FIELDS: Array<keyof BusinessInfo> = [
  "businessName",
  "businessType",
  "registrationNumber",
  "tin",
  "ownerName",
  "tradeName",
  "nationality",
];

/** Fields restored from the business record for CLOSURE so normalize cannot wipe them. */
export const CLOSURE_LOCKED_FIELDS: Array<keyof BusinessInfo> = [
  "businessName",
  "businessType",
  "registrationNumber",
  "tin",
  "ownerName",
  "tradeName",
  "nationality",
  "email",
  "phone",
  "businessAddress",
  "lineOfBusiness",
  "businessActivity",
  "mainOfficeAddress",
  "businessLatitude",
  "businessLongitude",
  "propertyOwnership",
  "isMarket",
  "isAgriculture",
  "isLiquorOrTobacco",
];

export function getRegistrationLabel(businessType: BusinessType): string {
  return REGISTRATION_METADATA[businessType].label;
}

export function getRegistrationAgency(businessType: BusinessType): string {
  return REGISTRATION_METADATA[businessType].agency;
}

export function getRegistrationHelperText(businessType: BusinessType): string {
  return REGISTRATION_METADATA[businessType].helperText;
}

export function validateRegistrationNumberFormat(
  businessType: BusinessType,
  registrationNumber: string
): boolean {
  return REGISTRATION_NUMBER_REGEX_BY_BUSINESS_TYPE[businessType].test(
    normalizeRegistrationNumber(registrationNumber)
  );
}

export function validateTinFormat(tin: string): boolean {
  return TIN_REGEX.test(normalizeTin(tin));
}

/** Canonical registration identity for uniqueness and format checks. */
export function normalizeRegistrationNumber(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Canonical TIN identity (digits only) for uniqueness and format checks. */
export function normalizeTin(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\D/g, "");
}

/** Persist TIN as BigInt at the BusinessRecord write boundary. Never NULL. */
export function tinToBigInt(value: string | null | undefined): bigint {
  const digits = normalizeTin(value);
  if (!digits) {
    throw new Error("TIN is required.");
  }
  if (!TIN_REGEX.test(digits)) {
    throw new Error("Wrong Format");
  }
  return BigInt(digits);
}

/** Read TIN BigInt back to digit string for formData / BusinessInfo. */
export function tinFromDb(value: bigint | number | string | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

export function optionalIntFromDb(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

export function optionalDecimalFromDb(
  value: { toString(): string } | number | string | null | undefined
): string {
  if (value == null) return "";
  return String(value);
}

export function parseOptionalIntForDb(value: string | null | undefined): number | null {
  const raw = (value ?? "").trim().replace(/[,\s]/g, "");
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOptionalDecimalForDb(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().replace(/[,\s]/g, "");
  if (!raw) return null;
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  return raw;
}

/**
 * Persist deliveryVehicles as an integer count.
 * Accepts a plain count, or free-text "Van/Truck: N; Motorcycle: M" and sums extractable counts.
 */
export function parseDeliveryVehicleCountForDb(value: string | null | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }

  const vanMatch = /van\s*\/?\s*truck\s*:\s*([0-9]+)/i.exec(raw);
  const motoMatch = /motorcycle\s*:\s*([0-9]+)/i.exec(raw);
  if (vanMatch || motoMatch) {
    const total =
      Number.parseInt(vanMatch?.[1] ?? "0", 10) + Number.parseInt(motoMatch?.[1] ?? "0", 10);
    return total > 0 ? total : null;
  }

  const firstNumber = /([0-9]+)/.exec(raw);
  if (firstNumber) {
    return Number.parseInt(firstNumber[1], 10);
  }
  return null;
}

export function validateBusinessIdentityFormats(input: Pick<BusinessInfo, "businessType" | "registrationNumber" | "tin">): {
  registrationNumber: boolean;
  tin: boolean;
} {
  return {
    registrationNumber: validateRegistrationNumberFormat(input.businessType, input.registrationNumber),
    tin: validateTinFormat(input.tin),
  };
}

export function isCorporation(businessType: BusinessType): boolean {
  return businessType === "Corporation" || businessType === "One Person Corporation";
}

export const CORPORATION_NATIONALITY_OPTIONS = ["Filipino", "Foreign"] as const;

export function requiresCorporationNationality(businessType: BusinessType): boolean {
  return isCorporation(businessType);
}

export function getOwnerRoleLabel(businessType: BusinessType): "Owner" | "President / Officer-in-Charge" {
  return businessType === "Sole Proprietorship" ? "Owner" : "President / Officer-in-Charge";
}

export function isValidCorporationNationality(value: string): boolean {
  return (CORPORATION_NATIONALITY_OPTIONS as readonly string[]).includes(value);
}

function normalizeDeliveryVehicleFields(
  input: Pick<BusinessInfo, "deliveryVehicles" | "deliveryVanTruck" | "deliveryMotorcycle">
): Pick<BusinessInfo, "deliveryVehicles" | "deliveryVanTruck" | "deliveryMotorcycle"> {
  let vanTruck = input.deliveryVanTruck?.trim() ?? "";
  let motorcycle = input.deliveryMotorcycle?.trim() ?? "";
  const legacy = input.deliveryVehicles?.trim() ?? "";

  if (!vanTruck && !motorcycle && legacy) {
    const vanMatch = /van\s*\/?\s*truck\s*:\s*([^;]+)/i.exec(legacy);
    const motoMatch = /motorcycle\s*:\s*([^;]+)/i.exec(legacy);
    if (vanMatch || motoMatch) {
      vanTruck = (vanMatch?.[1] ?? "").trim();
      motorcycle = (motoMatch?.[1] ?? "").trim();
    } else {
      vanTruck = legacy;
    }
  }

  const parts: string[] = [];
  if (vanTruck) parts.push(`Van/Truck: ${vanTruck}`);
  if (motorcycle) parts.push(`Motorcycle: ${motorcycle}`);
  const combined = parts.length > 0 ? parts.join("; ") : legacy;

  return {
    deliveryVanTruck: vanTruck,
    deliveryMotorcycle: motorcycle,
    deliveryVehicles: combined,
  };
}

export const CORPORATION_OWNERSHIP_CLASSIFICATIONS = [
  "Filipino-owned",
  "Foreign-owned",
  "Mixed Filipino-Foreign ownership",
] as const;

export function isCorporationOwnershipClassification(value: string): boolean {
  return (CORPORATION_OWNERSHIP_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function resolveNationalityOnBusinessTypeChange(
  _previousBusinessType: BusinessType,
  _nextBusinessType: BusinessType,
  currentNationality: string
): string {
  return currentNationality.trim();
}

export function normalizeNationality(businessType: BusinessType, nationality: string): string {
  return nationality.trim();
}

export function normalizeBusinessInfo(input: BusinessInfo): BusinessInfo {
  const country = EB_MAGALONA_COUNTRY;
  const countryCode = EB_MAGALONA_COUNTRY_CODE;
  const province = EB_MAGALONA_PROVINCE;
  const provinceCode = input.provinceCode?.trim() ?? "";
  const cityMunicipality = EB_MAGALONA_CITY;

  const mainOfficeCountry = input.mainOfficeCountry?.trim() || "";
    const mainOfficeCountryCode = input.mainOfficeCountryCode?.trim().toUpperCase() || "";
    const mainOfficeProvince = input.mainOfficeProvince?.trim() || "";
    const mainOfficeProvinceCode = input.mainOfficeProvinceCode?.trim() || "";
    const mainOfficeCityMunicipality = input.mainOfficeCityMunicipality?.trim() || "";
    const mainOfficePhilippines = isPhilippinesCountry(mainOfficeCountry, mainOfficeCountryCode);
    const mainOfficeStreetAddress = mainOfficePhilippines ? "" : (input.mainOfficeStreetAddress?.trim() || "");
    const mainOfficeBarangay = mainOfficePhilippines ? (input.mainOfficeBarangay?.trim() || "") : "";

  const rawBusinessStreetAddress = input.businessStreetAddress?.trim() ?? "";
  const rawBusinessBarangay = input.businessBarangay?.trim() ?? "";
  const rawStreetAddress = (rawBusinessStreetAddress || input.streetAddress?.trim() || "").trim();
  const rawBarangay = (rawBusinessBarangay || input.barangay?.trim() || "").trim();
  const legacyBusinessAddress = input.businessAddress?.trim() ?? "";

  const legacyParts = legacyBusinessAddress.split(",").map((part) => part.trim()).filter(Boolean);
  const inferredStreet = !rawStreetAddress && legacyParts.length > 0 ? legacyParts[0] ?? "" : "";
  const inferredBarangay = !rawBarangay && legacyParts.length >= 5
    ? (legacyParts[1] ?? "").replace(/^barangay\s+/i, "")
    : "";

  const streetAddress = (rawStreetAddress || inferredStreet).trim();
  const barangay = (rawBarangay || inferredBarangay).trim();
  const birthDate = input.birthDate?.trim() ?? "";
  const hasStructuredMainOfficeAddress = [
    mainOfficeCountry,
    mainOfficeProvince,
    mainOfficeCityMunicipality,
    mainOfficePhilippines ? mainOfficeBarangay : mainOfficeStreetAddress,
  ].some((value) => value.length > 0);

  const normalizedMainOfficeAddress = hasStructuredMainOfficeAddress
    ? mainOfficePhilippines
      ? [mainOfficeBarangay, mainOfficeCityMunicipality, mainOfficeProvince, mainOfficeCountry]
          .filter((part) => part.trim().length > 0)
          .join(", ")
      : buildMainOfficeAddress({
          streetAddress: mainOfficeStreetAddress,
          barangay: mainOfficeBarangay,
          cityMunicipality: mainOfficeCityMunicipality,
          province: mainOfficeProvince,
          country: mainOfficeCountry,
          countryCode: mainOfficeCountryCode,
        })
    : (input.mainOfficeAddress?.trim() ?? "");

  const philippines = isPhilippinesCountry(country, countryCode);

  // Auto-split ownerName into parts when both split fields are empty (e.g. loading an old record).
  let ownerFirstName = input.ownerFirstName?.trim() ?? "";
  let ownerMiddleName = input.ownerMiddleName?.trim() ?? "";
  let ownerSurname = input.ownerSurname?.trim() ?? "";
  let ownerSuffix = input.ownerSuffix?.trim() ?? "";
  if (!ownerFirstName && !ownerSurname && input.ownerName?.trim()) {
    const split = splitOwnerName(input.ownerName);
    ownerFirstName = split.ownerFirstName;
    ownerMiddleName = split.ownerMiddleName;
    ownerSurname = split.ownerSurname;
    ownerSuffix = split.ownerSuffix;
  }
  const combinedOwnerName = formatOwnerName({
    ownerFirstName,
    ownerMiddleName,
    ownerLastName: ownerSurname,
    ownerSuffix,
    ownerName: input.ownerName,
  });

  let ownerAge = input.ownerAge?.trim() ?? "";
  if (birthDate.length > 0) {
    try {
      ownerAge = String(calculateAgeFromBirthDate(birthDate));
    } catch {
      ownerAge = "";
    }
  }

  const deliveryFields = normalizeDeliveryVehicleFields(input);
  const corporationNationality = requiresCorporationNationality(input.businessType)
    ? (input.corporationNationality?.trim() as BusinessInfo["corporationNationality"]) ?? undefined
    : undefined;

  return {
    ...input,
    registrationNumber: normalizeRegistrationNumber(input.registrationNumber),
    tin: normalizeTin(input.tin),
    businessName: input.businessName?.trim() ?? "",
    tradeName: input.tradeName?.trim() ?? "",
    ownerName: combinedOwnerName,
    ownerFirstName,
    ownerMiddleName,
    ownerSurname,
    ownerSuffix,
    birthDate,
    ownerAge,
    sex: input.sex?.trim(),
    nationality: normalizeNationality(input.businessType, input.nationality),
    email: input.email?.trim() ?? "",
    telephone: input.telephone?.trim() ?? "",
    phone: input.phone?.trim() ?? "",
    corporationNationality,
    country,
    countryCode,
    province,
    provinceCode,
    cityMunicipality,
    streetAddress,
    barangay: philippines ? barangay : "",
    businessStreetAddress: streetAddress,
    businessBarangay: philippines ? barangay : "",
    mainOfficeCountry,
    mainOfficeCountryCode,
    mainOfficeProvince,
    mainOfficeProvinceCode,
    mainOfficeCityMunicipality,
    mainOfficeStreetAddress,
    mainOfficeBarangay,
    mainOfficeZipCode: input.mainOfficeZipCode?.trim() ?? "",
    mainOfficeAddress: normalizedMainOfficeAddress,
    businessAddress: (() => {
      const rebuilt = buildEbMagalonaBusinessAddress({ streetAddress, barangay });
      if (rebuilt.trim().length > 0) return rebuilt;
      const legacy = input.businessAddress?.trim() ?? "";
      return legacy;
    })(),
    businessZipCode: EB_MAGALONA_ZIP_CODE,
    businessLatitude:
      typeof input.businessLatitude === "number" && Number.isFinite(input.businessLatitude)
        ? input.businessLatitude
        : null,
    businessLongitude:
      typeof input.businessLongitude === "number" && Number.isFinite(input.businessLongitude)
        ? input.businessLongitude
        : null,
    taxDeclarationNumber: input.taxDeclarationNumber?.trim() ?? "",
    propertyIdentificationNumber: input.propertyIdentificationNumber?.trim() ?? "",
    orNumber: input.orNumber?.trim() ?? "",
    hasTaxIncentives:
      input.hasTaxIncentives === "YES" || input.hasTaxIncentives === "NO"
        ? input.hasTaxIncentives
        : input.taxIncentives?.trim() && input.taxIncentives.trim().toLowerCase() !== "none"
          ? "YES"
          : "",
    taxIncentives: input.taxIncentives?.trim() ?? "",
    businessActivity: input.businessActivity?.trim() ?? "",
    lineOfBusiness: input.lineOfBusiness?.trim() ?? "",
    assetSize: input.assetSize?.trim() ?? "",
    capitalInvestment: input.capitalInvestment?.trim() ?? "",
    grossProfit: input.grossProfit?.trim() ?? "",
    businessArea: input.businessArea?.trim() ?? "",
    totalFloorArea: input.totalFloorArea?.trim() ?? "",
    totalEmployees: input.totalEmployees?.trim() ?? "",
    maleEmployees: input.maleEmployees?.trim() ?? "",
    femaleEmployees: input.femaleEmployees?.trim() ?? "",
    employeesWithinMunicipality: input.employeesWithinMunicipality?.trim() ?? "",
    ...deliveryFields,
    isMarket: Boolean(input.isMarket),
    isAgriculture: Boolean(input.isAgriculture),
    isLiquorOrTobacco: Boolean(input.isLiquorOrTobacco),
    businessOperationType: input.businessOperationType ?? "Main",
  };
}

export function applyLockedBusinessFields(
  applicationType: ApplicationType,
  candidate: BusinessInfo,
  source?: BusinessInfo | null
): BusinessInfo {
  const normalizedCandidate = normalizeBusinessInfo(candidate);
  if (!source) {
    return normalizedCandidate;
  }

  const lockedFields =
    applicationType === "RENEWAL"
      ? RENEWAL_LOCKED_FIELDS
      : applicationType === "CLOSURE"
        ? CLOSURE_LOCKED_FIELDS
        : null;

  if (!lockedFields) {
    return normalizedCandidate;
  }

  const normalizedSource = normalizeBusinessInfo(source);
  const merged = { ...normalizedCandidate };

  for (const field of lockedFields) {
    const sourceValue = normalizedSource[field];
    if (typeof sourceValue === "string") {
      if (sourceValue.trim().length > 0) {
        merged[field] = sourceValue as never;
      }
      continue;
    }
    if (sourceValue !== null && sourceValue !== undefined) {
      merged[field] = sourceValue as never;
    }
  }

  // Prefer the record's full business address when street/barangay rebuild is empty.
  if (
    applicationType === "CLOSURE" &&
    !(merged.businessAddress ?? "").trim() &&
    source.businessAddress?.trim()
  ) {
    merged.businessAddress = source.businessAddress.trim();
  }

  // Avoid a second normalize pass wiping restored CLOSURE identity fields.
  if (applicationType === "CLOSURE") {
    return merged;
  }

  return normalizeBusinessInfo(merged);
}