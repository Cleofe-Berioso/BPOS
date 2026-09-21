import { prisma } from "@/lib/prisma";
import type { BusinessInfo } from "@/lib/applicant-types";
import {
  optionalDecimalFromDb,
  optionalIntFromDb,
  tinFromDb,
} from "@/lib/business-rules";

export type ClosureTypeValue = "RETIREMENT" | "NON_COMPLIANT_RELATED" | "OTHERS";

export interface ClosureEligibilityResult {
  eligible: boolean;
  isComplianceForcedClosure: boolean;
  reasonCode: string | null;
  userFriendlyReason: string | null;
  blockingInspectionId: string | null;
  complianceCaseStatus: string | null;
  nonComplianceType: string | null;
}

export interface ClosureBusinessRecordRow {
  id: string;
  registrationNumber: string;
  businessName: string;
  businessStatus: "ACTIVE" | "INACTIVE" | "CLOSED";
  hasRevokedPermit: boolean;
  closedAt: string | null;
  businessInfo: BusinessInfo;
  closureEligibility: ClosureEligibilityResult;
}

type EligibleBusinessStatus = "PAID" | "FOR_RELEASE" | "RELEASED";

const ELIGIBLE_EXISTING_BUSINESS_STATUSES: EligibleBusinessStatus[] = ["PAID", "FOR_RELEASE", "RELEASED"];

const CLOSURE_APPLICATION_STATUSES = [...ELIGIBLE_EXISTING_BUSINESS_STATUSES, "REVOKED"] as const;

const FORCED_CLOSURE_STATUSES = new Set([
  "FORCED_CLOSURE_PENDING",
  "EXPIRED_UNSETTLED",
  "CLOSED_NON_COMPLIANT",
]);

function hasEligibleHistory(applications: Array<{ status: string }>): boolean {
  return applications.some((application) =>
    ELIGIBLE_EXISTING_BUSINESS_STATUSES.includes(application.status as EligibleBusinessStatus)
  );
}

function hasRevokedPermitHistory(applications: Array<{ status: string }>): boolean {
  return applications.some((application) => application.status === "REVOKED");
}

function resolveHasRevokedPermit(
  businessStatus: BusinessSnapshot["businessStatus"],
  applications: Array<{ status: string }>
): boolean {
  return businessStatus === "INACTIVE" || hasRevokedPermitHistory(applications);
}

function buildBusinessInfo(row: any): BusinessInfo {
  return {
    businessType: row.businessType as BusinessInfo["businessType"],
    registrationNumber: row.registrationNumber,
    paymentFrequency: "ANNUAL",
    tin: tinFromDb(row.tin),
    businessName: row.businessName,
    tradeName: row.tradeName,
    ownerName: row.ownerName,
    sex: row.sex ?? undefined,
    nationality: row.nationality,
    email: row.email,
    phone: row.phone,
    country: row.country ?? undefined,
    countryCode: row.countryCode ?? undefined,
    province: row.province ?? undefined,
    provinceCode: row.provinceCode ?? undefined,
    cityMunicipality: row.cityMunicipality ?? undefined,
    streetAddress: row.streetAddress ?? undefined,
    mainOfficeCountry: row.mainOfficeCountry ?? undefined,
    mainOfficeCountryCode: row.mainOfficeCountryCode ?? undefined,
    mainOfficeProvince: row.mainOfficeProvince ?? undefined,
    mainOfficeProvinceCode: row.mainOfficeProvinceCode ?? undefined,
    mainOfficeCityMunicipality: row.mainOfficeCityMunicipality ?? undefined,
    mainOfficeStreetAddress: row.mainOfficeStreetAddress ?? undefined,
    mainOfficeBarangay: row.mainOfficeBarangay ?? undefined,
    mainOfficeAddress: row.mainOfficeAddress,
    businessAddress: row.businessAddress,
    businessLatitude: row.location?.latitude ?? null,
    businessLongitude: row.location?.longitude ?? null,
    businessBarangay: row.businessBarangay ?? undefined,
    businessStreetAddress: row.businessStreetAddress ?? undefined,
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
    taxIncentives: row.taxIncentives ?? "",
    businessActivity: row.businessActivity ?? "",
    lineOfBusiness: row.lineOfBusiness ?? "",
    assetSize: optionalDecimalFromDb(row.assetSize),
    isMarket: Boolean(row.isMarket),
    isAgriculture: Boolean(row.isAgriculture),
    isLiquorOrTobacco: Boolean(row.isLiquorOrTobacco),
    ownerFirstName: row.ownerFirstName ?? undefined,
    ownerMiddleName: row.ownerMiddleName ?? undefined,
    ownerSurname: row.ownerSurname ?? undefined,
    birthDate: row.birthDate ?? undefined,
    ownerAge: row.ownerAge ?? undefined,
    capitalInvestment: row.capitalInvestment ?? undefined,
    grossProfit: row.grossProfit ?? undefined,
    barangay: row.barangay ?? undefined,
    businessOperationType: row.businessOperationType ?? undefined,
  };
}

function isComplianceForcedClosureInspection(inspection: {
  nonComplianceType: string | null;
  complianceCaseStatus: string;
  forcedClosure: boolean;
}): boolean {
  return (
    inspection.nonComplianceType === "GOVERNMENT_AGENCY_RELATED" &&
    (inspection.forcedClosure || FORCED_CLOSURE_STATUSES.has(inspection.complianceCaseStatus))
  );
}

function getComplianceForcedClosureReason(): string {
  return "This business requires closure processing because of a compliance-related restriction.";
}

function pickBlockingInspection(inspections: BusinessSnapshot["inspections"]): BusinessSnapshot["inspections"][number] | null {
  const candidates = inspections
    .filter((inspection) => inspection.nonComplianceType === "GOVERNMENT_AGENCY_RELATED")
    .filter((inspection) => inspection.forcedClosure || FORCED_CLOSURE_STATUSES.has(inspection.complianceCaseStatus))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  return candidates[0] ?? null;
}

type BusinessSnapshot = {
  businessStatus: "ACTIVE" | "INACTIVE" | "CLOSED";
  location: { status: string | null } | null;
  applications: Array<{ status: string }>;
  inspections: Array<{
    inspectionId: string;
    nonComplianceType: string | null;
    complianceCaseStatus: string;
    forcedClosure: boolean;
    createdAt: Date;
  }>;
};

function getEligibility(snapshot: BusinessSnapshot): ClosureEligibilityResult {
  if (snapshot.businessStatus === "CLOSED") {
    return {
      eligible: false,
      isComplianceForcedClosure: false,
      reasonCode: "BUSINESS_CLOSED",
      userFriendlyReason: "This business is already closed and cannot be submitted for closure again.",
      blockingInspectionId: null,
      complianceCaseStatus: null,
      nonComplianceType: null,
    };
  }

  const blockingInspection = pickBlockingInspection(snapshot.inspections);
  if (blockingInspection) {
    return {
      eligible: true,
      isComplianceForcedClosure: true,
      reasonCode: "COMPLIANCE_FORCED_CLOSURE",
      userFriendlyReason: getComplianceForcedClosureReason(),
      blockingInspectionId: blockingInspection.inspectionId,
      complianceCaseStatus: blockingInspection.complianceCaseStatus,
      nonComplianceType: blockingInspection.nonComplianceType,
    };
  }

  // Revoked permits cannot be renewed, but the business must still be closable.
  if (resolveHasRevokedPermit(snapshot.businessStatus, snapshot.applications)) {
    return {
      eligible: true,
      isComplianceForcedClosure: false,
      reasonCode: "REVOKED_PERMIT_CLOSURE",
      userFriendlyReason: null,
      blockingInspectionId: null,
      complianceCaseStatus: null,
      nonComplianceType: null,
    };
  }

  const hasVerifiedLocation = snapshot.location?.status === "VERIFIED";
  const eligibleHistory = hasEligibleHistory(snapshot.applications);

  if (!hasVerifiedLocation && !eligibleHistory) {
    return {
      eligible: false,
      isComplianceForcedClosure: false,
      reasonCode: "EXISTING_CLOSURE_RULE_FAILED",
      userFriendlyReason:
        "Selected business record is not yet eligible for closure. Complete business verification first.",
      blockingInspectionId: null,
      complianceCaseStatus: null,
      nonComplianceType: null,
    };
  }

  return {
    eligible: true,
    isComplianceForcedClosure: false,
    reasonCode: null,
    userFriendlyReason: null,
    blockingInspectionId: null,
    complianceCaseStatus: null,
    nonComplianceType: null,
  };
}

export function isComplianceForcedClosureBusiness(snapshot: BusinessSnapshot): boolean {
  return getEligibility(snapshot).isComplianceForcedClosure;
}

export function getClosureBusinessReason(snapshot: BusinessSnapshot): string | null {
  return getEligibility(snapshot).userFriendlyReason;
}

/** Exported for unit tests and shared callers that need the full eligibility result. */
export function evaluateClosureEligibility(snapshot: BusinessSnapshot): ClosureEligibilityResult {
  return getEligibility(snapshot);
}

export async function resolveClosureEligibilityForBusiness(
  applicantId: string,
  businessRecordId: string
): Promise<ClosureEligibilityResult> {
  const row = await prisma.businessRecord.findFirst({
    where: {
      businessRecordId,
      applicantId,
    },
    include: {
      location: {
        select: {
          status: true,
          latitude: true,
          longitude: true,
        },
      },
      applications: {
        where: {
          status: {
            in: [...CLOSURE_APPLICATION_STATUSES],
          },
        },
        select: {
          status: true,
        },
      },
      inspections: {
        select: {
          inspectionId: true,
          nonComplianceType: true,
          complianceCaseStatus: true,
          forcedClosure: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!row) {
    return {
      eligible: false,
      isComplianceForcedClosure: false,
      reasonCode: "EXISTING_CLOSURE_RULE_FAILED",
      userFriendlyReason: "Selected business record was not found for this applicant.",
      blockingInspectionId: null,
      complianceCaseStatus: null,
      nonComplianceType: null,
    };
  }

  return getEligibility({
    businessStatus: row.businessStatus as BusinessSnapshot["businessStatus"],
    location: row.location,
    applications: row.applications,
    inspections: row.inspections,
  });
}

export async function listClosureEligibleBusinesses(applicantId: string): Promise<{
  records: ClosureBusinessRecordRow[];
  complianceForcedRecords: ClosureBusinessRecordRow[];
}> {
  const rows = await prisma.businessRecord.findMany({
    where: {
      applicantId,
      businessStatus: {
        in: ["ACTIVE", "INACTIVE"],
      },
    },
    include: {
      location: {
        select: {
          status: true,
          latitude: true,
          longitude: true,
        },
      },
      applications: {
        where: {
          status: {
            in: [...CLOSURE_APPLICATION_STATUSES],
          },
        },
        select: {
          status: true,
        },
      },
      inspections: {
        select: {
          inspectionId: true,
          nonComplianceType: true,
          complianceCaseStatus: true,
          forcedClosure: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const records = rows.map((row: any) => {
    const closureEligibility = getEligibility({
      businessStatus: row.businessStatus,
      location: row.location,
      applications: row.applications,
      inspections: row.inspections,
    });

    return {
      id: row.businessRecordId,
      registrationNumber: row.registrationNumber,
      businessName: row.businessName,
      businessStatus: row.businessStatus as "ACTIVE" | "INACTIVE" | "CLOSED",
      hasRevokedPermit: resolveHasRevokedPermit(row.businessStatus, row.applications),
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      businessInfo: buildBusinessInfo(row),
      closureEligibility,
    };
  });

  return {
    records: records.filter((record) => record.closureEligibility.eligible),
    complianceForcedRecords: records.filter((record) => record.closureEligibility.isComplianceForcedClosure),
  };
}
