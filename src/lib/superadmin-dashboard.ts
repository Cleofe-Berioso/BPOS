import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { resolveLocationBarangay } from "@/lib/business-location";
import { maskPhoneNumber } from "@/lib/printable-reports";

export interface DiagnosticActivityItem {
  id: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
  applicationNumber: string | null;
  fromStatus: string | null;
  toStatus: string;
  remarks: string | null;
}

export interface DiagnosticSmsItem {
  id: string;
  createdAt: string;
  applicationNumber: string | null;
  phoneNumber: string | null;
  status: "SENT" | "FAILED" | "SKIPPED";
  provider: string;
  messageSnippet: string;
  providerResponse: string | null;
}

type DbRole = "APPLICANT" | "BPLO" | "DEPARTMENT_HEAD" | "JIT" | "SUPER_ADMIN";
type SmsStatus = "SENT" | "FAILED" | "SKIPPED";

type UserActivityBucket = {
  applicant: number;
  bplo: number;
  departmentHead: number;
  jit: number;
  superAdmin: number;
};

type TransactionBucket = {
  submitted: number;
  approvals: number;
  returnsRejections: number;
  inspections: number;
  paymentVerification: number;
  permitReleases: number;
  smsSent: number;
  smsFailed: number;
  logins: number;
};

export interface SuperAdminDashboardInsight {
  id: string;
  severity: "info" | "success" | "warning" | "danger";
  title: string;
  meaning: string;
  recommendation: string;
}

export interface SuperAdminDashboardMetrics {
  userActivityByRole: Array<{
    label: string;
    dateKey?: string;
    applicant: number;
    bplo: number;
    departmentHead: number;
    jit: number;
    superAdmin: number;
  }>;
  applicationVolumeAcrossSystem: Array<{
    label: string;
    dateKey?: string;
    bploReview: number;
    bploAssessment: number;
    bploPayment: number;
    bploRelease: number;
    departmentHeadApproval: number;
    jitInspection: number;
  }>;
  transactionVolume: Array<{
    label: string;
    dateKey?: string;
    submitted: number;
    approvals: number;
    returnsRejections: number;
    inspections: number;
    paymentVerification: number;
    permitReleases: number;
    smsSent: number;
    smsFailed: number;
    logins: number;
  }>;
  complianceRevocationTrends: Array<{
    label: string;
    dateKey?: string;
    releasedPermits: number;
    verifiedNonCompliant: number;
    revokedBusinesses: number;
    restrictedRenewals: number;
  }>;
  closurePrevalenceTrend: Array<{ label: string; value: number }>;
  prevalentBusinessCategoriesByArea: Array<{ label: string; value: number }>;
  smsDeliveryDistribution: Array<{ name: string; value: number }>;
  systemHealth: {
    databaseReachable: boolean;
    lastSuccessfulDashboardCheck: string;
    recentFailedSmsCount: number;
    recentActivityVolume: number;
  };
  insights: SuperAdminDashboardInsight[];
  operationalSnapshot: {
    openWorkloadTotal: number;
    heaviestStage: { label: string; count: number } | null;
    smsReliabilityPercent: number | null;
    recentActivityAveragePerDay: number;
    closureTrendDirection: "up" | "down" | "flat" | "insufficient";
    topBusinessCategory: { label: string; count: number } | null;
  };
  diagnosticFeeds: {
    recentActivities: DiagnosticActivityItem[];
    recentSmsLogs: DiagnosticSmsItem[];
  };
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatShortDate(dayKey: string): string {
  const [, month, day] = dayKey.split("-");
  return `${month}/${day}`;
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${month}/${year}`;
}

function initUserActivityBucket(): UserActivityBucket {
  return {
    applicant: 0,
    bplo: 0,
    departmentHead: 0,
    jit: 0,
    superAdmin: 0,
  };
}

function initTransactionBucket(): TransactionBucket {
  return {
    submitted: 0,
    approvals: 0,
    returnsRejections: 0,
    inspections: 0,
    paymentVerification: 0,
    permitReleases: 0,
    smsSent: 0,
    smsFailed: 0,
    logins: 0,
  };
}

function roleKey(role: DbRole | null): keyof UserActivityBucket | null {
  if (role === "APPLICANT") return "applicant";
  if (role === "BPLO") return "bplo";
  if (role === "DEPARTMENT_HEAD") return "departmentHead";
  if (role === "JIT") return "jit";
  if (role === "SUPER_ADMIN") return "superAdmin";
  return null;
}

function buildDayBuckets(days: number): Map<string, UserActivityBucket> {
  const buckets = new Map<string, UserActivityBucket>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    buckets.set(toDayKey(date), initUserActivityBucket());
  }
  return buckets;
}

function buildTransactionDayBuckets(days: number): Map<string, TransactionBucket> {
  const buckets = new Map<string, TransactionBucket>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    buckets.set(toDayKey(date), initTransactionBucket());
  }
  return buckets;
}

const getCachedSuperAdminDashboardMetrics = cache(async (): Promise<SuperAdminDashboardMetrics> => {
  const now = new Date();
  const dayWindow = 14;
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (dayWindow - 1)));
  const sevenDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));

  const [
    activityHistory,
    bploReview,
    bploAssessment,
    bploPayment,
    bploRelease,
    departmentHeadApproval,
    jitInspection,
    transactionHistory,
    inspectionsTrendRows,
    paymentVerificationRows,
    permitReleaseRows,
    smsTrendRows,
    allReleasedPermits,
    allVerifiedNonCompliant,
    allRevokedInspections,
    allRestrictedRenewals,
    applicationsForWorkload,
    inspectionsForWorkload,
    closureRows,
    businessCategoryRows,
    smsSummaryRows,
    recentFailedSmsCount,
    recentActivityVolume,
    recentActivityHistoryRows,
    recentSmsDeliveryRows,
  ] = await Promise.all([
    prisma.applicationHistory.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true, actorRole: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.businessApplication.count({
      where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "RETURNED_FOR_CORRECTION"] } },
    }),
    prisma.businessApplication.count({
      where: { status: { in: ["DEPARTMENT_HEAD_APPROVED", "ASSESSED"] } },
    }),
    prisma.businessApplication.count({ where: { status: "APPROVED_FOR_PAYMENT" } }),
    prisma.businessApplication.count({ where: { status: "FOR_RELEASE" } }),
    prisma.businessApplication.count({ where: { status: "DEPARTMENT_HEAD_REVIEW" } }),
    prisma.inspection.count({
      where: { status: { in: ["COMPLIANT", "NON_COMPLIANT", "DH_VERIFICATION_PENDING"] } },
    }),
    prisma.applicationHistory.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true, toStatus: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.inspection.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.paymentReference.findMany({
      where: { reviewedAt: { gte: startDate }, status: { in: ["VERIFIED", "REJECTED"] } },
      select: { reviewedAt: true },
    }),
    prisma.permitIssuance.findMany({
      where: { releasedAt: { gte: startDate }, status: "RELEASED" },
      select: { releasedAt: true },
    }),
    prisma.smsDeliveryLog.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.permitIssuance.findMany({
      where: { status: "RELEASED" },
      select: { releasedAt: true, issuedAt: true, createdAt: true },
    }),
    prisma.inspection.findMany({
      where: { status: "VERIFIED_NON_COMPLIANT" },
      select: { decidedAt: true, updatedAt: true, createdAt: true },
    }),
    prisma.inspection.findMany({
      where: { OR: [{ status: "REVOKED" }, { revocationDecision: "APPROVED" }] },
      select: { businessRecordId: true, decidedAt: true, updatedAt: true, createdAt: true },
    }),
    prisma.businessApplication.findMany({
      where: {
        applicationType: "RENEWAL",
        status: { in: ["REVOCATION_REVIEW", "REVOKED"] },
      },
      select: { businessApplicationId: true, updatedAt: true, createdAt: true },
    }),
    prisma.businessApplication.findMany({
      select: {
        businessApplicationId: true,
        status: true,
        createdAt: true,
        history: {
          select: { createdAt: true, toStatus: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.inspection.findMany({
      select: {
        inspectionId: true,
        status: true,
        createdAt: true,
        decidedAt: true,
      },
    }),
    prisma.businessApplication.findMany({
      where: { applicationType: "CLOSURE" },
      select: { createdAt: true, submittedAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.businessRecord.findMany({
      select: {
        lineOfBusiness: true,
        businessType: true,
        location: { select: { barangay: true } },
        applications: {
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { formData: true },
        },
      },
    }),
    prisma.smsDeliveryLog.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.smsDeliveryLog.count({ where: { createdAt: { gte: sevenDaysAgo }, status: "FAILED" } }),
    prisma.applicationHistory.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.applicationHistory.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        actor: { select: { name: true, email: true } },
        application: { select: { applicationNumber: true } },
      },
    }),
    prisma.smsDeliveryLog.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        application: { select: { applicationNumber: true } },
      },
    }),
  ]);

  const verifiedNonCompliant = allVerifiedNonCompliant.length;
  const uniqueRevokedBusinessIds = Array.from(new Set(allRevokedInspections.map((r) => r.businessRecordId)));
  const revokedBusinessRows = uniqueRevokedBusinessIds.map((id) => ({ businessRecordId: id }));

  const dayDates: Date[] = [];
  for (let i = dayWindow - 1; i >= 0; i -= 1) {
    dayDates.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)));
  }

  const activityBuckets = buildDayBuckets(dayWindow);
  for (const row of activityHistory) {
    const key = toDayKey(row.createdAt);
    const bucket = activityBuckets.get(key);
    if (!bucket) continue;
    const keyByRole = roleKey(row.actorRole as DbRole | null);
    if (!keyByRole) continue;
    bucket[keyByRole] += 1;
  }

  const userActivityByRole = Array.from(activityBuckets.entries()).map(([dayKey, bucket]) => ({
    label: formatShortDate(dayKey),
    dateKey: dayKey,
    applicant: bucket.applicant,
    bplo: bucket.bplo,
    departmentHead: bucket.departmentHead,
    jit: bucket.jit,
    superAdmin: bucket.superAdmin,
  }));

  const applicationVolumeAcrossSystem = dayDates.map((date) => {
    const endOfD = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
    const dayKey = toDayKey(date);
    const bucket = {
      label: formatShortDate(dayKey),
      dateKey: dayKey,
      bploReview: 0,
      bploAssessment: 0,
      bploPayment: 0,
      bploRelease: 0,
      departmentHeadApproval: 0,
      jitInspection: 0,
    };

    for (const app of applicationsForWorkload) {
      const validH = app.history.filter((h) => h.createdAt <= endOfD);
      const status =
        validH.length > 0
          ? validH[validH.length - 1].toStatus
          : app.createdAt <= endOfD && app.history.length === 0
            ? app.status
            : null;

      if (!status) continue;
      if (status === "SUBMITTED" || status === "UNDER_REVIEW" || status === "RETURNED_FOR_CORRECTION") {
        bucket.bploReview += 1;
      } else if (status === "DEPARTMENT_HEAD_REVIEW") {
        bucket.departmentHeadApproval += 1;
      } else if (status === "DEPARTMENT_HEAD_APPROVED" || status === "ASSESSED") {
        bucket.bploAssessment += 1;
      } else if (status === "APPROVED_FOR_PAYMENT") {
        bucket.bploPayment += 1;
      } else if (status === "FOR_RELEASE") {
        bucket.bploRelease += 1;
      }
    }

    for (const insp of inspectionsForWorkload) {
      if (insp.createdAt <= endOfD && (!insp.decidedAt || insp.decidedAt > endOfD)) {
        if (
          insp.status === "COMPLIANT" ||
          insp.status === "NON_COMPLIANT" ||
          insp.status === "DH_VERIFICATION_PENDING"
        ) {
          bucket.jitInspection += 1;
        }
      }
    }

    return bucket;
  });

  const transactionBuckets = buildTransactionDayBuckets(dayWindow);

  // NOTE: Explicit login events are not persisted yet, so login trend stays zero.
  for (const row of transactionHistory) {
    const key = toDayKey(row.createdAt);
    const bucket = transactionBuckets.get(key);
    if (!bucket) continue;

    if (row.toStatus === "SUBMITTED") {
      bucket.submitted += 1;
    }

    if (
      row.toStatus === "DEPARTMENT_HEAD_APPROVED" ||
      row.toStatus === "APPROVED_FOR_PAYMENT" ||
      row.toStatus === "PAID" ||
      row.toStatus === "FOR_RELEASE" ||
      row.toStatus === "RELEASED"
    ) {
      bucket.approvals += 1;
    }

    if (row.toStatus === "RETURNED_FOR_CORRECTION" || row.toStatus === "REJECTED") {
      bucket.returnsRejections += 1;
    }
  }

  for (const row of inspectionsTrendRows) {
    const key = toDayKey(row.createdAt);
    const bucket = transactionBuckets.get(key);
    if (!bucket) continue;
    bucket.inspections += 1;
  }

  for (const row of paymentVerificationRows) {
    if (!row.reviewedAt) continue;
    const key = toDayKey(row.reviewedAt);
    const bucket = transactionBuckets.get(key);
    if (!bucket) continue;
    bucket.paymentVerification += 1;
  }

  for (const row of permitReleaseRows) {
    if (!row.releasedAt) continue;
    const key = toDayKey(row.releasedAt);
    const bucket = transactionBuckets.get(key);
    if (!bucket) continue;
    bucket.permitReleases += 1;
  }

  for (const row of smsTrendRows) {
    const key = toDayKey(row.createdAt);
    const bucket = transactionBuckets.get(key);
    if (!bucket) continue;

    const smsStatus = row.status as SmsStatus;
    if (smsStatus === "SENT") bucket.smsSent += 1;
    if (smsStatus === "FAILED") bucket.smsFailed += 1;
  }

  const transactionVolume = Array.from(transactionBuckets.entries()).map(([dayKey, bucket]) => ({
    label: formatShortDate(dayKey),
    dateKey: dayKey,
    submitted: bucket.submitted,
    approvals: bucket.approvals,
    returnsRejections: bucket.returnsRejections,
    inspections: bucket.inspections,
    paymentVerification: bucket.paymentVerification,
    permitReleases: bucket.permitReleases,
    smsSent: bucket.smsSent,
    smsFailed: bucket.smsFailed,
    logins: bucket.logins,
  }));

  const complianceRevocationTrends = dayDates.map((date) => {
    const endOfD = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
    const relCount = allReleasedPermits.filter(
      (p) => (p.releasedAt ?? p.issuedAt ?? p.createdAt) <= endOfD
    ).length;
    const nonCompliantCount = allVerifiedNonCompliant.filter(
      (i) => (i.decidedAt ?? i.updatedAt ?? i.createdAt) <= endOfD
    ).length;
    const revokedSet = new Set(
      allRevokedInspections
        .filter((r) => (r.decidedAt ?? r.updatedAt ?? r.createdAt) <= endOfD)
        .map((r) => r.businessRecordId)
    );
    const restrictedCount = allRestrictedRenewals.filter(
      (a) => (a.updatedAt ?? a.createdAt) <= endOfD
    ).length;

    const dayKey = toDayKey(date);
    return {
      label: formatShortDate(dayKey),
      dateKey: dayKey,
      releasedPermits: relCount,
      verifiedNonCompliant: nonCompliantCount,
      revokedBusinesses: revokedSet.size,
      restrictedRenewals: restrictedCount,
    };
  });

  const monthBuckets = new Map<string, number>();
  const monthWindow = 12;
  for (let i = monthWindow - 1; i >= 0; i -= 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthBuckets.set(toMonthKey(month), 0);
  }

  // NOTE: Closure trend uses submittedAt when available; otherwise createdAt as safe fallback.
  for (const row of closureRows) {
    const sourceDate = row.submittedAt ?? row.createdAt ?? row.updatedAt;
    const key = toMonthKey(sourceDate);
    if (!monthBuckets.has(key)) continue;
    monthBuckets.set(key, (monthBuckets.get(key) ?? 0) + 1);
  }

  const closurePrevalenceTrend = Array.from(monthBuckets.entries()).map(([monthKey, value]) => ({
    label: formatMonthLabel(monthKey),
    value,
  }));

  const categoryByAreaMap = new Map<string, number>();
  for (const row of businessCategoryRows) {
    const area =
      resolveLocationBarangay(row.location?.barangay, row.applications[0]?.formData) ??
      "Unspecified Barangay";
    // Skip rows with no barangay on location or form data — usually incomplete/test records.
    if (area === "Unspecified Barangay") continue;
    const category = row.lineOfBusiness?.trim() || row.businessType?.trim() || "Unspecified Category";
    const key = `${area}: ${category}`;
    categoryByAreaMap.set(key, (categoryByAreaMap.get(key) ?? 0) + 1);
  }

  const prevalentBusinessCategoriesByArea = Array.from(categoryByAreaMap.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const smsCountMap = new Map<SmsStatus, number>([
    ["SENT", 0],
    ["FAILED", 0],
    ["SKIPPED", 0],
  ]);
  for (const row of smsSummaryRows) {
    const key = row.status as SmsStatus;
    smsCountMap.set(key, row._count._all);
  }

  const smsDeliveryDistribution = [
    { name: "Sent SMS", value: smsCountMap.get("SENT") ?? 0 },
    { name: "Failed SMS", value: smsCountMap.get("FAILED") ?? 0 },
    { name: "Skipped SMS", value: smsCountMap.get("SKIPPED") ?? 0 },
  ];

  let databaseReachable = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseReachable = false;
  }

  const workloadStages = [
    { label: "BPLO Review", count: bploReview },
    { label: "Department Head Approval", count: departmentHeadApproval },
    { label: "BPLO Assessment", count: bploAssessment },
    { label: "Payment Processing", count: bploPayment },
    { label: "Permit Release Queue", count: bploRelease },
    { label: "JIT Inspection", count: jitInspection },
  ].sort((a, b) => b.count - a.count);

  const openWorkloadTotal = workloadStages.reduce((sum, stage) => sum + stage.count, 0);
  const heaviestStage = workloadStages[0]?.count ? workloadStages[0] : null;

  const smsSent = smsCountMap.get("SENT") ?? 0;
  const smsFailed = smsCountMap.get("FAILED") ?? 0;
  const smsAttempted = smsSent + smsFailed;
  const smsReliabilityPercent = smsAttempted > 0 ? Math.round((smsSent / smsAttempted) * 1000) / 10 : null;

  const recentActivityAveragePerDay = Math.round((recentActivityVolume / 7) * 10) / 10;

  const recentClosureMonths = closurePrevalenceTrend.slice(-3);
  let closureTrendDirection: "up" | "down" | "flat" | "insufficient" = "insufficient";
  if (recentClosureMonths.length >= 2) {
    const first = recentClosureMonths[0]?.value ?? 0;
    const last = recentClosureMonths[recentClosureMonths.length - 1]?.value ?? 0;
    if (last > first) closureTrendDirection = "up";
    else if (last < first) closureTrendDirection = "down";
    else closureTrendDirection = "flat";
  }

  const topBusinessCategory = prevalentBusinessCategoriesByArea[0]
    ? { label: prevalentBusinessCategoriesByArea[0].label, count: prevalentBusinessCategoriesByArea[0].value }
    : null;

  const insights: SuperAdminDashboardInsight[] = [];

  if (!databaseReachable) {
    insights.push({
      id: "db-unreachable",
      severity: "danger",
      title: "Database connectivity issue",
      meaning: "The dashboard could not confirm a successful database ping during this refresh.",
      recommendation: "Check PostgreSQL service status, connection strings, and recent deploy logs before relying on other metrics.",
    });
  } else {
    insights.push({
      id: "db-healthy",
      severity: "success",
      title: "Core database is reachable",
      meaning: "System records can be queried for monitoring. This does not replace full server/uptime monitoring.",
      recommendation: "Continue routine checks of storage, SMS delivery, and backlog queues.",
    });
  }

  if (heaviestStage && openWorkloadTotal > 0) {
    const share = Math.round((heaviestStage.count / openWorkloadTotal) * 100);
    insights.push({
      id: "workload-bottleneck",
      severity: heaviestStage.count >= 10 ? "warning" : "info",
      title: `${heaviestStage.label} holds the largest open queue`,
      meaning: `${heaviestStage.count.toLocaleString("en-PH")} of ${openWorkloadTotal.toLocaleString("en-PH")} open workload items (${share}%) are concentrated in this stage.`,
      recommendation:
        heaviestStage.label.includes("Review") || heaviestStage.label.includes("Approval")
          ? "Coordinate with the owning office to clear aging applications and verify staffing coverage for peak days."
          : "Review whether applicants or offices are waiting on a dependency (documents, fees, inspection, or payment proof).",
    });
  }

  if (recentFailedSmsCount > 0) {
    insights.push({
      id: "sms-failures",
      severity: recentFailedSmsCount >= 5 ? "danger" : "warning",
      title: `${recentFailedSmsCount.toLocaleString("en-PH")} SMS failures in the last 7 days`,
      meaning:
        smsReliabilityPercent == null
          ? "Notification delivery is incomplete for some applicant or compliance messages."
          : `Current SMS success rate across recorded attempts is about ${smsReliabilityPercent}%.`,
      recommendation: "Open the SMS Delivery Log report, verify provider credentials/balance, and re-check failed destinations.",
    });
  } else if (smsAttempted > 0) {
    insights.push({
      id: "sms-healthy",
      severity: "success",
      title: "No SMS failures recorded in the last 7 days",
      meaning: `Recent messaging health looks stable (${smsReliabilityPercent ?? 100}% success among attempted deliveries).`,
      recommendation: "Keep monitoring during renewal peaks when outbound volume usually increases.",
    });
  }

  if (verifiedNonCompliant + revokedBusinessRows.length > 0) {
    insights.push({
      id: "compliance-pressure",
      severity: revokedBusinessRows.length > 0 ? "warning" : "info",
      title: "Compliance and revocation activity is present",
      meaning: `${verifiedNonCompliant.toLocaleString("en-PH")} verified non-compliant inspections and ${revokedBusinessRows.length.toLocaleString("en-PH")} revoked businesses are in the current system snapshot.`,
      recommendation: "Use Inspection Compliance and Business Closure reports to confirm follow-through and that revoked businesses still complete closure where required.",
    });
  }

  if (topBusinessCategory) {
    insights.push({
      id: "category-hotspot",
      severity: "info",
      title: "Leading business category by area",
      meaning: `${topBusinessCategory.label} currently has the highest recorded concentration (${topBusinessCategory.count.toLocaleString("en-PH")} businesses).`,
      recommendation: "Use this to anticipate inspection load and document-volume demand for the dominant barangay/category mix.",
    });
  }

  if (closureTrendDirection === "up") {
    insights.push({
      id: "closure-up",
      severity: "info",
      title: "Closure filings are trending upward",
      meaning: "Recent monthly closure applications are higher than earlier months in the tracked window.",
      recommendation: "Prepare BPLO and Department Head capacity for closure certificate processing and settlement checks.",
    });
  } else if (closureTrendDirection === "down") {
    insights.push({
      id: "closure-down",
      severity: "info",
      title: "Closure filings are easing",
      meaning: "Recent monthly closure applications are lower than earlier months in the tracked window.",
      recommendation: "Keep monitoring — a drop may simply reflect seasonality rather than reduced business exits.",
    });
  }

  if (recentActivityVolume === 0) {
    insights.push({
      id: "quiet-system",
      severity: "warning",
      title: "No workflow activity in the last 7 days",
      meaning: "Application history shows no recent actor actions. This can indicate low usage or logging gaps.",
      recommendation: "Confirm users can sign in and that production traffic is reaching the expected environment.",
    });
  }

  const recentActivities: DiagnosticActivityItem[] = recentActivityHistoryRows.map((row) => ({
    id: row.applicationHistoryId,
    createdAt: row.createdAt.toISOString(),
    actorName: row.actor?.name || row.actor?.email || "System / Automated",
    actorRole: row.actorRole ?? "SYSTEM",
    applicationNumber: row.application?.applicationNumber ?? null,
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus,
    remarks: row.remarks ?? null,
  }));

  const recentSmsLogs: DiagnosticSmsItem[] = recentSmsDeliveryRows.map((row) => ({
    id: row.smsDeliveryLogId,
    createdAt: row.createdAt.toISOString(),
    applicationNumber: row.application?.applicationNumber ?? null,
    phoneNumber: row.phoneNumber ? maskPhoneNumber(row.phoneNumber) : null,
    status: row.status as SmsStatus,
    provider: row.provider,
    messageSnippet: row.messageBody,
    providerResponse: row.providerResponse ?? null,
  }));

  return {
    userActivityByRole,
    applicationVolumeAcrossSystem,
    transactionVolume,
    complianceRevocationTrends,
    closurePrevalenceTrend,
    prevalentBusinessCategoriesByArea,
    smsDeliveryDistribution,
    systemHealth: {
      databaseReachable,
      lastSuccessfulDashboardCheck: new Date().toISOString(),
      recentFailedSmsCount,
      recentActivityVolume,
    },
    insights,
    operationalSnapshot: {
      openWorkloadTotal,
      heaviestStage,
      smsReliabilityPercent,
      recentActivityAveragePerDay,
      closureTrendDirection,
      topBusinessCategory,
    },
    diagnosticFeeds: {
      recentActivities,
      recentSmsLogs,
    },
  };
});

export async function getSuperAdminDashboardMetrics(): Promise<SuperAdminDashboardMetrics> {
  return getCachedSuperAdminDashboardMetrics();
}
