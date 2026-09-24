import { prisma } from "@/lib/prisma";
import type { BusinessInfo } from "@/lib/applicant-types";
import {
  optionalDecimalFromDb,
  optionalIntFromDb,
  tinFromDb,
} from "@/lib/business-rules";

export type RenewalBlockReasonCode =
  | "UNRESOLVED_GOVERNMENT_COMPLIANCE"
  | "EXPIRED_UNSETTLED_COMPLIANCE"
  | "FORCED_CLOSURE_PENDING"
  | "CLOSED_NON_COMPLIANT"
  | "BUSINESS_CLOSED"
  | "EXISTING_RENEWAL_RULE_FAILED";

export interface RenewalEligibilityResult {
  eligible: boolean;
  reasonCode: RenewalBlockReasonCode | null;
  userFriendlyReason: string | null;
  blockingInspectionId: string | null;
  complianceCaseStatus: string | null;
  nonComplianceType: string | null;
}

export interface RenewalBusinessRecordRow {
  id: string;
  registrationNumber: string;
  businessName: string;
  businessStatus: "ACTIVE" | "INACTIVE" | "CLOSED";
  hasRevokedPermit: boolean;
  closedAt: string | null;
  businessInfo: BusinessInfo;
  renewalEligibility: RenewalEligibilityResult;
}

type BusinessSnapshot = {
  id: string;
  registrationNumber: string;
  businessName: string;
  businessStatus: "ACTIVE" | "INACTIVE" | "CLOSED";
  closedAt: Date | null;
  hasRevokedPermit: boolean;
  location: { status: string | null } | null;
  applications: Array<{ status: string }>;
  inspections: Array<{
    inspectionId: string;
    nonComplianceType: string | null;
    violationSeverity: string | null;
    isSettled: boolean;
    forcedClosure: boolean;
    complianceCaseStatus: string;
    createdAt: Date;
  }>;
  businessInfo: BusinessInfo;
};

type EligibleExistingBusinessStatus = "PAID" | "FOR_RELEASE" | "RELEASED";

const ELIGIBLE_EXISTING_BUSINESS_STATUSES: EligibleExistingBusinessStatus[] = [
  "PAID",
  "FOR_RELEASE",
  "RELEASED",
];
const BLOCKED_COMPLIANCE_STATUSES = new Set([
  "FLAGGED_UNSETTLED",
  "EXPIRED_UNSETTLED",
  "FORCED_CLOSURE_PENDING",
  "CLOSED_NON_COMPLIANT",
]);

const BLOCKED_REASON_MESSAGES: Record<RenewalBlockReasonCode, string> = {
  UNRESOLVED_GOVERNMENT_COMPLIANCE:
    "This business has an unresolved compliance case. Please wait for Department Head settlement before renewing.",
  EXPIRED_UNSETTLED_COMPLIANCE:
    "This business has an expired unresolved compliance case and cannot be renewed.",
  FORCED_CLOSURE_PENDING:
    "This business is marked for closure processing and cannot be renewed.",
  CLOSED_NON_COMPLIANT:
    "This business is closed due to unresolved compliance and cannot be renewed.",
  BUSINESS_CLOSED: "This business is already closed or inactive and cannot be renewed.",
  EXISTING_RENEWAL_RULE_FAILED:
    "Selected business record is not yet eligible for renewal. Complete business verification first.",
};

function isEligibleHistoryStatus(status: string): boolean {
  return ELIGIBLE_EXISTING_BUSINESS_STATUSES.includes(status as EligibleExistingBusinessStatus);
}

function getComplianceBlockReason(snapshot: BusinessSnapshot): RenewalEligibilityResult | null {
  const candidates = snapshot.inspections
    .filter((inspection) => inspection.nonComplianceType === "GOVERNMENT_AGENCY_RELATED")
    .filter((inspection) => {
      // Settled minor/major government cases must not block renewal.
      if (inspection.isSettled || inspection.complianceCaseStatus === "SETTLED") {
        return false;
      }
      if (inspection.forcedClosure) return true;
      return BLOCKED_COMPLIANCE_STATUSES.has(inspection.complianceCaseStatus);
    })
    .sort((left, right) => {
      const rank = (inspection: BusinessSnapshot["inspections"][number]) => {
        if (inspection.forcedClosure || inspection.complianceCaseStatus === "FORCED_CLOSURE_PENDING") return 4;
        if (inspection.complianceCaseStatus === "CLOSED_NON_COMPLIANT") return 3;
        if (inspection.complianceCaseStatus === "EXPIRED_UNSETTLED") return 2;
        return 1;
      };

      const diff = rank(right) - rank(left);
      if (diff !== 0) return diff;
      return right.createdAt.getTime() - left.createdAt.getTime();
    });

  const blockingInspection = candidates[0];
  if (!blockingInspection) return null;

  const reasonCode: RenewalBlockReasonCode =
    blockingInspection.complianceCaseStatus === "EXPIRED_UNSETTLED"
      ? "EXPIRED_UNSETTLED_COMPLIANCE"
      : blockingInspection.complianceCaseStatus === "CLOSED_NON_COMPLIANT"
        ? "CLOSED_NON_COMPLIANT"
        : blockingInspection.forcedClosure ||
            blockingInspection.complianceCaseStatus === "FORCED_CLOSURE_PENDING"
          ? "FORCED_CLOSURE_PENDING"
          : "UNRESOLVED_GOVERNMENT_COMPLIANCE";

  return {
    eligible: false,
    reasonCode,
    userFriendlyReason: BLOCKED_REASON_MESSAGES[reasonCode],
    blockingInspectionId: blockingInspection.inspectionId,
    complianceCaseStatus: blockingInspection.complianceCaseStatus,
    nonComplianceType: blockingInspection.nonComplianceType,
  };
}

export function getBusinessRenewalBlockReason(snapshot: BusinessSnapshot): RenewalEligibilityResult {
  if (snapshot.businessStatus !== "ACTIVE") {
    return {
      eligible: false,
      reasonCode: "BUSINESS_CLOSED",
      userFriendlyReason: BLOCKED_REASON_MESSAGES.BUSINESS_CLOSED,
      blockingInspectionId: null,
      complianceCaseStatus: null,
      nonComplianceType: null,
    };
  }

  const complianceBlock = getComplianceBlockReason(snapshot);
  if (complianceBlock) return complianceBlock;

  const hasVerifiedLocation = snapshot.location?.status === "VERIFIED";
  const hasEligibleHistory = snapshot.applications.some((application) => isEligibleHistoryStatus(application.status));

  if (!hasVerifiedLocation && !hasEligibleHistory) {
    return {
      eligible: false,
      reasonCode: "EXISTING_RENEWAL_RULE_FAILED",
      userFriendlyReason: BLOCKED_REASON_MESSAGES.EXISTING_RENEWAL_RULE_FAILED,
      blockingInspectionId: null,
      complianceCaseStatus: null,
      nonComplianceType: null,
    };
  }

  return {
    eligible: true,
    reasonCode: null,
    userFriendlyReason: null,
    blockingInspectionId: null,
    complianceCaseStatus: null,
    nonComplianceType: null,
  };
}

async function loadRenewalBusinessSnapshot(applicantId: string, businessRecordId: string): Promise<BusinessSnapshot | null> {
  const row: any = await prisma.businessRecord.findFirst({
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
            in: ELIGIBLE_EXISTING_BUSINESS_STATUSES,
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
          violationSeverity: true,
          isSettled: true,
          forcedClosure: true,
          complianceCaseStatus: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.businessRecordId,
    registrationNumber: row.registrationNumber,
    businessName: row.businessName,
    businessStatus: row.businessStatus as BusinessSnapshot["businessStatus"],
    closedAt: row.closedAt,
    hasRevokedPermit: row.businessStatus === "INACTIVE",
    location: row.location,
    applications: row.applications,
    inspections: row.inspections,
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
      taxIncentives: row.taxIncentives ?? "",
      businessActivity: row.businessActivity ?? "",
      lineOfBusiness: row.lineOfBusiness ?? "",
      assetSize: optionalDecimalFromDb(row.assetSize),
      isMarket: Boolean(row.isMarket),
      isAgriculture: Boolean(row.isAgriculture),
      isLiquorOrTobacco: Boolean((row as any).isLiquorOrTobacco),
    },
  };
}

export async function resolveRenewalEligibilityForBusiness(
  applicantId: string,
  businessRecordId: string
): Promise<RenewalEligibilityResult> {
  const snapshot = await loadRenewalBusinessSnapshot(applicantId, businessRecordId);
  if (!snapshot) {
    return {
      eligible: false,
      reasonCode: "EXISTING_RENEWAL_RULE_FAILED",
      userFriendlyReason: "Selected business record was not found for this applicant.",
      blockingInspectionId: null,
      complianceCaseStatus: null,
      nonComplianceType: null,
    };
  }

  return getBusinessRenewalBlockReason(snapshot);
}

export async function listRenewalEligibleBusinesses(applicantId: string): Promise<{
  records: RenewalBusinessRecordRow[];
  blockedRecords: RenewalBusinessRecordRow[];
}> {
  const rows: any[] = await prisma.businessRecord.findMany({
    where: { applicantId },
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
            in: ELIGIBLE_EXISTING_BUSINESS_STATUSES,
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
          violationSeverity: true,
          isSettled: true,
          forcedClosure: true,
          complianceCaseStatus: true,
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
    const snapshot: BusinessSnapshot = {
      id: row.businessRecordId,
      registrationNumber: row.registrationNumber,
      businessName: row.businessName,
      businessStatus: row.businessStatus,
      closedAt: row.closedAt,
      hasRevokedPermit: row.businessStatus === "INACTIVE",
      location: row.location,
      applications: row.applications,
      inspections: row.inspections,
      businessInfo: {
        businessType: row.businessType,
        registrationNumber: row.registrationNumber,
        paymentFrequency: "ANNUAL",
        tin: tinFromDb(row.tin),
        businessName: row.businessName,
        tradeName: row.tradeName,
        ownerName: row.ownerName,
        ownerFirstName: row.ownerFirstName ?? "",
        ownerMiddleName: row.ownerMiddleName ?? "",
        ownerSurname: row.ownerLastName ?? "",
        ownerSuffix: row.ownerSuffix ?? "",
        sex: row.sex ?? "",
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
        propertyOwnership: row.propertyOwnership ?? "Owned",
        taxDeclarationNumber: row.taxDeclarationNumber ?? "",
        propertyIdentificationNumber: row.propertyIdentificationNumber ?? "",
        taxIncentives: row.taxIncentives ?? "",
        businessActivity: row.businessActivity ?? "",
        lineOfBusiness: row.lineOfBusiness ?? "",
        assetSize: optionalDecimalFromDb(row.assetSize),
        isMarket: Boolean(row.isMarket),
        isAgriculture: Boolean(row.isAgriculture),
        isLiquorOrTobacco: Boolean(row.isLiquorOrTobacco),
      },
    };

    return {
      id: row.businessRecordId,
      registrationNumber: row.registrationNumber,
      businessName: row.businessName,
      businessStatus: row.businessStatus as "ACTIVE" | "INACTIVE" | "CLOSED",
      hasRevokedPermit: row.businessStatus === "INACTIVE",
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      businessInfo: snapshot.businessInfo,
      renewalEligibility: getBusinessRenewalBlockReason(snapshot),
    };
  });

  return {
    records: records.filter((record) => record.renewalEligibility.eligible),
    blockedRecords: records.filter((record) => !record.renewalEligibility.eligible),
  };
}
