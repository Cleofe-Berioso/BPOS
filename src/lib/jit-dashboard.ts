import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { listActivePermittedBusinessLocations } from "@/lib/business-location";

type JitInspectionStatus = "COMPLIANT" | "NON_COMPLIANT" | "REVOCATION_REVIEW" | "REVOCATION_DENIED" | "REVOKED";

const FLAGGED_STATUSES: JitInspectionStatus[] = ["NON_COMPLIANT", "REVOCATION_REVIEW", "REVOKED"];
const HIGH_RISK_STATUSES: JitInspectionStatus[] = ["NON_COMPLIANT", "REVOCATION_REVIEW"];
const NON_COMPLIANT_RECORD_STATUSES: JitInspectionStatus[] = ["NON_COMPLIANT", "REVOCATION_REVIEW"];

type JitInspectionCurrentStatus =
  | "DH_VERIFICATION_PENDING"
  | "VERIFIED_COMPLIANT"
  | "VERIFIED_NON_COMPLIANT"
  | "REVOCATION_REVIEW"
  | "REVOCATION_DENIED"
  | "REVOKED"
  | "COMPLIANT"
  | "NON_COMPLIANT";

export interface JitDashboardSummary {
  visibleBusinessCount: number;
  inspectionSummary: number;
  highRiskCount: number;
  flaggedBusinessesCount: number;
  compliantCount: number;
  nonCompliantCount: number;
  highRiskBusinessCount: number;
  mediumRiskBusinessCount: number;
  lowRiskBusinessCount: number;
}

export interface JitDashboardMetrics {
  inspectionResultsDistribution: Array<{ name: string; value: number }>;
  inspectionsConductedPerWeek: Array<{ label: string; value: number }>;
  violationsByBusinessType: Array<{
    label: string;
    nonCompliant: number;
    verifiedNonCompliant: number;
  }>;
  locationSummary: {
    totalInspectionLocations: number;
    barangayCounts: Array<{ label: string; value: number }>;
  };
}

function toWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - day + 1);
  return utc.toISOString().slice(0, 10);
}

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${month}/${day}`;
}

function resolveInspectionClassification(status: string, complianceStatus: string): JitInspectionCurrentStatus {
  if (status === "DH_VERIFICATION_PENDING" || status === "VERIFIED_COMPLIANT" || status === "VERIFIED_NON_COMPLIANT") {
    return status;
  }

  if (status === "REVOCATION_REVIEW" || status === "REVOCATION_DENIED" || status === "REVOKED") {
    return status;
  }

  // PENDING_REVIEW inspections count as pending for DH verification
  if (complianceStatus === "PENDING_REVIEW") return "DH_VERIFICATION_PENDING";
  if (complianceStatus === "COMPLIANT") return "COMPLIANT";
  return "NON_COMPLIANT";
}

const getCachedJitDashboardMetrics = cache(async (): Promise<JitDashboardMetrics> => {
  const businesses = await listActivePermittedBusinessLocations();
  const businessRecordIds = businesses.map((row) => row.businessRecordId);

  if (businessRecordIds.length === 0) {
    return {
      inspectionResultsDistribution: [],
      inspectionsConductedPerWeek: [],
      violationsByBusinessType: [],
      locationSummary: {
        totalInspectionLocations: 0,
        barangayCounts: [],
      },
    };
  }

  const inspections = await prisma.inspection.findMany({
    where: {
      businessRecordId: { in: businessRecordIds },
      inspector: { role: "JIT" },
    },
    select: {
      status: true,
      complianceStatus: true,
      createdAt: true,
      businessRecord: {
        select: {
          businessType: true,
          location: {
            select: {
              barangay: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const inspectionResultsDistribution = {
    compliant: 0,
    nonCompliant: 0,
    pending: 0,
  };

  const now = new Date();
  const weekBuckets = new Map<string, number>();
  const weekCount = 12;
  for (let index = weekCount - 1; index >= 0; index--) {
    const reference = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - index * 7));
    weekBuckets.set(toWeekKey(reference), 0);
  }

  const businessTypeMap = new Map<string, { nonCompliant: number; verifiedNonCompliant: number }>();

  for (const inspection of inspections) {
    const classification = resolveInspectionClassification(inspection.status, inspection.complianceStatus);

    if (classification === "DH_VERIFICATION_PENDING") {
      inspectionResultsDistribution.pending += 1;
    } else if (classification === "VERIFIED_COMPLIANT" || classification === "COMPLIANT") {
      inspectionResultsDistribution.compliant += 1;
    } else {
      inspectionResultsDistribution.nonCompliant += 1;
    }

    // Exact inspection timestamp is not separately modeled. Use createdAt as the safest available timestamp.
    const weekKey = toWeekKey(inspection.createdAt);
    if (weekBuckets.has(weekKey)) {
      weekBuckets.set(weekKey, (weekBuckets.get(weekKey) ?? 0) + 1);
    }

    const businessType = inspection.businessRecord.businessType?.trim() || "Unspecified Business Type";
    if (!businessTypeMap.has(businessType)) {
      businessTypeMap.set(businessType, { nonCompliant: 0, verifiedNonCompliant: 0 });
    }

    const typeBucket = businessTypeMap.get(businessType)!;
    if (inspection.complianceStatus === "NON_COMPLIANT") {
      typeBucket.nonCompliant += 1;
    }
    if (inspection.status === "VERIFIED_NON_COMPLIANT" || inspection.status === "REVOCATION_REVIEW" || inspection.status === "REVOCATION_DENIED" || inspection.status === "REVOKED") {
      typeBucket.verifiedNonCompliant += 1;
    }
  }

  const barangayCounts = new Map<string, number>();
  for (const business of businesses) {
    const barangay = business.barangay?.trim() || "Unspecified Barangay";
    if (barangay === "Unspecified Barangay") continue;
    barangayCounts.set(barangay, (barangayCounts.get(barangay) ?? 0) + 1);
  }

  return {
    inspectionResultsDistribution: [
      { name: "Compliant", value: inspectionResultsDistribution.compliant },
      { name: "Non-compliant / Flagged", value: inspectionResultsDistribution.nonCompliant },
      { name: "Pending DH Verification", value: inspectionResultsDistribution.pending },
    ],
    inspectionsConductedPerWeek: Array.from(weekBuckets.entries()).map(([week, value]) => ({
      label: formatShortDate(week),
      value,
    })),
    violationsByBusinessType: Array.from(businessTypeMap.entries()).map(([label, bucket]) => ({
      label,
      nonCompliant: bucket.nonCompliant,
      verifiedNonCompliant: bucket.verifiedNonCompliant,
    })),
    locationSummary: {
      totalInspectionLocations: businesses.length,
      barangayCounts: Array.from(barangayCounts.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value),
    },
  };
});

function getEmptySummary(visibleBusinessCount = 0): JitDashboardSummary {
  return {
    visibleBusinessCount,
    inspectionSummary: 0,
    highRiskCount: 0,
    flaggedBusinessesCount: 0,
    compliantCount: 0,
    nonCompliantCount: 0,
    highRiskBusinessCount: 0,
    mediumRiskBusinessCount: 0,
    lowRiskBusinessCount: 0,
  };
}

const getCachedJitDashboardSummary = cache(async (): Promise<JitDashboardSummary> => {
  const businesses = await listActivePermittedBusinessLocations();
  const businessRecordIds = businesses.map((row) => row.businessRecordId);

  if (businessRecordIds.length === 0) {
    return getEmptySummary();
  }

  const inspections = await prisma.inspection.findMany({
    where: {
      businessRecordId: {
        in: businessRecordIds,
      },
      inspector: {
        role: "JIT",
      },
    },
    select: {
      businessRecordId: true,
      status: true,
      createdAt: true,
    },
    orderBy: [{ businessRecordId: "asc" }, { createdAt: "desc" }],
  });

  const latestByBusiness = new Map<string, JitInspectionStatus>();
  const inspectionCountByBusiness = new Map<string, number>();
  const flaggedHistoryByBusiness = new Set<string>();

  for (const inspection of inspections) {
    const status = inspection.status as JitInspectionStatus;

    inspectionCountByBusiness.set(inspection.businessRecordId, (inspectionCountByBusiness.get(inspection.businessRecordId) ?? 0) + 1);

    if (!latestByBusiness.has(inspection.businessRecordId)) {
      latestByBusiness.set(inspection.businessRecordId, status);
    }

    if (NON_COMPLIANT_RECORD_STATUSES.includes(status)) {
      flaggedHistoryByBusiness.add(inspection.businessRecordId);
    }
  }

  let highRiskBusinessCount = 0;
  let mediumRiskBusinessCount = 0;
  let lowRiskBusinessCount = 0;

  for (const businessRecordId of businessRecordIds) {
    const latestStatus = latestByBusiness.get(businessRecordId);
    const inspectionCount = inspectionCountByBusiness.get(businessRecordId) ?? 0;
    const hasFlaggedHistory = flaggedHistoryByBusiness.has(businessRecordId);

    if (!latestStatus) {
      lowRiskBusinessCount += 1;
      continue;
    }

    if (HIGH_RISK_STATUSES.includes(latestStatus)) {
      highRiskBusinessCount += 1;
      continue;
    }

    if (inspectionCount > 1 || hasFlaggedHistory) {
      mediumRiskBusinessCount += 1;
    } else {
      lowRiskBusinessCount += 1;
    }
  }

  const inspectionSummary = inspections.length;
  const highRiskCount = businesses.filter((row) => HIGH_RISK_STATUSES.includes(latestByBusiness.get(row.businessRecordId) ?? "COMPLIANT")).length;
  const flaggedBusinessesCount = businesses.filter((row) => FLAGGED_STATUSES.includes(latestByBusiness.get(row.businessRecordId) ?? "COMPLIANT")).length;
  const compliantCount = businesses.filter((row) => latestByBusiness.get(row.businessRecordId) === "COMPLIANT").length;
  const nonCompliantCount = inspections.filter((inspection) => NON_COMPLIANT_RECORD_STATUSES.includes(inspection.status as JitInspectionStatus)).length;

  return {
    visibleBusinessCount: businesses.length,
    inspectionSummary,
    highRiskCount,
    flaggedBusinessesCount,
    compliantCount,
    nonCompliantCount,
    highRiskBusinessCount,
    mediumRiskBusinessCount,
    lowRiskBusinessCount,
  };
});

export async function getJitDashboardSummary() {
  return getCachedJitDashboardSummary();
}

export async function getJitDashboardMetrics(): Promise<JitDashboardMetrics> {
  return getCachedJitDashboardMetrics();
}