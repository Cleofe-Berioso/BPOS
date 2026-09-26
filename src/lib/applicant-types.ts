export type BusinessType =
  | "Sole Proprietorship"
  | "One Person Corporation"
  | "Partnership"
  | "Corporation"
  | "Cooperative";

export type CorporationNationality = "Filipino" | "Foreign";

export type PaymentFrequencyOption = "ANNUAL" | "BI_ANNUAL" | "QUARTERLY";

export type PropertyOwnership = "Owned" | "Not Owned";

export interface FeeLineItemInput {
  id?: string;
  description: string;
  amount: number;
  isSystemGenerated?: boolean;
}

export type ApplicationStatus =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Department Head Review"
  | "Department Head Approved"
  | "Assessed"
  | "Approved for Payment"
  | "Paid"
  | "For Release"
  | "Released"
  | "Revocation Review"
  | "Revoked"
  | "Returned for Correction"
  | "Rejected";

export type ApplicationType = "NEW" | "RENEWAL" | "CLOSURE";

export type PersistMode = "DRAFT" | "SUBMIT";

export const STATUS_FLOW: ApplicationStatus[] = [
  "Draft",
  "Submitted",
  "Under Review",
  "Department Head Review",
  "Department Head Approved",
  "Assessed",
  "Approved for Payment",
  "Paid",
  "For Release",
  "Released",
  "Revocation Review",
  "Revoked",
  "Returned for Correction",
  "Rejected",
];

export interface ApplicationDocumentInput {
  id?: string;
  documentType?: string;
  documentName: string;
  fileName: string;
  storagePath?: string;
  bucket?: string;
  filePath?: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  fileSize?: number;
  uploadedAt?: Date | string;
  validationStatus?: string;
  validationRemarks?: string | null;
  validatedAt?: Date | string | null;
}

export interface SubmitValidationErrorDetail {
  missingFields: string[];
  missingDocuments: string[];
  fieldErrors?: Record<string, string>;
}

export interface SaveApplicationInput {
  applicationId?: string;
  applicationType: ApplicationType;
  businessRecordId?: string;
  closureType?: "RETIREMENT" | "NON_COMPLIANT_RELATED" | "OTHERS";
  closureTypeOtherReason?: string;
  formData: BusinessInfo;
  documents: ApplicationDocumentInput[];
  mode: PersistMode;
}

export interface ApplicantApplicationRow {
  id: string;
  applicationNumber: string;
  businessName: string;
  applicationType: ApplicationType;
  status: ApplicationStatus;
  dateSubmitted: string;
  updatedAt?: string;
  canEdit: boolean;
}

export interface BusinessInfo {
  businessType: BusinessType;
  registrationNumber: string;
  paymentFrequency: PaymentFrequencyOption;
  tin: string;
  businessName: string;
  tradeName: string;
  ownerName: string;
  sex?: string;
  nationality: string;
  email: string;
  telephone?: string;
  phone: string;
  corporationNationality?: CorporationNationality;
  country?: string;
  countryCode?: string;
  province?: string;
  provinceCode?: string;
  cityMunicipality?: string;
  streetAddress?: string;
  mainOfficeCountry?: string;
  mainOfficeCountryCode?: string;
  mainOfficeProvince?: string;
  mainOfficeProvinceCode?: string;
  mainOfficeCityMunicipality?: string;
  mainOfficeStreetAddress?: string;
  mainOfficeBarangay?: string;
  mainOfficeZipCode?: string;
  mainOfficeAddress: string;
  businessAddress: string;
  businessZipCode?: string;
  businessLatitude: number | null;
  businessLongitude: number | null;
  businessBarangay?: string;
  businessStreetAddress?: string;
  sameAsMainOffice: boolean;
  businessArea: string;
  totalFloorArea: string;
  totalEmployees: string;
  maleEmployees: string;
  femaleEmployees: string;
  employeesWithinMunicipality: string;
  deliveryVehicles: string;
  deliveryVanTruck?: string;
  deliveryMotorcycle?: string;
  propertyOwnership: PropertyOwnership;
  taxDeclarationNumber: string;
  propertyIdentificationNumber: string;
  orNumber?: string;
  hasTaxIncentives?: "YES" | "NO" | "";
  taxIncentives: string;
  businessActivity: string;
  lineOfBusiness: string;
  assetSize: string;
  isMarket: boolean;
  isAgriculture: boolean;
  isLiquorOrTobacco?: boolean;
  ownerFirstName?: string;
  ownerMiddleName?: string;
  ownerSurname?: string;
  ownerSuffix?: string;
  birthDate?: string;
  ownerAge?: string;
  capitalInvestment?: string;
  grossProfit?: string;
  barangay?: string;
  businessOperationType?: "Main" | "Branch";
  // Closure-specific operation fields (stored in formData JSON — no migration needed)
  closureLineOfBusiness?: string;
  closureBusinessActivity?: string;
  closureLastDateOfOperation?: string;
  closureReason?: string;
  closureRemarks?: string;
}
