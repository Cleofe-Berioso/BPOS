import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { mapDbStatusToUi } from "@/lib/application-mappers";
import { mapDocumentValidationStatusToUi } from "@/lib/document-validation";
import { getAuditLogs } from "@/lib/audit-log";
import { getPaymentReferencesFromFormData } from "@/lib/payment-reference";
import { toMoneyNumber } from "@/lib/money";
import { buildPaginatedResult, clampPage, clampPageSize, resolvePagination, type PaginatedResult } from "@/lib/pagination";
import { formatMonthYearLabel, monthYearToDateRange } from "@/lib/printable-reports";

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
type PaymentRefStatus = "PENDING" | "VERIFIED" | "REJECTED";
type ActorRole = "APPLICANT" | "BPLO" | "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "JIT";
type AuditActorRole = ActorRole | "SYSTEM";

const STATUS_ORDER: DbApplicationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "ASSESSED",
  "APPROVED_FOR_PAYMENT",
  "PAID",
  "FOR_RELEASE",
  "RELEASED",
  "REJECTED",
  "RETURNED_FOR_CORRECTION",
  "DRAFT",
];

function toDateOnly(date: Date | null): string {
  if (!date) return "-";
  return date.toISOString().slice(0, 10);
}

function resolveBusinessName(formData: unknown, fallback: string | null): string {
  const data = (formData ?? {}) as Record<string, unknown>;
  const fromForm =
    typeof data.businessName === "string" && data.businessName.trim()
      ? data.businessName.trim()
      : null;
  return fromForm ?? fallback ?? "-";
}

function latestPaymentReference(
  formData: unknown,
  applicationId: string,
  status: DbApplicationStatus
): {
  id: string;
  transactionNumber: string;
  amountPaid: number;
  submittedAt: string;
  status: PaymentRefStatus;
  reviewerRemarks: string | null;
  reviewedAt: string | null;
} | null {
  const refs = getPaymentReferencesFromFormData(formData, applicationId, status);
  return refs.length > 0 ? refs[refs.length - 1] : null;
}

export interface SuperAdminDashboardSummary {
  totalApplications: number;
  byStatus: Record<DbApplicationStatus, number>;
  totalBusinessRecords: number;
  totalUsers: number;
  totalAssessedAmount: number;
  totalRevenueEstimate: number;
}

export interface SuperAdminApplicationListRow {
  id: string;
  applicationNumber: string;
  businessName: string;
  applicantEmail: string;
  applicationType: ApplicationType;
  status: string;
  topNumber: string | null;
  permitOrCertificateNumber: string | null;
  dateSubmitted: string;
  lastUpdated: string;
}

export interface SuperAdminApplicationDetail {
  application: {
    id: string;
    applicationNumber: string;
    applicationType: ApplicationType;
    status: string;
    rawStatus: DbApplicationStatus;
    submittedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  applicant: {
    id: string;
    name: string;
    email: string;
  };
  businessInfo: {
    businessName: string;
    ownerFirstName: string;
    ownerMiddleName: string;
    ownerSurname: string;
    businessType: string;
    registrationNumber: string;
    tin: string;
    tradeName: string;
    ownerName: string;
    ownerAge: string;
    sex: string;
    nationality: string;
    email: string;
    phone: string;
    businessOperationType: string;
    mainOfficeAddress: string;
    businessAddress: string;
    barangay: string;
    streetAddress: string;
    businessLatitude: string;
    businessLongitude: string;
    lineOfBusiness: string;
    businessActivity: string;
    businessArea: string;
    totalFloorArea: string;
    assetSize: string;
    propertyOwnership: string;
    taxDeclarationNumber: string;
    propertyIdentificationNumber: string;
    taxIncentives: string;
    isMarket: string;
    isAgriculture: string;
    isLiquorOrTobacco: string;
    totalEmployees: string;
    maleEmployees: string;
    femaleEmployees: string;
    employeesWithinMunicipality: string;
    deliveryVehicles: string;
    paymentFrequency: string;
    closureReason: string;
  };
  documents: Array<{
    id: string;
    documentName: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    validationStatus: string;
    validationRemarks: string | null;
  }>;
  feeAssessment: {
    assessmentNumber: string | null;
    status: "DRAFT" | "GENERATED" | null;
    paymentFrequency: "ANNUAL" | "BI_ANNUAL" | "QUARTERLY" | null;
    mayorsPermitFee: number;
    regulatoryFees: number;
    additionalCharges: number;
    penalties: number;
    surcharge: number;
    interest: number;
    closureCertificateFee: number;
    arrears: number;
    otherCharges: number;
    totalAmount: number;
    remarks: string | null;
    generatedAt: string | null;
  };
  paymentReference: {
    id: string;
    transactionNumber: string;
    amountPaid: number;
    submittedAt: string;
    status: PaymentRefStatus;
    reviewerRemarks: string | null;
    reviewedAt: string | null;
  } | null;
  permitIssuance: {
    id: string;
    documentType: "BUSINESS_PERMIT" | "CLOSURE_CERTIFICATE";
    documentNumber: string;
    status: "PREPARED" | "FOR_RELEASE" | "RELEASED";
    issuedAt: string;
    releasedAt: string | null;
    preparedBy: string | null;
    releasedBy: string | null;
    remarks: string | null;
  } | null;
  history: Array<{
    id: string;
    createdAt: string;
    actorEmail: string | null;
    actorRole: string | null;
    fromStatus: string | null;
    toStatus: string;
    remarks: string | null;
  }>;
}

export interface SuperAdminActivityRow {
  id: string;
  dateTime: string;
  actorName: string;
  actorRole: string;
  action: string;
  module: string;
  entityType: string;
  recordReference: string | null;
  applicationNumber: string | null;
  beforeStatus: string | null;
  afterStatus: string | null;
  description: string | null;
}

export interface SuperAdminActivityFilters {
  searchKeyword?: string;
  actorRole?: "ALL" | AuditActorRole;
  module?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  applicationNumber?: string;
  page?: number;
  pageSize?: number;
}

export interface SuperAdminActivitiesResult {
  records: SuperAdminActivityRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SuperAdminActivityFilterOptions {
  modules: string[];
  actions: string[];
}

function isAuditActorRole(value: string): value is AuditActorRole {
  return (
    value === "APPLICANT" ||
    value === "BPLO" ||
    value === "SUPER_ADMIN" ||
    value === "DEPARTMENT_HEAD" ||
    value === "JIT" ||
    value === "SYSTEM"
  );
}

function parseDateAtStartOfDay(value?: string): Date | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseDateAtEndOfDay(value?: string): Date | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const parsed = new Date(`${trimmed}T23:59:59.999Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function humanizeAuditValue(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAuditStatus(value: string | null): string | null {
  if (!value) return null;
  if ((STATUS_ORDER as string[]).includes(value)) {
    return mapDbStatusToUi(value as DbApplicationStatus);
  }
  return humanizeAuditValue(value);
}


export interface SuperAdminUserRow {
  id: string;
  name: string;
  email: string;
  role: "APPLICANT" | "BPLO" | "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "JIT";
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  updatedAt: string;
  profileImageStoragePath: string | null;
}

export interface SuperAdminUserSummary {
  totalUsers: number;
  applicants: number;
  bploAccounts: number;
  superAdmins: number;
  departmentHeads: number;
  jitInspectors: number;
  activeUsers: number;
  disabledUsers: number;
}

export interface SuperAdminReportsSummary {
  applicationsByStatus: Array<{ status: string; count: number }>;
  applicationsByType: Array<{ type: ApplicationType; count: number }>;
  totalAssessedAmount: number;
  totalRevenueEstimate: number;
  releasedPermits: number;
  closureCertificates: number;
  bploActivityCount: number;
}

async function countStatuses(): Promise<Record<DbApplicationStatus, number>> {
  const counts = await Promise.all(
    [
      "DRAFT",
      "SUBMITTED",
      "UNDER_REVIEW",
      "DEPARTMENT_HEAD_REVIEW",
      "DEPARTMENT_HEAD_APPROVED",
      "ASSESSED",
      "APPROVED_FOR_PAYMENT",
      "PAID",
      "FOR_RELEASE",
      "RELEASED",
      "REVOCATION_REVIEW",
      "REVOKED",
      "RETURNED_FOR_CORRECTION",
      "REJECTED",
    ].map(async (status) => ({
      status: status as DbApplicationStatus,
      count: await prisma.businessApplication.count({
        where: { status: status as DbApplicationStatus },
      }),
    }))
  );

  const byStatus = {
    DRAFT: 0,
    SUBMITTED: 0,
    UNDER_REVIEW: 0,
    DEPARTMENT_HEAD_REVIEW: 0,
    DEPARTMENT_HEAD_APPROVED: 0,
    ASSESSED: 0,
    APPROVED_FOR_PAYMENT: 0,
    PAID: 0,
    FOR_RELEASE: 0,
    RELEASED: 0,
    REVOCATION_REVIEW: 0,
    REVOKED: 0,
    RETURNED_FOR_CORRECTION: 0,
    REJECTED: 0,
  } satisfies Record<DbApplicationStatus, number>;

  for (const row of counts) {
    byStatus[row.status] = row.count;
  }

  return byStatus;
}

async function computeTotals() {
  const feeRows = await prisma.feeAssessment.findMany({
    select: {
      totalAmount: true,
      application: {
        select: {
          status: true,
        },
      },
    },
  });

  let totalAssessedAmount = 0;
  let totalRevenueEstimate = 0;
  for (const row of feeRows) {
    totalAssessedAmount += toMoneyNumber(row.totalAmount);
    if (["PAID", "FOR_RELEASE", "RELEASED"].includes(row.application.status)) {
      totalRevenueEstimate += toMoneyNumber(row.totalAmount);
    }
  }

  return {
    totalAssessedAmount: Math.round(totalAssessedAmount * 100) / 100,
    totalRevenueEstimate: Math.round(totalRevenueEstimate * 100) / 100,
  };
}

// Cached query for dashboard summary - deduplicates per-request
const getCachedSuperAdminDashboardSummary = cache(async () => {
  const [
    totalApplications,
    byStatus,
    totalBusinessRecords,
    totalUsers,
    totals,
  ] = await Promise.all([
    prisma.businessApplication.count(),
    countStatuses(),
    prisma.businessRecord.count(),
    prisma.user.count(),
    computeTotals(),
  ]);

  return {
    totalApplications,
    byStatus,
    totalBusinessRecords,
    totalUsers,
    totalAssessedAmount: totals.totalAssessedAmount,
    totalRevenueEstimate: totals.totalRevenueEstimate,
  };
});

export async function getSuperAdminDashboardSummary(): Promise<SuperAdminDashboardSummary> {
  return getCachedSuperAdminDashboardSummary();
}

export async function listSuperAdminApplications(
  search?: string,
  pagination?: { page?: number | string; pageSize?: number | string }
): Promise<PaginatedResult<SuperAdminApplicationListRow>> {
  const { page, pageSize, skip, take } = resolvePagination(pagination);
  const normalizedSearch = search?.trim();

  const where = normalizedSearch
    ? {
        OR: [
          { applicationNumber: { contains: normalizedSearch, mode: "insensitive" as const } },
          { applicant: { email: { contains: normalizedSearch, mode: "insensitive" as const } } },
        ],
      }
    : undefined;

  const [rows, totalCount] = await Promise.all([
    prisma.businessApplication.findMany({
      where,
      include: {
        applicant: { select: { email: true } },
        businessRecord: { select: { businessName: true } },
        feeAssessment: { select: { assessmentNumber: true } },
        permitIssuance: { select: { documentNumber: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip,
      take,
    }),
    prisma.businessApplication.count({ where }),
  ]);

  return buildPaginatedResult(
    rows.map((row) => ({
      id: row.businessApplicationId,
      applicationNumber: row.applicationNumber,
      businessName: resolveBusinessName(row.formData, row.businessRecord?.businessName ?? null),
      applicantEmail: row.applicant.email,
      applicationType: row.applicationType as ApplicationType,
      status: mapDbStatusToUi(row.status),
      topNumber: row.feeAssessment?.assessmentNumber ?? null,
      permitOrCertificateNumber: row.permitIssuance?.documentNumber ?? null,
      dateSubmitted: toDateOnly(row.submittedAt),
      lastUpdated: toDateOnly(row.updatedAt),
    })),
    totalCount,
    page,
    pageSize
  );
}

export async function getSuperAdminApplicationDetail(
  applicationId: string
): Promise<SuperAdminApplicationDetail | null> {
  const row = await prisma.businessApplication.findUnique({
    where: { businessApplicationId: applicationId },
    include: {
      applicant: { select: { userId: true, name: true, email: true } },
      businessRecord: { select: { businessName: true } },
      documents: {
        select: {
          applicationDocumentId: true,
          documentName: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          uploadedAt: true,
          validationStatus: true,
          validationRemarks: true,
        },
        orderBy: { uploadedAt: "asc" },
      },
      feeAssessment: true,
      paymentReferences: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: {
          paymentReferenceId: true,
          transactionNumber: true,
          submittedAt: true,
          status: true,
          reviewerRemarks: true,
          reviewedAt: true,
        },
      },
      permitIssuance: {
        include: {
          preparedBy: { select: { name: true } },
          releasedBy: { select: { name: true } },
        },
      },
      history: {
        include: {
          actor: { select: { email: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!row) return null;

  const latestDbPaymentRef = row.paymentReferences[0] ?? null;
  const paymentRef = latestDbPaymentRef
    ? {
        id: latestDbPaymentRef.paymentReferenceId,
        transactionNumber: latestDbPaymentRef.transactionNumber,
        amountPaid:
          row.feeAssessment?.paymentStatus === "PAID"
            ? toMoneyNumber(row.feeAssessment?.releasePaymentAmount ?? row.feeAssessment?.totalAmount)
            : 0,
        submittedAt: latestDbPaymentRef.submittedAt.toISOString(),
        status: latestDbPaymentRef.status as PaymentRefStatus,
        reviewerRemarks: latestDbPaymentRef.reviewerRemarks,
        reviewedAt: latestDbPaymentRef.reviewedAt
          ? latestDbPaymentRef.reviewedAt.toISOString()
          : null,
      }
    : latestPaymentReference(row.formData, row.businessApplicationId, row.status as DbApplicationStatus);

  const form = (row.formData ?? {}) as Record<string, unknown>;
  const formValue = (key: string) =>
    typeof form[key] === "string" && String(form[key]).trim()
      ? String(form[key]).trim()
      : "-";
  const formBool = (key: string) => {
    const value = form[key];
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    return "-";
  };
  const formNumber = (key: string) => {
    const value = form[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return "-";
  };

  return {
    application: {
      id: row.businessApplicationId,
      applicationNumber: row.applicationNumber,
      applicationType: row.applicationType as ApplicationType,
      status: mapDbStatusToUi(row.status),
      rawStatus: row.status as DbApplicationStatus,
      submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
    applicant: {
      id: row.applicant.userId,
      name: row.applicant.name,
      email: row.applicant.email,
    },
    businessInfo: {
      businessName: resolveBusinessName(row.formData, row.businessRecord?.businessName ?? null),
      ownerFirstName: formValue("ownerFirstName"),
      ownerMiddleName: formValue("ownerMiddleName"),
      ownerSurname: formValue("ownerSurname"),
      businessType: formValue("businessType"),
      registrationNumber: formValue("registrationNumber"),
      tin: formValue("tin"),
      tradeName: formValue("tradeName"),
      ownerName: formValue("ownerName"),
      ownerAge: formValue("ownerAge"),
      sex: formValue("sex"),
      nationality: formValue("nationality"),
      email: formValue("email"),
      phone: formValue("phone"),
      businessOperationType: formValue("businessOperationType"),
      mainOfficeAddress: formValue("mainOfficeAddress"),
      businessAddress: formValue("businessAddress"),
      barangay: formValue("barangay"),
      streetAddress: formValue("streetAddress"),
      businessLatitude: formNumber("businessLatitude"),
      businessLongitude: formNumber("businessLongitude"),
      lineOfBusiness: formValue("lineOfBusiness"),
      businessActivity: formValue("businessActivity"),
      businessArea: formValue("businessArea"),
      totalFloorArea: formValue("totalFloorArea"),
      assetSize: formValue("assetSize"),
      propertyOwnership: formValue("propertyOwnership"),
      taxDeclarationNumber: formValue("taxDeclarationNumber"),
      propertyIdentificationNumber: formValue("propertyIdentificationNumber"),
      taxIncentives: formValue("taxIncentives"),
      isMarket: formBool("isMarket"),
      isAgriculture: formBool("isAgriculture"),
      isLiquorOrTobacco: formBool("isLiquorOrTobacco"),
      totalEmployees: formValue("totalEmployees"),
      maleEmployees: formValue("maleEmployees"),
      femaleEmployees: formValue("femaleEmployees"),
      employeesWithinMunicipality: formValue("employeesWithinMunicipality"),
      deliveryVehicles: formValue("deliveryVehicles"),
      paymentFrequency: formValue("paymentFrequency"),
      closureReason: formValue("closureReason") !== "-"
        ? formValue("closureReason")
        : formValue("reasonForClosure") !== "-"
          ? formValue("reasonForClosure")
          : formValue("closureRemarks"),
    },
    documents: row.documents.map((doc) => ({
      id: doc.applicationDocumentId,
      documentName: doc.documentName,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      uploadedAt: doc.uploadedAt.toISOString(),
      validationStatus: mapDocumentValidationStatusToUi(doc.validationStatus),
      validationRemarks: doc.validationRemarks ?? null,
    })),
    feeAssessment: {
      assessmentNumber: row.feeAssessment?.assessmentNumber ?? null,
      status: (row.feeAssessment?.status as "DRAFT" | "GENERATED" | null) ?? null,
      paymentFrequency:
        (row.feeAssessment?.paymentFrequency as
          | "ANNUAL"
          | "BI_ANNUAL"
          | "QUARTERLY"
          | null) ?? null,
      mayorsPermitFee: toMoneyNumber(row.feeAssessment?.mayorsPermitFee),
      regulatoryFees: toMoneyNumber(row.feeAssessment?.regulatoryFees),
      additionalCharges: toMoneyNumber(row.feeAssessment?.additionalCharges),
      penalties: toMoneyNumber(row.feeAssessment?.penalties),
      surcharge: toMoneyNumber(row.feeAssessment?.surcharge),
      interest: toMoneyNumber(row.feeAssessment?.interest),
      closureCertificateFee: toMoneyNumber(row.feeAssessment?.closureCertificateFee),
      arrears: 0,
      otherCharges: toMoneyNumber(row.feeAssessment?.otherCharges),
      totalAmount: toMoneyNumber(row.feeAssessment?.totalAmount),
      remarks: row.feeAssessment?.remarks ?? null,
      generatedAt: row.feeAssessment?.generatedAt
        ? row.feeAssessment.generatedAt.toISOString()
        : null,
    },
    paymentReference: paymentRef,
    permitIssuance: row.permitIssuance
      ? {
          id: row.permitIssuance.permitIssuanceId,
          documentType: row.permitIssuance.documentType,
          documentNumber: row.permitIssuance.documentNumber,
          status: row.permitIssuance.status,
          issuedAt: row.permitIssuance.issuedAt.toISOString(),
          releasedAt: row.permitIssuance.releasedAt
            ? row.permitIssuance.releasedAt.toISOString()
            : null,
          preparedBy: row.permitIssuance.preparedBy?.name ?? null,
          releasedBy: row.permitIssuance.releasedBy?.name ?? null,
          remarks: row.permitIssuance.remarks,
        }
      : null,
    history: row.history.map((item) => ({
      id: item.applicationHistoryId,
      createdAt: item.createdAt.toISOString(),
      actorEmail: item.actor?.email ?? null,
      actorRole: item.actorRole,
      fromStatus: item.fromStatus ? mapDbStatusToUi(item.fromStatus) : null,
      toStatus: mapDbStatusToUi(item.toStatus),
      remarks: item.remarks,
    })),
  };
}

export async function getSuperAdminApplicationDocument(applicationId: string, documentId: string) {
  const application = await prisma.businessApplication.findUnique({
    where: { businessApplicationId: applicationId },
    select: { businessApplicationId: true },
  });

  if (!application) {
    throw new Error("Application not found");
  }

  const document = await prisma.applicationDocument.findFirst({
    where: {
      applicationDocumentId: documentId,
      applicationId,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  return document;
}

export async function listSuperAdminActivities(
  filters: SuperAdminActivityFilters = {}
): Promise<SuperAdminActivitiesResult> {
  const page = clampPage(filters.page);
  const pageSize = clampPageSize(filters.pageSize);
  const searchKeyword = filters.searchKeyword?.trim();
  const applicationNumber = filters.applicationNumber?.trim();
  const startDate = parseDateAtStartOfDay(filters.dateFrom);
  const endDate = parseDateAtEndOfDay(filters.dateTo);

  const [searchApplications, filteredApplications] = await Promise.all([
    searchKeyword
      ? prisma.businessApplication.findMany({
          where: { applicationNumber: { contains: searchKeyword } },
          select: { businessApplicationId: true, applicationNumber: true },
          take: 100,
        })
      : Promise.resolve([]),
    applicationNumber
      ? prisma.businessApplication.findMany({
          where: { applicationNumber: { contains: applicationNumber } },
          select: { businessApplicationId: true, applicationNumber: true },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  const auditResult = await getAuditLogs(
    {
      actorRole:
        filters.actorRole && filters.actorRole !== "ALL" && isAuditActorRole(filters.actorRole)
          ? filters.actorRole
          : undefined,
      module: filters.module?.trim() || undefined,
      action: filters.action?.trim() || undefined,
      applicationIds: filteredApplications.map((item) => item.businessApplicationId),
      applicationNumberSearch: applicationNumber,
      search: searchKeyword,
      searchApplicationIds: searchApplications.map((item) => item.businessApplicationId),
      startDate,
      endDate,
    },
    (page - 1) * pageSize,
    pageSize
  );

  const actorIds = Array.from(
    new Set(auditResult.logs.map((item) => item.actorId).filter((value): value is string => Boolean(value)))
  );
  const applicationIds = Array.from(
    new Set(auditResult.logs.map((item) => item.applicationId).filter((value): value is string => Boolean(value)))
  );

  const [actors, applications] = await Promise.all([
    actorIds.length > 0
      ? prisma.user.findMany({
          where: { userId: { in: actorIds } },
          select: { userId: true, name: true },
        })
      : Promise.resolve([]),
    applicationIds.length > 0
      ? prisma.businessApplication.findMany({
          where: { businessApplicationId: { in: applicationIds } },
          select: { businessApplicationId: true, applicationNumber: true },
        })
      : Promise.resolve([]),
  ]);

  const actorNameById = new Map(actors.map((item) => [item.userId, item.name]));
  const applicationNumberById = new Map(applications.map((item) => [item.businessApplicationId, item.applicationNumber]));
  const totalPages = auditResult.total === 0 ? 1 : Math.ceil(auditResult.total / pageSize);

  return {
    records: auditResult.logs.map((item) => {
      const relatedApplicationNumber = item.applicationId ? applicationNumberById.get(item.applicationId) ?? null : null;
      const recordReference = relatedApplicationNumber ?? item.entityId ?? null;

      return {
        id: item.auditLogId,
        dateTime: item.createdAt.toISOString(),
        actorName: item.actorName?.trim() || (item.actorId ? actorNameById.get(item.actorId) ?? null : null) || "System",
        actorRole: item.actorRole ?? "SYSTEM",
        action: humanizeAuditValue(item.action),
        module: humanizeAuditValue(item.module),
        entityType: humanizeAuditValue(item.entityType),
        recordReference,
        applicationNumber: relatedApplicationNumber,
        beforeStatus: formatAuditStatus(item.beforeStatus),
        afterStatus: formatAuditStatus(item.afterStatus),
        description: item.description,
      };
    }),
    totalCount: auditResult.total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getSuperAdminActivityFilterOptions(): Promise<SuperAdminActivityFilterOptions> {
  const [modules, actions] = await Promise.all([
    prisma.auditLog.findMany({
      distinct: ["module"],
      select: { module: true },
      orderBy: { module: "asc" },
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
  ]);

  return {
    modules: modules.map((item) => item.module).filter(Boolean),
    actions: actions.map((item) => item.action).filter(Boolean),
  };
}

export async function listSuperAdminUsers(
  filters?: {
    search?: string;
    role?: "ALL" | "APPLICANT" | "BPLO" | "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "JIT";
    status?: "ALL" | "ACTIVE" | "DISABLED";
    page?: number | string;
    pageSize?: number | string;
  }
): Promise<PaginatedResult<SuperAdminUserRow>> {
  const { page, pageSize, skip, take } = resolvePagination(filters);
  const normalizedSearch = filters?.search?.trim();
  const roleFilter = filters?.role ?? "ALL";
  const statusFilter = filters?.status ?? "ALL";

  const where = {
    ...(normalizedSearch
      ? {
          OR: [
            { name: { contains: normalizedSearch, mode: "insensitive" as const } },
            { email: { contains: normalizedSearch, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(roleFilter !== "ALL" ? { role: roleFilter } : {}),
    ...(statusFilter === "ALL"
      ? {}
      : {
          isActive: statusFilter === "ACTIVE",
        }),
  };

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        userId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        profileImageStoragePath: true,
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  return buildPaginatedResult(
    users.map((user) => ({
      id: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.isActive ? "ACTIVE" : "DISABLED",
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      profileImageStoragePath: user.profileImageStoragePath,
    })),
    totalCount,
    page,
    pageSize
  );
}

export async function getSuperAdminUserSummary(): Promise<SuperAdminUserSummary> {
  const [totalUsers, applicants, bploAccounts, superAdmins, departmentHeads, jitInspectors, activeUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "APPLICANT" } }),
    prisma.user.count({ where: { role: "BPLO" } }),
    prisma.user.count({ where: { role: "SUPER_ADMIN" } }),
    prisma.user.count({ where: { role: "DEPARTMENT_HEAD" } }),
    prisma.user.count({ where: { role: "JIT" } }),
    prisma.user.count({ where: { isActive: true } }),
  ]);

  return {
    totalUsers,
    applicants,
    bploAccounts,
    superAdmins,
    departmentHeads,
    jitInspectors,
    activeUsers,
    disabledUsers: totalUsers - activeUsers,
  };
}

// Cached query for reports summary - deduplicates per-request
const getCachedSuperAdminReportsSummary = cache(async (): Promise<SuperAdminReportsSummary> => {
  const [statusCounts, typeCounts, totals, releasedPermits, closureCertificates, bploActivityCount] =
    await Promise.all([
      countStatuses(),
      Promise.all(
        ["NEW", "RENEWAL", "CLOSURE"].map(async (type) => ({
          type: type as ApplicationType,
          count: await prisma.businessApplication.count({
            where: { applicationType: type as ApplicationType },
          }),
        }))
      ),
      computeTotals(),
      prisma.permitIssuance.count({
        where: { documentType: "BUSINESS_PERMIT", status: "RELEASED" },
      }),
      prisma.permitIssuance.count({
        where: { documentType: "CLOSURE_CERTIFICATE", status: "RELEASED" },
      }),
      prisma.applicationHistory.count({ where: { actorRole: "BPLO" } }),
    ]);

  return {
    applicationsByStatus: STATUS_ORDER.map((status) => ({
      status: mapDbStatusToUi(status),
      count: statusCounts[status],
    })),
    applicationsByType: typeCounts,
    totalAssessedAmount: totals.totalAssessedAmount,
    totalRevenueEstimate: totals.totalRevenueEstimate,
    releasedPermits,
    closureCertificates,
    bploActivityCount,
  };
});

export async function getSuperAdminReportsSummary(): Promise<SuperAdminReportsSummary> {
  return getCachedSuperAdminReportsSummary();
}

// ── Phase 5: Core Printable Reports ──────────────────────────────────────────

type BusinessRecordStatus = "ACTIVE" | "INACTIVE" | "CLOSED";

const VALID_DB_STATUSES = new Set<DbApplicationStatus>([
  "DRAFT", "SUBMITTED", "UNDER_REVIEW", "DEPARTMENT_HEAD_REVIEW",
  "DEPARTMENT_HEAD_APPROVED", "ASSESSED", "APPROVED_FOR_PAYMENT",
  "PAID", "FOR_RELEASE", "RELEASED", "REVOCATION_REVIEW", "REVOKED",
  "RETURNED_FOR_CORRECTION", "REJECTED",
]);

function parseAppStatus(v?: string): DbApplicationStatus | undefined {
  if (!v) return undefined;
  const trimmed = v.trim().toUpperCase();
  return VALID_DB_STATUSES.has(trimmed as DbApplicationStatus)
    ? (trimmed as DbApplicationStatus)
    : undefined;
}

function parseAppType(v?: string): ApplicationType | undefined {
  if (!v) return undefined;
  const t = v.trim().toUpperCase();
  if (t === "NEW" || t === "RENEWAL" || t === "CLOSURE") return t as ApplicationType;
  return undefined;
}

function parseBizStatus(v?: string): BusinessRecordStatus | undefined {
  if (!v) return undefined;
  const t = v.trim().toUpperCase();
  if (t === "ACTIVE" || t === "INACTIVE" || t === "CLOSED") return t as BusinessRecordStatus;
  return undefined;
}

// ── Report 1: Application Summary ────────────────────────────────────────────

export interface AppSummaryReportRow {
  applicationNumber: string;
  applicationType: string;
  businessName: string;
  ownerName: string;
  status: string;
  submittedDate: string;
  lastUpdated: string;
}

export interface AppSummaryReportFilters {
  from?: string;
  to?: string;
  status?: string;
  applicationType?: string;
}

export async function getApplicationSummaryReport(
  filters: AppSummaryReportFilters = {}
): Promise<AppSummaryReportRow[]> {
  const startDate = parseDateAtStartOfDay(filters.from);
  const endDate = parseDateAtEndOfDay(filters.to);
  const appStatus = parseAppStatus(filters.status);
  const appType = parseAppType(filters.applicationType);

  const rows = await prisma.businessApplication.findMany({
    where: {
      ...((startDate ?? endDate)
        ? {
            submittedAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
      ...(appStatus ? { status: appStatus } : {}),
      ...(appType ? { applicationType: appType } : {}),
    },
    include: {
      applicant: { select: { name: true } },
      businessRecord: { select: { businessName: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return rows.map((row) => ({
    applicationNumber: row.applicationNumber,
    applicationType: row.applicationType,
    businessName: resolveBusinessName(row.formData, row.businessRecord?.businessName ?? null),
    ownerName: row.applicant.name,
    status: mapDbStatusToUi(row.status),
    submittedDate: toDateOnly(row.submittedAt),
    lastUpdated: toDateOnly(row.updatedAt),
  }));
}

// ── Report 2: Business Registry ───────────────────────────────────────────────

export interface BusinessRegistryReportRow {
  businessName: string;
  tradeName: string;
  owner: string;
  businessType: string;
  lineOfBusiness: string;
  address: string;
  permitNumber: string;
  permitValidity: string;
  businessStatus: string;
}

export interface BusinessRegistryReportFilters {
  barangay?: string;
  businessType?: string;
  status?: string;
}

export async function getBusinessRegistryReport(
  filters: BusinessRegistryReportFilters = {}
): Promise<BusinessRegistryReportRow[]> {
  const barangay = filters.barangay?.trim() || undefined;
  const bizType = filters.businessType?.trim() || undefined;
  const bizStatus = parseBizStatus(filters.status);

  const rows = await prisma.businessRecord.findMany({
    where: {
      ...(bizType ? { businessType: { contains: bizType } } : {}),
      ...(bizStatus ? { businessStatus: bizStatus } : {}),
      ...(barangay ? { location: { barangay: { contains: barangay } } } : {}),
    },
    include: {
      location: { select: { barangay: true } },
      applications: {
        where: {
          status: "RELEASED",
          applicationType: { in: ["NEW", "RENEWAL"] },
        },
        include: {
          permitIssuance: { select: { documentNumber: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { businessName: "asc" },
  });

  function humanizeBizStatus(s: string): string {
    if (s === "ACTIVE") return "Active";
    if (s === "INACTIVE") return "Inactive";
    if (s === "CLOSED") return "Closed";
    return s;
  }

  return rows.map((row) => {
    const latestPermittedApp = row.applications[0] ?? null;
    const permitNumber = latestPermittedApp?.permitIssuance?.documentNumber ?? "-";
    const permitValidity = row.permitExpirationDate
      ? toDateOnly(row.permitExpirationDate)
      : "-";
    const address = row.location?.barangay
      ? `Brgy. ${row.location.barangay}${row.businessAddress ? `, ${row.businessAddress}` : ""}`
      : row.businessAddress || "-";

    return {
      businessName: row.businessName || "-",
      tradeName: row.tradeName || "-",
      owner: row.ownerName || "-",
      businessType: row.businessType || "-",
      lineOfBusiness: row.lineOfBusiness || "-",
      address,
      permitNumber,
      permitValidity,
      businessStatus: humanizeBizStatus(row.businessStatus),
    };
  });
}

// ── Report 4: Business Closure ────────────────────────────────────────────────

export interface BusinessClosureReportRow {
  applicationNumber: string;
  businessName: string;
  owner: string;
  closureStatus: string;
  closureCertStatus: string;
  submittedDate: string;
  releasedDate: string;
}

export interface BusinessClosureReportFilters {
  from?: string;
  to?: string;
  status?: string;
}

export async function getBusinessClosureReport(
  filters: BusinessClosureReportFilters = {}
): Promise<BusinessClosureReportRow[]> {
  const startDate = parseDateAtStartOfDay(filters.from);
  const endDate = parseDateAtEndOfDay(filters.to);
  const appStatus = parseAppStatus(filters.status);

  const rows = await prisma.businessApplication.findMany({
    where: {
      applicationType: "CLOSURE",
      ...((startDate ?? endDate)
        ? {
            submittedAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
      ...(appStatus ? { status: appStatus } : {}),
    },
    include: {
      businessRecord: { select: { businessName: true, ownerName: true } },
      applicant: { select: { name: true } },
      permitIssuance: {
        select: { documentNumber: true, status: true, releasedAt: true },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  function humanizeCertStatus(s: string): string {
    if (s === "PREPARED") return "Prepared";
    if (s === "FOR_RELEASE") return "For Release";
    if (s === "RELEASED") return "Released";
    return s;
  }

  return rows.map((row) => ({
    applicationNumber: row.applicationNumber,
    businessName: resolveBusinessName(row.formData, row.businessRecord?.businessName ?? null),
    owner: row.businessRecord?.ownerName ?? row.applicant.name,
    closureStatus: mapDbStatusToUi(row.status),
    closureCertStatus: row.permitIssuance
      ? humanizeCertStatus(row.permitIssuance.status)
      : "Not Issued",
    submittedDate: toDateOnly(row.submittedAt),
    releasedDate: row.permitIssuance?.releasedAt
      ? toDateOnly(row.permitIssuance.releasedAt)
      : "-",
  }));
}

// ── Report 5: Inspection Compliance ──────────────────────────────────────────

export interface InspectionComplianceReportRow {
  date: string;
  businessName: string;
  applicationNumber: string;
  inspector: string;
  complianceStatus: string;
  inspectionStatus: string;
  decidedBy: string;
  decidedAt: string;
}

export interface InspectionComplianceReportFilters {
  from?: string;
  to?: string;
  complianceStatus?: string;
  inspectionStatus?: string;
}

const VALID_COMPLIANCE_STATUSES = ["PENDING_REVIEW", "COMPLIANT", "NON_COMPLIANT"] as const;
function parseComplianceStatus(
  v?: string
): (typeof VALID_COMPLIANCE_STATUSES)[number] | undefined {
  if (!v) return undefined;
  return (VALID_COMPLIANCE_STATUSES as readonly string[]).includes(v)
    ? (v as (typeof VALID_COMPLIANCE_STATUSES)[number])
    : undefined;
}

const VALID_INSPECTION_STATUSES = [
  "COMPLIANT",
  "NON_COMPLIANT",
  "DH_VERIFICATION_PENDING",
  "VERIFIED_COMPLIANT",
  "VERIFIED_NON_COMPLIANT",
  "REVOCATION_REVIEW",
  "REVOCATION_DENIED",
  "REVOKED",
] as const;
function parseInspectionStatus(
  v?: string
): (typeof VALID_INSPECTION_STATUSES)[number] | undefined {
  if (!v) return undefined;
  return (VALID_INSPECTION_STATUSES as readonly string[]).includes(v)
    ? (v as (typeof VALID_INSPECTION_STATUSES)[number])
    : undefined;
}

function labelInspectionStatus(status: string): string {
  const map: Record<string, string> = {
    COMPLIANT: "Compliant",
    NON_COMPLIANT: "Non-Compliant",
    DH_VERIFICATION_PENDING: "Pending Verification",
    VERIFIED_COMPLIANT: "Verified Compliant",
    VERIFIED_NON_COMPLIANT: "Verified Non-Compliant",
    REVOCATION_REVIEW: "Revocation Review",
    REVOCATION_DENIED: "Revocation Denied",
    REVOKED: "Revoked",
  };
  return map[status] ?? status;
}

export async function getInspectionComplianceReport(
  filters: InspectionComplianceReportFilters = {}
): Promise<InspectionComplianceReportRow[]> {
  const startDate = parseDateAtStartOfDay(filters.from);
  const endDate = parseDateAtEndOfDay(filters.to);
  const complianceStatus = parseComplianceStatus(filters.complianceStatus);
  const inspectionStatus = parseInspectionStatus(filters.inspectionStatus);

  const rows = await prisma.inspection.findMany({
    where: {
      ...((startDate ?? endDate)
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
      ...(complianceStatus ? { complianceStatus } : {}),
      ...(inspectionStatus ? { status: inspectionStatus } : {}),
    },
    include: {
      businessRecord: { select: { businessName: true } },
      application: { select: { applicationNumber: true } },
      inspector: { select: { name: true } },
      decidedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    date: toDateOnly(row.createdAt),
    businessName: row.businessRecord?.businessName ?? "-",
    applicationNumber: row.application?.applicationNumber ?? "-",
    inspector: row.inspector?.name ?? "-",
    complianceStatus: row.complianceStatus === "COMPLIANT" ? "Compliant" : row.complianceStatus === "PENDING_REVIEW" ? "Pending Review" : "Non-Compliant",
    inspectionStatus: labelInspectionStatus(row.status),
    decidedBy: row.decidedBy?.name ?? "-",
    decidedAt: toDateOnly(row.decidedAt),
  }));
}

// ── Report 6: Audit Trail ─────────────────────────────────────────────────────

export interface AuditTrailReportRow {
  date: string;
  actorName: string;
  actorRole: string;
  action: string;
  module: string;
  entityType: string;
  description: string;
  beforeStatus: string;
  afterStatus: string;
}

export interface AuditTrailReportFilters {
  from?: string;
  to?: string;
  actorRole?: string;
  module?: string;
}

const VALID_AUDIT_ACTOR_ROLES = [
  "APPLICANT",
  "BPLO",
  "SUPER_ADMIN",
  "DEPARTMENT_HEAD",
  "JIT",
] as const;
function parseAuditActorRole(v?: string): string | undefined {
  if (!v) return undefined;
  return (VALID_AUDIT_ACTOR_ROLES as readonly string[]).includes(v) ? v : undefined;
}

const VALID_AUDIT_MODULES = [
  "APPLICATION",
  "INSPECTION",
  "PAYMENT",
  "PERMIT",
  "USER",
] as const;
function parseAuditModule(v?: string): string | undefined {
  if (!v) return undefined;
  return (VALID_AUDIT_MODULES as readonly string[]).includes(v) ? v : undefined;
}

function humanizeActorRole(role: string | null): string {
  if (!role) return "-";
  const map: Record<string, string> = {
    APPLICANT: "Applicant",
    BPLO: "BPLO",
    SUPER_ADMIN: "IT Administrator",
    DEPARTMENT_HEAD: "Department Head",
    JIT: "JIT Inspector",
  };
  return map[role] ?? role;
}

export async function getAuditTrailReport(
  filters: AuditTrailReportFilters = {}
): Promise<AuditTrailReportRow[]> {
  const startDate = parseDateAtStartOfDay(filters.from);
  const endDate = parseDateAtEndOfDay(filters.to);
  const actorRole = parseAuditActorRole(filters.actorRole);
  const auditModule = parseAuditModule(filters.module);

  const rows = await prisma.auditLog.findMany({
    where: {
      ...((startDate ?? endDate)
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
      ...(actorRole ? { actorRole } : {}),
      ...(auditModule ? { module: auditModule } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return rows.map((row) => ({
    date: toDateOnly(row.createdAt),
    actorName: row.actorName ?? "-",
    actorRole: humanizeActorRole(row.actorRole),
    action: row.action,
    module: row.module,
    entityType: row.entityType,
    description: row.description ?? "-",
    beforeStatus: row.beforeStatus ?? "-",
    afterStatus: row.afterStatus ?? "-",
  }));
}

// ── Report 7: SMS Delivery Log ────────────────────────────────────────────────

export interface SmsDeliveryReportRow {
  date: string;
  applicationNumber: string;
  maskedPhone: string;
  provider: string;
  status: string;
  messageBody: string;
}

export interface SmsDeliveryReportFilters {
  from?: string;
  to?: string;
  status?: string;
}

const VALID_SMS_STATUSES = ["SKIPPED", "SENT", "FAILED"] as const;
function parseSmsStatus(
  v?: string
): (typeof VALID_SMS_STATUSES)[number] | undefined {
  if (!v) return undefined;
  return (VALID_SMS_STATUSES as readonly string[]).includes(v)
    ? (v as (typeof VALID_SMS_STATUSES)[number])
    : undefined;
}

function maskPhoneForReport(phone: string | null): string {
  if (!phone) return "-";
  const s = phone.replace(/\s/g, "");
  if (s.length <= 7) return s;
  return `${s.slice(0, 4)}${"*".repeat(s.length - 7)}${s.slice(-3)}`;
}

export async function getSmsDeliveryReport(
  filters: SmsDeliveryReportFilters = {}
): Promise<SmsDeliveryReportRow[]> {
  const startDate = parseDateAtStartOfDay(filters.from);
  const endDate = parseDateAtEndOfDay(filters.to);
  const status = parseSmsStatus(filters.status);

  const rows = await prisma.smsDeliveryLog.findMany({
    where: {
      ...((startDate ?? endDate)
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
      ...(status ? { status } : {}),
    },
    include: {
      application: { select: { applicationNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    date: toDateOnly(row.createdAt),
    applicationNumber: row.application?.applicationNumber ?? "-",
    maskedPhone: maskPhoneForReport(row.phoneNumber),
    provider: row.provider,
    status: row.status,
    messageBody:
      row.messageBody.length > 120
        ? `${row.messageBody.slice(0, 117)}...`
        : row.messageBody,
  }));
}

// ── Report 8: Monthly Executive Summary ───────────────────────────────────────

export interface MonthlySummaryReportData {
  periodLabel: string;
  month: number;
  year: number;
  applicationsSubmitted: number;
  applicationsByType: Array<{ type: string; count: number }>;
  applicationsByStatus: Array<{ status: string; count: number }>;
  releasedApplications: number;
  returnedForCorrection: number;
  rejectedApplications: number;
  permitsReleased: number;
  closureCertificatesReleased: number;
  closuresSubmitted: number;
  inspectionsConducted: number;
  compliantInspections: number;
  nonCompliantInspections: number;
  pendingInspectionReview: number;
  bploActions: number;
  auditEvents: number;
  newUsers: number;
  verifiedPayments: number;
  verifiedPaymentAmount: number;
  smsSent: number;
  smsFailed: number;
}

export async function getMonthlySummaryReport(month: number, year: number): Promise<MonthlySummaryReportData> {
  const { start, end } = monthYearToDateRange(month, year);
  const submittedWhere = { submittedAt: { gte: start, lte: end } };
  const createdWhere = { createdAt: { gte: start, lte: end } };
  const releasedWhere = { releasedAt: { gte: start, lte: end } };

  const [
    applicationsSubmitted,
    typeGroups,
    statusGroups,
    releasedApplications,
    returnedForCorrection,
    rejectedApplications,
    permitsReleased,
    closureCertificatesReleased,
    closuresSubmitted,
    inspections,
    bploActions,
    auditEvents,
    newUsers,
    verifiedPayments,
    smsSent,
    smsFailed,
  ] = await Promise.all([
    prisma.businessApplication.count({ where: submittedWhere }),
    prisma.businessApplication.groupBy({
      by: ["applicationType"],
      where: submittedWhere,
      _count: { _all: true },
    }),
    prisma.businessApplication.groupBy({
      by: ["status"],
      where: submittedWhere,
      _count: { _all: true },
    }),
    prisma.businessApplication.count({
      where: {
        status: "RELEASED",
        updatedAt: { gte: start, lte: end },
      },
    }),
    prisma.businessApplication.count({
      where: { ...submittedWhere, status: "RETURNED_FOR_CORRECTION" },
    }),
    prisma.businessApplication.count({
      where: { ...submittedWhere, status: "REJECTED" },
    }),
    prisma.permitIssuance.count({
      where: { documentType: "BUSINESS_PERMIT", status: "RELEASED", ...releasedWhere },
    }),
    prisma.permitIssuance.count({
      where: { documentType: "CLOSURE_CERTIFICATE", status: "RELEASED", ...releasedWhere },
    }),
    prisma.businessApplication.count({
      where: { applicationType: "CLOSURE", ...submittedWhere },
    }),
    prisma.inspection.findMany({
      where: createdWhere,
      select: { complianceStatus: true },
    }),
    prisma.applicationHistory.count({
      where: { actorRole: "BPLO", ...createdWhere },
    }),
    prisma.auditLog.count({ where: createdWhere }),
    prisma.user.count({ where: createdWhere }),
    prisma.paymentReference.findMany({
      where: { status: "VERIFIED", reviewedAt: { gte: start, lte: end } },
      select: {
        application: {
          select: {
            feeAssessment: {
              select: {
                releasePaymentAmount: true,
                totalAmount: true,
              },
            },
          },
        },
      },
    }),
    prisma.smsDeliveryLog.count({
      where: { ...createdWhere, status: "SENT" },
    }),
    prisma.smsDeliveryLog.count({
      where: { ...createdWhere, status: "FAILED" },
    }),
  ]);

  let verifiedPaymentAmount = 0;
  for (const payment of verifiedPayments) {
    const fee = payment.application?.feeAssessment;
    if (fee) {
      verifiedPaymentAmount += toMoneyNumber(fee.releasePaymentAmount ?? fee.totalAmount);
    }
  }

  return {
    periodLabel: formatMonthYearLabel(month, year),
    month,
    year,
    applicationsSubmitted,
    applicationsByType: typeGroups.map((row) => ({
      type: row.applicationType,
      count: row._count._all,
    })),
    applicationsByStatus: statusGroups.map((row) => ({
      status: mapDbStatusToUi(row.status as DbApplicationStatus),
      count: row._count._all,
    })),
    releasedApplications,
    returnedForCorrection,
    rejectedApplications,
    permitsReleased,
    closureCertificatesReleased,
    closuresSubmitted,
    inspectionsConducted: inspections.length,
    compliantInspections: inspections.filter((row) => row.complianceStatus === "COMPLIANT").length,
    nonCompliantInspections: inspections.filter((row) => row.complianceStatus === "NON_COMPLIANT").length,
    pendingInspectionReview: inspections.filter((row) => row.complianceStatus === "PENDING_REVIEW").length,
    bploActions,
    auditEvents,
    newUsers,
    verifiedPayments: verifiedPayments.length,
    verifiedPaymentAmount: Math.round(verifiedPaymentAmount * 100) / 100,
    smsSent,
    smsFailed,
  };
}
