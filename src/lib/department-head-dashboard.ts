import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { resolveLocationBarangay } from "@/lib/business-location";

export interface DepartmentHeadDashboardSummary {
  pendingApplicationApprovals: number;
  pendingFlaggedCases: number;
  businessesUnderRestriction: number;
  revocationRecommendations: number;
}

export interface DepartmentHeadDashboardMetrics {
  evaluationDecisionsOverview: Array<{ name: string; value: number }>;
  applicationsAwaitingEvaluation: Array<{ label: string; value: number }>;
  complianceActionsTrend: Array<{
    label: string;
    verifiedCompliant: number;
    verifiedNonCompliant: number;
    revocationApproved: number;
    revocationDenied: number;
  }>;
  flaggedBusinessesByBarangay: Array<{ label: string; value: number }>;
}

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${month}/${day}`;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function initTrendBucket() {
  return {
    verifiedCompliant: 0,
    verifiedNonCompliant: 0,
    revocationApproved: 0,
    revocationDenied: 0,
  };
}

const getCachedDepartmentHeadDashboardSummary = cache(async (): Promise<DepartmentHeadDashboardSummary> => {
  const [
    pendingApplicationApprovals,
    pendingFlaggedCases,
    businessesUnderRestriction,
    revocationRecommendations,
  ] = await Promise.all([
    getPendingApplicationApprovalsCount(),
    getPendingFlaggedCasesCount(),
    getBusinessesUnderRestrictionCount(),
    getRevocationRecommendationsCount(),
  ]);

  return {
    pendingApplicationApprovals,
    pendingFlaggedCases,
    businessesUnderRestriction,
    revocationRecommendations,
  };
});

const getCachedDepartmentHeadDashboardMetrics = cache(async (): Promise<DepartmentHeadDashboardMetrics> => {
  const [
    decisionHistory,
    awaitingRows,
    complianceHistory,
    flaggedInspections,
  ] = await Promise.all([
    prisma.applicationHistory.findMany({
      where: {
        actorRole: "DEPARTMENT_HEAD",
        toStatus: {
          in: ["DEPARTMENT_HEAD_APPROVED", "RETURNED_FOR_CORRECTION", "REJECTED"],
        },
      },
      select: { toStatus: true },
    }),
    prisma.businessApplication.findMany({
      where: {
        status: "DEPARTMENT_HEAD_REVIEW",
      },
      select: { applicationType: true },
    }),
    prisma.applicationHistory.findMany({
      where: {
        actorRole: "DEPARTMENT_HEAD",
        OR: [
          { remarks: { contains: "verified COMPLIANT inspection" } },
          { remarks: { contains: "verified NON_COMPLIANT inspection" } },
          { remarks: { contains: "Revocation approved" } },
          { remarks: { contains: "Revocation denied" } },
        ],
      },
      select: {
        createdAt: true,
        remarks: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.inspection.findMany({
      where: {
        complianceStatus: "NON_COMPLIANT",
        decidedById: { not: null },
      },
      select: {
        businessRecord: {
          select: {
            location: {
              select: {
                barangay: true,
              },
            },
            applications: {
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: { formData: true },
            },
          },
        },
      },
    }),
  ]);

  const evaluationCounts = {
    approved: 0,
    returned: 0,
    rejected: 0,
  };

  for (const row of decisionHistory) {
    if (row.toStatus === "DEPARTMENT_HEAD_APPROVED") evaluationCounts.approved += 1;
    if (row.toStatus === "RETURNED_FOR_CORRECTION") evaluationCounts.returned += 1;
    if (row.toStatus === "REJECTED") evaluationCounts.rejected += 1;
  }

  const evaluationDecisionsOverview = [
    { name: "Approved", value: evaluationCounts.approved },
    { name: "Returned", value: evaluationCounts.returned },
    { name: "Rejected", value: evaluationCounts.rejected },
  ];

  const awaitingCounts = {
    NEW: 0,
    RENEWAL: 0,
    CLOSURE: 0,
  };
  for (const row of awaitingRows) {
    awaitingCounts[row.applicationType as "NEW" | "RENEWAL" | "CLOSURE"] += 1;
  }

  const applicationsAwaitingEvaluation = [
    { label: "New", value: awaitingCounts.NEW },
    { label: "Renewal", value: awaitingCounts.RENEWAL },
    { label: "Closure", value: awaitingCounts.CLOSURE },
  ];

  const now = new Date();
  const trendDays = 14;
  const trendBuckets = new Map<string, ReturnType<typeof initTrendBucket>>();
  for (let i = trendDays - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    trendBuckets.set(toDateKey(date), initTrendBucket());
  }

  for (const row of complianceHistory) {
    const key = toDateKey(row.createdAt);
    const bucket = trendBuckets.get(key);
    if (!bucket) continue;

    const remarks = (row.remarks ?? "").toLowerCase();
    if (remarks.includes("verified compliant inspection")) bucket.verifiedCompliant += 1;
    if (remarks.includes("verified non_compliant inspection") || remarks.includes("verified non-compliant inspection")) {
      bucket.verifiedNonCompliant += 1;
    }
    if (remarks.includes("revocation approved")) bucket.revocationApproved += 1;
    if (remarks.includes("revocation denied")) bucket.revocationDenied += 1;
  }

  const complianceActionsTrend = Array.from(trendBuckets.entries()).map(([date, bucket]) => ({
    label: formatShortDate(date),
    verifiedCompliant: bucket.verifiedCompliant,
    verifiedNonCompliant: bucket.verifiedNonCompliant,
    revocationApproved: bucket.revocationApproved,
    revocationDenied: bucket.revocationDenied,
  }));

  const barangayMap = new Map<string, number>();
  for (const row of flaggedInspections) {
    const label =
      resolveLocationBarangay(
        row.businessRecord.location?.barangay,
        row.businessRecord.applications[0]?.formData
      ) ?? "Unspecified Barangay";
    if (label === "Unspecified Barangay") continue;
    barangayMap.set(label, (barangayMap.get(label) ?? 0) + 1);
  }

  const flaggedBusinessesByBarangay = Array.from(barangayMap.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return {
    evaluationDecisionsOverview,
    applicationsAwaitingEvaluation,
    complianceActionsTrend,
    flaggedBusinessesByBarangay,
  };
});

/**
 * Get count of applications pending Department Head approval.
 * These are applications with status DEPARTMENT_HEAD_REVIEW.
 */
export async function getPendingApplicationApprovalsCount(): Promise<number> {
  const count = await prisma.businessApplication.count({
    where: {
      status: "DEPARTMENT_HEAD_REVIEW",
    },
  });
  return count;
}

/**
 * Get count of inspections in revocation review.
 * These are flagged cases waiting for Department Head decision.
 */
export async function getPendingFlaggedCasesCount(): Promise<number> {
  const count = await prisma.inspection.count({
    where: {
      status: "REVOCATION_REVIEW",
      revocationDecision: null,
    },
  });
  return count;
}

/**
 * Get count of businesses under restriction.
 * These are businesses with revoked permits (inspection status REVOKED with revocation decision APPROVED).
 */
export async function getBusinessesUnderRestrictionCount(): Promise<number> {
  const count = await prisma.inspection.count({
    where: {
      status: "REVOKED",
      revocationDecision: "APPROVED",
    },
  });
  return count;
}

/**
 * Get count of revocation recommendations.
 * These are non-compliant inspections awaiting revocation decision.
 */
export async function getRevocationRecommendationsCount(): Promise<number> {
  const count = await prisma.inspection.count({
    where: {
      status: "REVOCATION_REVIEW",
      revocationDecision: null,
    },
  });
  return count;
}

/**
 * Get all dashboard summary counts.
 */
export async function getDepartmentHeadDashboardSummary(): Promise<DepartmentHeadDashboardSummary> {
  return getCachedDepartmentHeadDashboardSummary();
}

export async function getDepartmentHeadDashboardMetrics(): Promise<DepartmentHeadDashboardMetrics> {
  return getCachedDepartmentHeadDashboardMetrics();
}
