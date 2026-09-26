import type { ApplicationStatus, BusinessInfo } from "@/lib/applicant-types";
import {
  getRegistrationHelperText,
  getRegistrationLabel,
} from "@/lib/business-rules";
import {
  EB_MAGALONA_CITY,
  EB_MAGALONA_COUNTRY,
  EB_MAGALONA_COUNTRY_CODE,
  EB_MAGALONA_PROVINCE,
} from "@/lib/address-options";

export const APPLICANT_SIDEBAR_ITEMS = [
  { label: "Dashboard", href: "/applicant/dashboard" },
  { label: "Application", href: "/applicant/application" },
  { label: "My Applications", href: "/applicant/my-applications" },
  { label: "Tax Order of Payment", href: "/applicant/top" },
  { label: "Notifications", href: "/applicant/notifications" },
  { label: "Profile", href: "/applicant/profile" },
] as const;

export const defaultBusinessInfo: BusinessInfo = {
  businessType: "Sole Proprietorship",
  registrationNumber: "",
  paymentFrequency: "ANNUAL",
  tin: "",
  businessName: "",
  tradeName: "",
  ownerName: "",
  nationality: "Filipino",
  email: "",
  telephone: "",
  phone: "",
  corporationNationality: undefined,
  country: EB_MAGALONA_COUNTRY,
  countryCode: EB_MAGALONA_COUNTRY_CODE,
  province: EB_MAGALONA_PROVINCE,
  provinceCode: "",
  cityMunicipality: EB_MAGALONA_CITY,
  streetAddress: "",
  mainOfficeCountry: "",
  mainOfficeCountryCode: "",
  mainOfficeProvince: "",
  mainOfficeProvinceCode: "",
  mainOfficeCityMunicipality: "",
  mainOfficeStreetAddress: "",
  mainOfficeBarangay: "",
  mainOfficeZipCode: "",
  mainOfficeAddress: "",
  businessAddress: "",
  businessZipCode: "",
  businessLatitude: null,
  businessLongitude: null,
  sameAsMainOffice: true,
  businessArea: "",
  totalFloorArea: "",
  totalEmployees: "",
  maleEmployees: "",
  femaleEmployees: "",
  employeesWithinMunicipality: "",
  deliveryVehicles: "",
  deliveryVanTruck: "",
  deliveryMotorcycle: "",
  propertyOwnership: "Owned",
  taxDeclarationNumber: "",
  propertyIdentificationNumber: "",
  orNumber: "",
  hasTaxIncentives: "",
  taxIncentives: "",
  businessActivity: "",
  lineOfBusiness: "",
  assetSize: "",
  isMarket: false,
  isAgriculture: false,
  isLiquorOrTobacco: false,
  ownerFirstName: "",
  ownerMiddleName: "",
  ownerSurname: "",
  ownerSuffix: "",
  birthDate: "",
  ownerAge: "",
  capitalInvestment: "",
  grossProfit: "",
  barangay: "",
  businessOperationType: "Main" as const,
};

export const mockBusinesses: BusinessInfo[] = [
  {
    ...defaultBusinessInfo,
    businessType: "Sole Proprietorship",
    registrationNumber: "DTI-2024-001223",
    tin: "123-456-789-000",
    businessName: "Green Valley Trading",
    tradeName: "Green Valley",
    ownerName: "Juan Dela Cruz",
    email: "applicant@example.com",
    phone: "+63 912 345 6789",
    country: "Philippines",
    countryCode: "PH",
    province: "Negros Occidental",
    cityMunicipality: "Enrique B. Magalona",
    streetAddress: "Poblacion",
    mainOfficeAddress: "Poblacion, Enrique B. Magalona, Negros Occidental",
    businessLatitude: null,
    businessLongitude: null,
    sameAsMainOffice: true,
    businessArea: "120",
    totalFloorArea: "200",
    totalEmployees: "12",
    maleEmployees: "7",
    femaleEmployees: "5",
    employeesWithinMunicipality: "9",
    deliveryVehicles: "2",
    propertyOwnership: "Owned",
    taxDeclarationNumber: "TD-11-2233",
    propertyIdentificationNumber: "PIN-223344",
    taxIncentives: "None",
    businessActivity: "Retail and wholesale of general merchandise",
    lineOfBusiness: "Trading",
    assetSize: "5,000,000",
  },
];

export interface MockApplicationRow {
  applicationNumber: string;
  businessName: string;
  applicationType: "New" | "Renewal" | "Closure";
  status: ApplicationStatus;
  dateSubmitted: string;
}

export const mockApplications: MockApplicationRow[] = [
  {
    applicationNumber: "EBPLS-2026-0001",
    businessName: "Green Valley Trading",
    applicationType: "Renewal",
    status: "Assessed",
    dateSubmitted: "2026-04-25",
  },
  {
    applicationNumber: "EBPLS-2026-0007",
    businessName: "Green Valley Trading",
    applicationType: "Closure",
    status: "Draft",
    dateSubmitted: "2026-05-01",
  },
  {
    applicationNumber: "EBPLS-2026-0009",
    businessName: "Green Valley Trading",
    applicationType: "New",
    status: "Submitted",
    dateSubmitted: "2026-05-03",
  },
];

export { getRegistrationHelperText, getRegistrationLabel };
