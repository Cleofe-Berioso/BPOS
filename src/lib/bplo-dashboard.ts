import { cache } from "react";
import { prisma } from "@/lib/prisma";

type DbApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "DEPARTMENT_HEAD_REVIEW"
  | "DEPARTMENT_HEAD_APPROVED"
  | "ASSESSED"
  | "APPROVED_FOR_PAYMENT"
  | "PAID"
  | "FOR_RELEASE"
  | "RELEASED"
  | "REVOCATION_REVIEW"
  | "REVOKED"
  | "RETURNED_FOR_CORRECTION"
  | "REJECTED";

type ApplicationType = "NEW" | "RENEWAL" | "CLOSURE";

const TERMINAL_COMPLETION_STATUSES = ["RELEASED", "REJECTED"] as const;

export interface BploDashboardMetrics {
  applicationStatusDistribution: Array<{ name: string; value: number }>;
  applicationsProcessedPerDay: Array<{ label: string; value: number }>;
  processingTimeByApplicationType: Array<{ label: string; value: number }>;
  pendingQueueByStatus: Array<{
    queue: string;
    bploReview: number;
    assessment: number;
    paymentVerification: number;
    permitRelease: number;
  }>;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${month}/${day}`;
}

function emptyMetrics(): BploDashboardMetrics {
  return {
    applicationStatusDistribution: [],
    applicationsProcessedPerDay: [],
    processingTimeByApplicationType: [],
    pendingQueueByStatus: [],
  };
}

function resolveCompletionAt(row: {
  status: DbApplicationStatus;
  history: Array<{ createdAt: Date }>;
  permitIssuance: { releasedAt: Date | null } | null;
}): Date | null {
  if (row.history[0]?.createdAt) return row.history[0].createdAt;
  if (row.status === "RELEASED" && row.permitIssuance?.releasedAt) {
    return row.permitIssuance.releasedAt;
  }
  return null;
}

const getCachedBploDashboardMetrics = cache(async (): Promise<BploDashboardMetrics> => {
  try {
    return await loadBploDashboardMetrics();
  } catch (error) {
    console.error("[bplo-dashboard] metrics query failed", error);
    return emptyMetrics();
  }
});

async function loadBploDashboardMetrics(): Promise<BploDashboardMetrics> {
  const rows = await prisma.businessApplication.findMany({
    select: {
      status: true,
      applicationType: true,
      submittedAt: true,
      permitIssuance: {
        select: { releasedAt: true },
      },
      history: {
        where: { toStatus: { in: [...TERMINAL_COMPLETION_STATUSES] } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true, toStatus: true },
      },
    },
  });

  if (rows.length === 0) return emptyMetrics();

  const statusCount = {
    draft: 0,
    pendingUnderReview: 0,
    returned: 0,
    assessmentPayment: 0,
    paidForRelease: 0,
    released: 0,
    rejected: 0,
    revocation: 0,
  };

  const now = new Date();
  const dayRange = 14;
  const dayBuckets = new Map<string, number>();
  for (let i = dayRange - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    dayBuckets.set(dateKey(date), 0);
  }

  const typeAccumulator: Record<ApplicationType, { totalHours: number; count: number }> = {
    NEW: { totalHours: 0, count: 0 },
    RENEWAL: { totalHours: 0, count: 0 },
    CLOSURE: { totalHours: 0, count: 0 },
  };

  for (const row of rows) {
    const status = row.status as DbApplicationStatus;

    if (status === "DRAFT") statusCount.draft += 1;
    else if (status === "SUBMITTED" || status === "UNDER_REVIEW" || status === "DEPARTMENT_HEAD_REVIEW") {
      statusCount.pendingUnderReview += 1;
    } else if (status === "RETURNED_FOR_CORRECTION") {
      statusCount.returned += 1;
    } else if (status === "DEPARTMENT_HEAD_APPROVED" || status === "ASSESSED" || status === "APPROVED_FOR_PAYMENT") {
      statusCount.assessmentPayment += 1;
    } else if (status === "PAID" || status === "FOR_RELEASE") {
      statusCount.paidForRelease += 1;
    } else if (status === "RELEASED") {
      statusCount.released += 1;
    } else if (status === "REJECTED") {
      statusCount.rejected += 1;
    } else if (status === "REVOCATION_REVIEW" || status === "REVOKED") {
      statusCount.revocation += 1;
    }

    const completionAt = resolveCompletionAt({
      status,
      history: row.history,
      permitIssuance: row.permitIssuance,
    });

    if (completionAt) {
      const completedKey = dateKey(completionAt);
      if (dayBuckets.has(completedKey)) {
        dayBuckets.set(completedKey, (dayBuckets.get(completedKey) ?? 0) + 1);
      }
    }

    // True cycle time: submit → first RELEASED/REJECTED completion only.
    if (row.submittedAt && completionAt) {
      const hours = (completionAt.getTime() - row.submittedAt.getTime()) / (1000 * 60 * 60);
      if (hours >= 0) {
        const type = row.applicationType as ApplicationType;
        typeAccumulator[type].totalHours += hours;
        typeAccumulator[type].count += 1;
      }
    }
  }

  const applicationStatusDistribution = [
    { name: "Draft", value: statusCount.draft },
    { name: "Pending / Under Review", value: statusCount.pendingUnderReview },
    { name: "Returned", value: statusCount.returned },
    { name: "Assessment / For Payment", value: statusCount.assessmentPayment },
    { name: "Paid / For Release", value: statusCount.paidForRelease },
    { name: "Released", value: statusCount.released },
    { name: "Rejected", value: statusCount.rejected },
    { name: "Revocation", value: statusCount.revocation },
  ].filter((row) => row.value > 0);

  const applicationsProcessedPerDay = Array.from(dayBuckets.entries()).map(([iso, value]) => ({
    label: formatShortDate(iso),
    value,
  }));

  const processingTimeByApplicationType = [
    { label: "New", type: "NEW" as const },
    { label: "Renewal", type: "RENEWAL" as const },
    { label: "Closure", type: "CLOSURE" as const },
  ]
    .map((entry) => {
      const stats = typeAccumulator[entry.type];
      return {
        label: entry.label,
        value: stats.count > 0 ? Math.round((stats.totalHours / stats.count) * 10) / 10 : 0,
      };
    })
    .filter((row) => row.value > 0);

  const pendingQueueData = {
    queue: "Pending Queue",
    // BPLO-owned review only. Returned-for-correction is applicant-side, not BPLO active work.
    bploReview: rows.filter((row) => row.status === "SUBMITTED" || row.status === "UNDER_REVIEW").length,
    assessment: rows.filter((row) => row.status === "DEPARTMENT_HEAD_APPROVED" || row.status === "ASSESSED").length,
    paymentVerification: rows.filter((row) => row.status === "APPROVED_FOR_PAYMENT").length,
    permitRelease: rows.filter((row) => row.status === "FOR_RELEASE" || row.status === "PAID").length,
  };

  const pendingQueueByStatus =
    pendingQueueData.bploReview +
      pendingQueueData.assessment +
      pendingQueueData.paymentVerification +
      pendingQueueData.permitRelease >
    0
      ? [pendingQueueData]
      : [];

  return {
    applicationStatusDistribution,
    applicationsProcessedPerDay,
    processingTimeByApplicationType,
    pendingQueueByStatus,
  };
}

export async function getBploDashboardMetrics(): Promise<BploDashboardMetrics> {
  return getCachedBploDashboardMetrics();
}
