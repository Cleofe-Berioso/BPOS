import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { listActivePermittedBusinessLocations } from "@/lib/business-location";
import { getJitInspectionCycleStartedAt } from "@/lib/jit-settings";

type JitInspectionStatus = "COMPLIANT" | "NON_COMPLIANT" | "REVOCATION_REVIEW" | "REVOCATION_DENIED" | "REVOKED";

const FLAGGED_STATUSES: JitInspectionStatus[] = ["NON_COMPLIANT", "REVOCATION_REVIEW", "REVOKED"];
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
  flaggedBusinessesCount: number;
  compliantCount: number;
  nonCompliantCount: number;
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
  if (status === "REVOCATION_DENIED") {
    return "VERIFIED_COMPLIANT";
  }

  if (status === "DH_VERIFICATION_PENDING" || status === "VERIFIED_COMPLIANT" || status === "VERIFIED_NON_COMPLIANT") {
    return status;
  }

  if (status === "REVOCATION_REVIEW" || status === "REVOKED") {
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

  const cycleStartedAt = await getJitInspectionCycleStartedAt();

  const inspections = await prisma.inspection.findMany({
    where: {
      businessRecordId: { in: businessRecordIds },
      ...(cycleStartedAt
        ? {
            OR: [
              { createdAt: { gte: cycleStartedAt } },
              { status: "REVOKED" },
              { revocationDecision: "APPROVED" },
              { complianceCaseStatus: { in: ["FORCED_CLOSURE_PENDING", "EXPIRED_UNSETTLED"] } },
              { forcedClosure: true },
            ],
          }
        : {}),
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
    flaggedBusinessesCount: 0,
    compliantCount: 0,
    nonCompliantCount: 0,
  };
}

const getCachedJitDashboardSummary = cache(async (): Promise<JitDashboardSummary> => {
  const businesses = await listActivePermittedBusinessLocations();
  const businessRecordIds = businesses.map((row) => row.businessRecordId);

  if (businessRecordIds.length === 0) {
    return getEmptySummary();
  }

  const cycleStartedAt = await getJitInspectionCycleStartedAt();

  const inspections = await prisma.inspection.findMany({
    where: {
      businessRecordId: {
        in: businessRecordIds,
      },
      ...(cycleStartedAt
        ? {
            OR: [
              { createdAt: { gte: cycleStartedAt } },
              { status: "REVOKED" },
              { revocationDecision: "APPROVED" },
              { complianceCaseStatus: { in: ["FORCED_CLOSURE_PENDING", "EXPIRED_UNSETTLED"] } },
              { forcedClosure: true },
            ],
          }
        : {}),
    },
    select: {
      inspectionId: true,
      businessRecordId: true,
      status: true,
      complianceStatus: true,
      createdAt: true,
      updatedAt: true,
      isSettled: true,
      complianceCaseStatus: true,
      revocationSettledAt: true,
      revocationDecision: true,
      forcedClosure: true,
    },
    orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
  });

  const latestByBusiness = new Map<
    string,
    {
      status: string;
      complianceStatus: string | null;
      isSettled: boolean;
      complianceCaseStatus: string | null;
      revocationSettledAt: Date | null;
      revocationDecision?: string | null;
      forcedClosure?: boolean | null;
    }
  >();

  for (const inspection of inspections) {
    if (!latestByBusiness.has(inspection.businessRecordId)) {
      latestByBusiness.set(inspection.businessRecordId, {
        status: inspection.status,
        complianceStatus: inspection.complianceStatus,
        isSettled: Boolean(inspection.isSettled),
        complianceCaseStatus: inspection.complianceCaseStatus ?? null,
        revocationSettledAt: inspection.revocationSettledAt,
        revocationDecision: inspection.revocationDecision ?? null,
        forcedClosure: Boolean(inspection.forcedClosure),
      });
    }
  }

  const inspectionSummary = inspections.length;

  let compliantCount = 0;
  let flaggedBusinessesCount = 0;
  let nonCompliantCount = 0;

  for (const row of businesses) {
    const latest = latestByBusiness.get(row.businessRecordId);
    if (!latest) {
      continue;
    }

    const s = (latest.status || "").toUpperCase();
    const cs = (latest.complianceStatus || "").toUpperCase();

    const isSettled =
      latest.isSettled === true ||
      latest.complianceCaseStatus === "SETTLED" ||
      latest.revocationDecision === "DENIED" ||
      s === "REVOCATION_DENIED" ||
      Boolean(latest.revocationSettledAt);

    const isRevokedOrRestricted =
      s === "REVOKED" ||
      latest.revocationDecision === "APPROVED" ||
      latest.forcedClosure === true ||
      latest.complianceCaseStatus === "FORCED_CLOSURE_PENDING" ||
      latest.complianceCaseStatus === "EXPIRED_UNSETTLED";

    if (isRevokedOrRestricted) {
      flaggedBusinessesCount++;
      continue;
    }

    if (isSettled) {
      compliantCount++;
      continue;
    }

    if (s === "COMPLIANT" || s === "VERIFIED_COMPLIANT" || cs === "COMPLIANT") {
      if (s !== "NON_COMPLIANT" && s !== "VERIFIED_NON_COMPLIANT" && s !== "REVOCATION_REVIEW") {
        compliantCount++;
        continue;
      }
    }

    if (s === "NON_COMPLIANT" || s === "VERIFIED_NON_COMPLIANT" || s === "REVOCATION_REVIEW" || cs === "NON_COMPLIANT") {
      flaggedBusinessesCount++;
      nonCompliantCount++;
    }
  }

  return {
    visibleBusinessCount: businesses.length,
    inspectionSummary,
    flaggedBusinessesCount,
    compliantCount,
    nonCompliantCount,
  };
});

export async function getJitDashboardSummary() {
  return getCachedJitDashboardSummary();
}

export async function getJitDashboardMetrics(): Promise<JitDashboardMetrics> {
  return getCachedJitDashboardMetrics();
}