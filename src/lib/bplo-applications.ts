import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { DocumentValidationStatus } from "@prisma/client";
import { mapDbStatusToUi } from "@/lib/application-mappers";
import { assertStatusTransition } from "@/lib/application-status";
import type { BusinessInfo } from "@/lib/applicant-types";
import { formatPersonName } from "@/lib/person-name";
import {
  mapDocumentValidationStatusToUi,
  remarksRequiredForValidationStatus,
} from "@/lib/document-validation";
import { assertRequiredDocumentsReadyForApproval } from "@/lib/document-validation-server";
import { buildPaginatedResult, resolvePagination, type PaginatedResult } from "@/lib/pagination";

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

/**
 * Centralized allowlist of statuses visible in BPLO Application Queue.
 * Only review-stage applications should appear in the queue:
 * - SUBMITTED: awaiting initial review
 * - UNDER_REVIEW: currently being reviewed by BPLO
 * - RETURNED_FOR_CORRECTION: awaiting applicant resubmission
 * 
 * Excluded: ASSESSED, APPROVED_FOR_PAYMENT, PAID, FOR_RELEASE, RELEASED, REJECTED
 */
export const BPLO_QUEUE_REVIEW_STATUSES: DbApplicationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "RETURNED_FOR_CORRECTION",
];

export type BploReviewAction =
  | "MARK_UNDER_REVIEW"
  | "RETURN_FOR_CORRECTION"
  | "REJECT_APPLICATION"
  | "APPROVE_FOR_ASSESSMENT";

export interface BploQueueRow {
  id: string;
  applicationNumber: string;
  businessName: string;
  applicantName: string;
  applicantEmail: string;
  applicationType: "NEW" | "RENEWAL" | "CLOSURE";
  status: string;
  dateSubmitted: string;
  applicantProfilePicturePath: string | null;
}

interface BploQueueFilters {
  search?: string;
  type?: "ALL" | "NEW" | "RENEWAL" | "CLOSURE";
  status?:
    | "ALL"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "RETURNED_FOR_CORRECTION";
}

function toDateOnly(date: Date | null): string {
  if (!date) return "-";
  return date.toISOString().slice(0, 10);
}

function resolveBusinessName(formData: unknown, fallback: string | null): string {
  const maybeForm = formData as Partial<BusinessInfo>;
  return maybeForm.businessName ?? fallback ?? "-";
}

function canTransition(from: DbApplicationStatus, action: BploReviewAction): boolean {
  if (action === "MARK_UNDER_REVIEW") return from === "SUBMITTED";
  if (action === "RETURN_FOR_CORRECTION") return from === "SUBMITTED" || from === "UNDER_REVIEW";
  if (action === "REJECT_APPLICATION") return from === "SUBMITTED" || from === "UNDER_REVIEW";
  if (action === "APPROVE_FOR_ASSESSMENT") return from === "UNDER_REVIEW";
  return false;
}

function getNextStatus(action: BploReviewAction): DbApplicationStatus {
  if (action === "MARK_UNDER_REVIEW") return "UNDER_REVIEW";
  if (action === "RETURN_FOR_CORRECTION") return "RETURNED_FOR_CORRECTION";
  if (action === "REJECT_APPLICATION") return "REJECTED";
  return "DEPARTMENT_HEAD_REVIEW";
}

function remarksRequired(action: BploReviewAction): boolean {
  return action === "RETURN_FOR_CORRECTION" || action === "REJECT_APPLICATION";
}

// Cached query for dashboard summary - deduplicates per-request
const getCachedBploDashboardSummary = cache(async () => {
  const [submittedApplications, underReview, returnedForCorrection, assessedApplications, paidApplications, forRelease, releasedPermits, pendingPaymentVerification] = await Promise.all([
    prisma.businessApplication.count({ where: { status: "SUBMITTED" } }),
    prisma.businessApplication.count({ where: { status: "UNDER_REVIEW" } }),
    prisma.businessApplication.count({ where: { status: "RETURNED_FOR_CORRECTION" } }),
    prisma.businessApplication.count({ where: { status: "ASSESSED" } }),
    prisma.businessApplication.count({ where: { status: "PAID" } }),
    prisma.businessApplication.count({ where: { status: "FOR_RELEASE" } }),
    prisma.businessApplication.count({ where: { status: "RELEASED" } }),
    prisma.paymentReference.count({ where: { status: "PENDING" } }),
  ]);

  return {
    submittedApplications,
    underReview,
    returnedForCorrection,
    assessedApplications,
    approvedForPayment: pendingPaymentVerification,
    paidApplications,
    forRelease,
    releasedPermits,
  };
});

export async function getBploDashboardSummary() {
  return getCachedBploDashboardSummary();
}

// Cached query for application type summary - deduplicates per-request
const getCachedBploApplicationTypeSummary = cache(async () => {
  const [totalNew, totalRenewal, totalClosure] = await Promise.all([
    prisma.businessApplication.count({ where: { applicationType: "NEW" } }),
    prisma.businessApplication.count({ where: { applicationType: "RENEWAL" } }),
    prisma.businessApplication.count({ where: { applicationType: "CLOSURE" } }),
  ]);

  return {
    totalNew,
    totalRenewal,
    totalClosure,
  };
});

export async function getBploApplicationTypeSummary() {
  return getCachedBploApplicationTypeSummary();
}

export async function listRecentBploSubmissions(limit = 5): Promise<BploQueueRow[]> {
  return listBploApplications({ status: "SUBMITTED" }, limit);
}

function buildBploQueueWhere(filters: BploQueueFilters) {
  const normalizedSearch = filters.search?.trim();
  const requestedStatus =
    filters.status && filters.status !== "ALL" && BPLO_QUEUE_REVIEW_STATUSES.includes(filters.status)
      ? filters.status
      : undefined;

  return {
    status: requestedStatus ? requestedStatus : { in: BPLO_QUEUE_REVIEW_STATUSES },
    ...(filters.type && filters.type !== "ALL" ? { applicationType: filters.type } : {}),
    ...(normalizedSearch
      ? {
          OR: [
            { applicationNumber: { contains: normalizedSearch, mode: "insensitive" as const } },
            { applicant: { name: { contains: normalizedSearch, mode: "insensitive" as const } } },
            { applicant: { email: { contains: normalizedSearch, mode: "insensitive" as const } } },
            { businessRecord: { businessName: { contains: normalizedSearch, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

function mapBploQueueRow(row: any): BploQueueRow {
  return {
    id: row.businessApplicationId ?? row.id,
    applicationNumber: row.applicationNumber,
    businessName: resolveBusinessName(row.formData, row.businessRecord?.businessName ?? null),
    applicantName: formatPersonName({
      firstName: row.applicant.firstName,
      middleName: row.applicant.middleName,
      lastName: row.applicant.lastName,
      suffix: row.applicant.suffix,
      fallbackName: row.applicant.name,
    }),
    applicantEmail: row.applicant.email,
    applicationType: row.applicationType,
    status: mapDbStatusToUi(row.status),
    dateSubmitted: toDateOnly(row.submittedAt),
    applicantProfilePicturePath: row.applicant.profileImageStoragePath ?? null,
  };
}

const bploQueueInclude = {
  applicant: {
    select: {
      name: true,
      email: true,
      firstName: true,
      middleName: true,
      lastName: true,
      suffix: true,
      profileImageStoragePath: true,
    },
  },
  businessRecord: {
    select: {
      businessName: true,
    },
  },
} as const;

export async function listBploApplications(filters: BploQueueFilters = {}, limit?: number): Promise<BploQueueRow[]> {
  const rows = await prisma.businessApplication.findMany({
    where: buildBploQueueWhere(filters),
    include: bploQueueInclude,
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    ...(limit ? { take: limit } : {}),
  });

  return rows.map(mapBploQueueRow);
}

export async function listBploApplicationsPaginated(
  filters: BploQueueFilters = {},
  pagination?: { page?: number | string; pageSize?: number | string }
): Promise<PaginatedResult<BploQueueRow>> {
  const { page, pageSize, skip, take } = resolvePagination(pagination);
  const where = buildBploQueueWhere(filters);

  const [rows, totalCount] = await Promise.all([
    prisma.businessApplication.findMany({
      where,
      include: bploQueueInclude,
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.businessApplication.count({ where }),
  ]);

  return buildPaginatedResult(rows.map(mapBploQueueRow), totalCount, page, pageSize);
}

export async function getBploApplicationDetail(applicationId: string) {
  const row = await prisma.businessApplication.findUnique({
    where: { businessApplicationId: applicationId },
    include: {
      applicant: {
        select: {
          userId: true,
          name: true,
          email: true,
          firstName: true,
          middleName: true,
          lastName: true,
          suffix: true,
          profileImageStoragePath: true,
        },
      },
      businessRecord: true,
      documents: {
        orderBy: { uploadedAt: "asc" },
      },
      history: {
        include: {
          actor: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.businessApplicationId,
    applicationNumber: row.applicationNumber,
    applicant: {
      id: row.applicant.userId,
      name: row.applicant.name,
      email: row.applicant.email,
      firstName: row.applicant.firstName,
      middleName: row.applicant.middleName,
      lastName: row.applicant.lastName,
      suffix: row.applicant.suffix,
      profileImageStoragePath: row.applicant.profileImageStoragePath,
    },
    applicationType: row.applicationType,
    closureType: row.closureType ?? null,
    closureTypeOtherReason: row.closureTypeOtherReason ?? null,
    status: mapDbStatusToUi(row.status),
    rawStatus: row.status,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    businessName: resolveBusinessName(row.formData, row.businessRecord?.businessName ?? null),
    businessPhone: row.businessRecord?.phone ?? null,
    formData: row.formData,
    documents: row.documents.map((doc: any) => ({
      id: doc.applicationDocumentId,
      documentName: doc.documentName,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      uploadedAt: doc.uploadedAt.toISOString(),
      validationStatus: mapDocumentValidationStatusToUi(doc.validationStatus),
      validationRemarks: doc.validationRemarks ?? null,
      validatedAt: doc.validatedAt ? doc.validatedAt.toISOString() : null,
    })),
    history: row.history.map((item: any) => ({
      id: item.applicationHistoryId,
      fromStatus: item.fromStatus ? mapDbStatusToUi(item.fromStatus) : null,
      toStatus: mapDbStatusToUi(item.toStatus),
      remarks: item.remarks,
      actorName: item.actor?.name ?? "System",
      actorRole: item.actorRole,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function getBploApplicationDocument(applicationId: string, documentId: string) {
  const application = await prisma.businessApplication.findFirst({
    where: {
      businessApplicationId: applicationId,
    },
    select: {
      businessApplicationId: true,
      status: true,
    },
  });

  if (!application) {
    throw new Error("Application not found");
  }

  // Preview/download must work for any application BPLO can open by ID.
  // Queue-status gating applies only to validation mutations, not read access.
  if (application.status === "DRAFT") {
    throw new Error("Application is not available for BPLO review");
  }

  const document = await prisma.applicationDocument.findFirst({
    where: {
      applicationDocumentId: documentId,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  if (document.applicationId !== applicationId) {
    throw new Error("Document does not belong to the requested application");
  }

  return document;
}

export async function updateBploDocumentValidation(
  applicationId: string,
  documentId: string,
  bploUserId: string,
  input: {
    status: DocumentValidationStatus;
    remarks?: string;
  }
) {
  const application = await prisma.businessApplication.findFirst({
    where: { businessApplicationId: applicationId },
    select: { businessApplicationId: true, status: true },
  });

  if (!application) {
    throw new Error("Application not found");
  }

  if (!BPLO_QUEUE_REVIEW_STATUSES.includes(application.status as DbApplicationStatus)) {
    throw new Error("Application is not available for BPLO review");
  }

  const document = await prisma.applicationDocument.findFirst({
    where: { applicationDocumentId: documentId, applicationId },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  const normalizedRemarks = input.remarks?.trim() ?? "";
  if (remarksRequiredForValidationStatus(input.status) && !normalizedRemarks) {
    throw new Error("Remarks are required for this validation status");
  }

  const updated = await prisma.applicationDocument.update({
    where: { applicationDocumentId: document.applicationDocumentId },
    data: {
      validationStatus: input.status,
      validationRemarks: normalizedRemarks || null,
      validatedAt: new Date(),
      validatedById: bploUserId,
    },
  });

  return {
    id: updated.applicationDocumentId,
    documentName: updated.documentName,
    fileName: updated.fileName,
    mimeType: updated.mimeType,
    sizeBytes: updated.sizeBytes,
    uploadedAt: updated.uploadedAt.toISOString(),
    validationStatus: mapDocumentValidationStatusToUi(updated.validationStatus),
    validationRemarks: updated.validationRemarks,
    validatedAt: updated.validatedAt ? updated.validatedAt.toISOString() : null,
  };
}

export async function applyBploReviewAction(
  applicationId: string,
  bploUserId: string,
  action: BploReviewAction,
  remarks?: string
) {
  const normalizedRemarks = remarks?.trim();

  if (remarksRequired(action) && !normalizedRemarks) {
    throw new Error("Remarks are required for this action");
  }

  // Document readiness uses the global Prisma client — run it before opening an
  // interactive transaction so we do not hold a 5s txn open for extra queries.
  if (action === "APPROVE_FOR_ASSESSMENT") {
    const precheck = await prisma.businessApplication.findUnique({
      where: { businessApplicationId: applicationId },
      select: { businessApplicationId: true, status: true },
    });
    if (!precheck) {
      throw new Error("Application not found");
    }
    if (!canTransition(precheck.status, action)) {
      throw new Error("Invalid status transition");
    }
    await assertRequiredDocumentsReadyForApproval(applicationId);
  }

  return prisma.$transaction(
    async (tx: any) => {
      const current = await tx.businessApplication.findUnique({
        where: { businessApplicationId: applicationId },
        select: {
          businessApplicationId: true,
          status: true,
        },
      });

      if (!current) {
        throw new Error("Application not found");
      }

      if (!canTransition(current.status, action)) {
        throw new Error("Invalid status transition");
      }

      const nextStatus = getNextStatus(action);
      assertStatusTransition(current.status, nextStatus);

      const updated = await tx.businessApplication.update({
        where: { businessApplicationId: current.businessApplicationId },
        data: {
          status: nextStatus,
        },
        select: {
          businessApplicationId: true,
          applicationNumber: true,
          status: true,
        },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId: current.businessApplicationId,
          actorId: bploUserId,
          actorRole: "BPLO",
          fromStatus: current.status,
          toStatus: nextStatus,
          remarks: normalizedRemarks ?? null,
        },
      });

      return {
        id: updated.businessApplicationId,
        applicationNumber: updated.applicationNumber,
        status: mapDbStatusToUi(updated.status),
      };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
}
