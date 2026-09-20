import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { DocumentValidationStatus } from "@prisma/client";
import {
  mapDocumentValidationStatusToUi,
  remarksRequiredForValidationStatus,
} from "@/lib/document-validation";
import { assertRequiredDocumentsReadyForApproval } from "@/lib/document-validation-server";
import { assertStatusTransition } from "@/lib/application-status";
import { mapDbStatusToUi } from "@/lib/application-mappers";
import { createAuditLog } from "@/lib/audit-log";
import {
  buildRevocationContextFromParts,
  buildRevocationHistoryRemarksForEvent,
} from "@/lib/revocation-notifications";
import { getJitInspectionChecklist } from "@/lib/jit-declared-inputs";
import { buildPaginatedResult, resolvePagination, type PaginatedResult } from "@/lib/pagination";

type DepartmentHeadAction = "APPROVE" | "RETURN" | "REJECT";
type RevocationDecisionAction = "APPROVE" | "DENY";

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

export interface DepartmentHeadApprovalRow {
  id: string;
  applicationNumber: string;
  applicationType: "NEW" | "RENEWAL" | "CLOSURE";
  closureType: string | null;
  closureTypeOtherReason: string | null;
  ownerName: string;
  businessName: string;
  businessType: string;
  lineOfBusiness: string;
  businessAddress: string;
  submittedDate: string;
  updatedDate: string;
  currentStatus: string;
  bploRemarks: string | null;
  formData: Record<string, unknown>;
  history: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorRole: string;
    remarks: string | null;
    createdAt: string;
  }>;
  documents: Array<{
    id: string;
    documentName: string;
    fileName: string;
    uploadedAt: string;
    validationStatus?: string;
    validationRemarks?: string | null;
  }>;
}

export interface DepartmentHeadPermitToRevokeRow {
  inspectionId: string;
  businessRecordId: string;
  applicationId: string;
  applicationNumber: string;
  permitOrCertificateNumber: string | null;
  businessName: string;
  tradeName: string | null;
  businessType: string;
  ownerName: string;
  applicantName: string;
  businessAddress: string;
  lineOfBusiness: string;
  inspectionDate: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  inspectorName: string;
  inspectorComment: string | null;
  evidenceFileName: string | null;
  evidenceMimeType: string | null;
  hasEvidence: boolean;
  inspectionStatus: string;
  applicationStatus: string;
}

export interface DepartmentHeadInspectionVerificationRow {
  inspectionId: string;
  businessRecordId: string;
  applicationId: string;
  applicationNumber: string;
  permitOrCertificateNumber: string | null;
  businessName: string;
  tradeName: string | null;
  ownerName: string;
  applicantName: string;
  businessAddress: string;
  businessType: string;
  lineOfBusiness: string;
  inspectionDate: string;
  inspectorName: string;
  inspectionStatus: string;
  complianceStatus: string;
  inspectorComment: string | null;
  evidenceFileName: string | null;
  evidenceMimeType: string | null;
  hasEvidence: boolean;
  applicationStatus: string;
}

export interface DepartmentHeadCompliantListRow {
  inspectionId: string;
  businessRecordId: string;
  applicationId: string;
  applicationNumber: string;
  permitOrCertificateNumber: string | null;
  businessName: string;
  tradeName: string | null;
  ownerName: string;
  applicantName: string;
  businessAddress: string;
  businessType: string;
  lineOfBusiness: string;
  jitComment: string | null;
  inspectionDate: string;
  verifiedAt: string;
  verifiedBy: string;
  evidenceFileName: string | null;
  evidenceMimeType: string | null;
  hasEvidence: boolean;
  inspectionStatus: string;
}

export interface DepartmentHeadRevokedPermitRow {
  inspectionId: string;
  businessRecordId: string;
  applicationId: string;
  applicationNumber: string;
  permitOrCertificateNumber: string | null;
  businessName: string;
  ownerName: string;
  applicantName: string;
  businessAddress: string;
  lineOfBusiness: string;
  jitInspectionDate: string;
  jitInspectorName: string;
  jitComment: string | null;
  revocationRemarks: string | null;
  revocationDecisionDate: string;
  decidedByName: string;
  evidenceFileName: string | null;
  evidenceMimeType: string | null;
  hasEvidence: boolean;
  inspectionStatus: string;
  applicationStatus: string;
  businessStatus: string;
  revocationSettledAt: string | null;
  revocationSettledBy: string | null;
  revocationSettlementRemarks: string | null;
  isSettled: boolean;
}

function toDateTime(date: Date | null): string {
  if (!date) return "-";
  return date.toISOString();
}

function getTextField(formData: unknown, key: string, fallback = "-"): string {
  if (!formData || typeof formData !== "object" || Array.isArray(formData)) {
    return fallback;
  }
  const maybe = formData as Record<string, unknown>;
  const value = maybe[key];
  if (typeof value === "string" && value.trim().length > 0) return value;
  return fallback;
}

function getNextStatus(action: DepartmentHeadAction): DbApplicationStatus {
  if (action === "APPROVE") return "DEPARTMENT_HEAD_APPROVED";
  if (action === "RETURN") return "RETURNED_FOR_CORRECTION";
  return "REJECTED";
}

function remarksRequired(action: DepartmentHeadAction): boolean {
  return action === "RETURN" || action === "REJECT";
}

function toRevocationInspectionStatus(action: RevocationDecisionAction) {
  return action === "APPROVE" ? "REVOKED" : "REVOCATION_DENIED";
}

export async function listDepartmentHeadApprovalQueue(): Promise<DepartmentHeadApprovalRow[]> {
  const result = await listDepartmentHeadApprovalQueuePaginated({ page: 1, pageSize: 50 });
  return result.records;
}

export async function listDepartmentHeadApprovalQueuePaginated(options?: {
  page?: number | string;
  pageSize?: number | string;
}): Promise<PaginatedResult<DepartmentHeadApprovalRow>> {
  const { page, pageSize, skip, take } = resolvePagination(options);
  const where = { status: "DEPARTMENT_HEAD_REVIEW" as const };

  const [rows, totalCount] = await Promise.all([
    prisma.businessApplication.findMany({
      where,
      include: {
        applicant: { select: { name: true } },
        businessRecord: { select: { businessName: true } },
        documents: { orderBy: { uploadedAt: "asc" } },
        history: {
          include: {
            actor: {
              select: {
                role: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      skip,
      take,
    }),
    prisma.businessApplication.count({ where }),
  ]);

  const records = rows.map((row: any) => ({
    id: row.id,
    applicationNumber: row.applicationNumber,
    applicationType: row.applicationType,
    closureType: row.closureType ?? null,
    closureTypeOtherReason: row.closureTypeOtherReason ?? null,
    ownerName: getTextField(row.formData, "ownerName", row.applicant?.name ?? "-"),
    businessName: getTextField(row.formData, "businessName", row.businessRecord?.businessName ?? "-"),
    businessType: getTextField(row.formData, "businessType"),
    lineOfBusiness: getTextField(
      row.formData,
      "closureLineOfBusiness",
      getTextField(row.formData, "lineOfBusiness")
    ),
    businessAddress: getTextField(row.formData, "businessAddress"),
    submittedDate: toDateTime(row.submittedAt),
    updatedDate: toDateTime(row.updatedAt),
    currentStatus: mapDbStatusToUi(row.status),
    bploRemarks:
      row.history.find((item: any) => item.actorRole === "BPLO" && typeof item.remarks === "string" && item.remarks.trim().length > 0)?.remarks?.trim() || null,
    formData: (row.formData ?? {}) as Record<string, unknown>,
    history: row.history.map((item: any) => ({
      id: item.id,
      fromStatus: item.fromStatus ? mapDbStatusToUi(item.fromStatus) : null,
      toStatus: mapDbStatusToUi(item.toStatus),
      actorRole: item.actorRole,
      remarks: item.remarks,
      createdAt: item.createdAt.toISOString(),
    })),
    documents: row.documents.map((doc: any) => ({
      id: doc.id,
      documentName: doc.documentName,
      fileName: doc.fileName,
      uploadedAt: doc.uploadedAt.toISOString(),
      validationStatus: mapDocumentValidationStatusToUi(doc.validationStatus),
      validationRemarks: doc.validationRemarks ?? null,
    })),
  }));

  return buildPaginatedResult(records, totalCount, page, pageSize);
}

export async function applyDepartmentHeadAction(
  applicationId: string,
  departmentHeadUserId: string,
  action: DepartmentHeadAction,
  remarks?: string
) {
  const normalizedRemarks = remarks?.trim();

  if (remarksRequired(action) && !normalizedRemarks) {
    throw new Error("Remarks are required for this action");
  }

  // Document readiness uses the global Prisma client — run it before opening an
  // interactive transaction so we do not hold a 5s txn open for extra queries.
  if (action === "APPROVE") {
    const precheck = await prisma.businessApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, status: true },
    });
    if (!precheck) {
      throw new Error("Application not found");
    }
    if (precheck.status !== "DEPARTMENT_HEAD_REVIEW") {
      throw new Error("Application is not in Department Head review stage");
    }
    await assertRequiredDocumentsReadyForApproval(applicationId);
  }

  return prisma.$transaction(
    async (tx: any) => {
      const current = await tx.businessApplication.findUnique({
        where: { id: applicationId },
        select: { id: true, status: true, applicationNumber: true, applicationType: true },
      });

      if (!current) {
        throw new Error("Application not found");
      }

      if (current.status !== "DEPARTMENT_HEAD_REVIEW") {
        throw new Error("Application is not in Department Head review stage");
      }

      const nextStatus = getNextStatus(action);
      assertStatusTransition(current.status, nextStatus);

      const updated = await tx.businessApplication.update({
        where: { id: current.id },
        data: { status: nextStatus },
        select: { id: true, applicationNumber: true, status: true },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId: current.id,
          actorId: departmentHeadUserId,
          actorRole: "DEPARTMENT_HEAD",
          fromStatus: current.status,
          toStatus: nextStatus,
          remarks: normalizedRemarks ?? null,
        },
      });

      return {
        id: updated.id,
        applicationNumber: updated.applicationNumber,
        applicationType: current.applicationType,
        status: mapDbStatusToUi(updated.status),
      };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
}

export async function updateDepartmentHeadDocumentValidation(
  applicationId: string,
  documentId: string,
  departmentHeadUserId: string,
  input: {
    status: DocumentValidationStatus;
    remarks?: string;
  }
) {
  const application = await prisma.businessApplication.findFirst({
    where: { id: applicationId },
    select: { id: true, status: true },
  });

  if (!application) {
    throw new Error("Application not found");
  }

  if (application.status !== "DEPARTMENT_HEAD_REVIEW") {
    throw new Error("Application is not available for Department Head review");
  }

  const document = await prisma.applicationDocument.findFirst({
    where: { id: documentId, applicationId },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  const normalizedRemarks = input.remarks?.trim() ?? "";
  if (remarksRequiredForValidationStatus(input.status) && !normalizedRemarks) {
    throw new Error("Remarks are required for this validation status");
  }

  const updated = await prisma.applicationDocument.update({
    where: { id: document.id },
    data: {
      validationStatus: input.status,
      validationRemarks: normalizedRemarks || null,
      validatedAt: new Date(),
      validatedById: departmentHeadUserId,
    },
  });

  return {
    id: updated.id,
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

export async function listDepartmentHeadRevocationQueue(): Promise<DepartmentHeadPermitToRevokeRow[]> {
  const result = await listDepartmentHeadRevocationQueuePaginated({ page: 1, pageSize: 50 });
  return result.records;
}

export async function listDepartmentHeadRevocationQueuePaginated(options?: {
  page?: number | string;
  pageSize?: number | string;
}): Promise<PaginatedResult<DepartmentHeadPermitToRevokeRow>> {
  const { page, pageSize, skip, take } = resolvePagination(options);
  const where = {
    status: "VERIFIED_NON_COMPLIANT" as const,
    complianceStatus: "NON_COMPLIANT" as const,
    revocationDecision: null,
    application: {
      status: "REVOCATION_REVIEW" as const,
    },
  };

  const [rows, totalCount] = await Promise.all([
    prisma.inspection.findMany({
      where,
      include: {
        inspector: { select: { name: true } },
        decidedBy: { select: { name: true } },
        revocationSettledBy: { select: { name: true } },
        application: {
          select: {
            id: true,
            applicationNumber: true,
            status: true,
            permitIssuance: { select: { documentNumber: true } },
          },
        },
        businessRecord: {
          select: {
            businessName: true,
            tradeName: true,
            businessType: true,
            ownerName: true,
            businessAddress: true,
            lineOfBusiness: true,
            applicant: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
      skip,
      take,
    }),
    prisma.inspection.count({ where }),
  ]);

  const records = rows
    .filter((row: any) => Boolean(row.application))
    .map((row: any) => ({
      inspectionId: row.id,
      businessRecordId: row.businessRecordId,
      applicationId: row.applicationId,
      applicationNumber: row.application.applicationNumber,
      permitOrCertificateNumber: row.application.permitIssuance?.documentNumber ?? null,
      businessName: row.businessRecord.businessName,
      tradeName: row.businessRecord.tradeName ?? null,
      businessType: row.businessRecord.businessType ?? "-",
      ownerName: row.businessRecord.ownerName,
      applicantName: row.businessRecord.applicant?.name ?? "-",
      businessAddress: row.businessRecord.businessAddress,
      lineOfBusiness: row.businessRecord.lineOfBusiness ?? "-",
      inspectionDate: row.createdAt.toISOString(),
      verifiedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      verifiedBy: row.decidedBy?.name ?? null,
      inspectorName: row.inspector.name,
      inspectorComment: row.comment?.trim() || null,
      evidenceFileName: row.evidenceFileName,
      evidenceMimeType: row.evidenceMimeType,
      hasEvidence: Boolean(row.evidenceStoragePath),
      inspectionStatus: row.status,
      applicationStatus: mapDbStatusToUi(row.application.status),
    }));

  return buildPaginatedResult(records, totalCount, page, pageSize);
}

export async function listDepartmentHeadInspectionVerificationQueue(): Promise<DepartmentHeadInspectionVerificationRow[]> {
  const result = await listDepartmentHeadInspectionVerificationQueuePaginated({
    page: 1,
    pageSize: 50,
  });
  return result.records;
}

export async function listDepartmentHeadInspectionVerificationQueuePaginated(options?: {
  page?: number | string;
  pageSize?: number | string;
}): Promise<PaginatedResult<DepartmentHeadInspectionVerificationRow>> {
  const { page, pageSize, skip, take } = resolvePagination(options);
  const where = {
    status: "DH_VERIFICATION_PENDING" as const,
    application: {
      status: "RELEASED" as const,
    },
    businessRecord: {
      businessStatus: "ACTIVE" as const,
    },
  };

  const [rows, totalCount] = await Promise.all([
    prisma.inspection.findMany({
      where,
      include: {
        inspector: { select: { name: true } },
        application: {
          select: {
            id: true,
            applicationNumber: true,
            status: true,
            applicationType: true,
            permitIssuance: { select: { documentNumber: true } },
          },
        },
        businessRecord: {
          select: {
            businessName: true,
            tradeName: true,
            businessType: true,
            ownerName: true,
            businessAddress: true,
            lineOfBusiness: true,
            applicant: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
      skip,
      take,
    }),
    prisma.inspection.count({ where }),
  ]);

  const records = rows
    .filter((row: any) => Boolean(row.application))
    .map((row: any) => ({
      inspectionId: row.id,
      businessRecordId: row.businessRecordId,
      applicationId: row.applicationId,
      applicationNumber: row.application.applicationNumber,
      permitOrCertificateNumber: row.application.permitIssuance?.documentNumber ?? null,
      businessName: row.businessRecord.businessName,
      tradeName: row.businessRecord.tradeName ?? null,
      ownerName: row.businessRecord.ownerName,
      applicantName: row.businessRecord.applicant?.name ?? "-",
      businessAddress: row.businessRecord.businessAddress,
      businessType: row.businessRecord.businessType ?? "-",
      lineOfBusiness: row.businessRecord.lineOfBusiness ?? "-",
      inspectionDate: row.createdAt.toISOString(),
      inspectorName: row.inspector.name,
      inspectionStatus: row.status,
      complianceStatus: row.complianceStatus,
      inspectorComment: row.comment?.trim() || null,
      evidenceFileName: row.evidenceFileName,
      evidenceMimeType: row.evidenceMimeType,
      hasEvidence: Boolean(row.evidenceStoragePath),
      applicationStatus: mapDbStatusToUi(row.application.status),
    }));

  return buildPaginatedResult(records, totalCount, page, pageSize);
}

export async function getDepartmentHeadInspectionChecklistForVerification(inspectionId: string) {
  const inspection = await prisma.inspection.findFirst({
    where: {
      id: inspectionId,
      status: "DH_VERIFICATION_PENDING",
    },
    select: { id: true },
  });

  if (!inspection) {
    throw new Error("Inspection not found");
  }

  return getJitInspectionChecklist(inspectionId);
}

export interface DepartmentHeadSettlementRow {
  inspectionId: string;
  businessRecordId: string;
  applicationId: string | null;
  applicationNumber: string | null;
  permitOrCertificateNumber: string | null;
  businessName: string;
  tradeName: string | null;
  ownerName: string;
  applicantName: string;
  businessAddress: string;
  lineOfBusiness: string;
  nonComplianceType: string | null;
  violationSeverity: string | null;
  complianceCaseStatus: string;
  inspectionRemarks: string | null;
  verificationRemarks: string | null;
  verifiedAt: string | null;
  deadlineAt: string | null;
}

/**
 * List eligible settlement cases for Department Head
 */
export async function listDepartmentHeadSettlementCases(): Promise<DepartmentHeadSettlementRow[]> {
  const rows = await prisma.inspection.findMany({
    where: {
      nonComplianceType: "GOVERNMENT_AGENCY_RELATED",
      violationSeverity: { in: ["MINOR", "MAJOR"] },
      complianceCaseStatus: "FLAGGED_UNSETTLED",
      isSettled: false,
      forcedClosure: false,
    },
    include: {
      decidedBy: { select: { name: true } },
      application: { select: { id: true, applicationNumber: true, permitIssuance: { select: { documentNumber: true } } } },
      businessRecord: { select: { businessName: true, tradeName: true, ownerName: true, businessAddress: true, lineOfBusiness: true, applicant: { select: { name: true, id: true } }, phone: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  return rows.map((row: any) => ({
    inspectionId: row.id,
    businessRecordId: row.businessRecordId,
    applicationId: row.applicationId ?? null,
    applicationNumber: row.application?.applicationNumber ?? null,
    permitOrCertificateNumber: row.application?.permitIssuance?.documentNumber ?? null,
    businessName: row.businessRecord.businessName,
    tradeName: row.businessRecord.tradeName ?? null,
    ownerName: row.businessRecord.ownerName,
    applicantName: row.businessRecord.applicant?.name ?? "-",
    businessAddress: row.businessRecord.businessAddress,
    lineOfBusiness: row.businessRecord.lineOfBusiness ?? "-",
    nonComplianceType: row.nonComplianceType ?? null,
    violationSeverity: row.violationSeverity ?? null,
    complianceCaseStatus: row.complianceCaseStatus,
    inspectionRemarks: row.comment?.trim() || null,
    verificationRemarks: row.decidedAt ? `Verified by Department Head` : null,
    verifiedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
  }));
}

/**
 * Mark an eligible inspection compliance case as settled
 */
export async function applyDepartmentHeadSettlement(
  inspectionId: string,
  departmentHeadUserId: string,
  settlementRemarks?: string
) {
  const normalizedRemarks = settlementRemarks?.trim();
  if (!normalizedRemarks) throw new Error("Settlement remarks are required");

  return prisma.$transaction(
    async (tx: any) => {
      const inspection = await tx.inspection.findUnique({
        where: { id: inspectionId },
        include: {
          application: { select: { id: true, applicationNumber: true, status: true } },
          businessRecord: {
            select: {
              id: true,
              businessName: true,
              ownerName: true,
              applicant: { select: { id: true, name: true } },
              phone: true,
            },
          },
        },
      });

      if (!inspection) throw new Error("Inspection not found");

      if (inspection.nonComplianceType !== "GOVERNMENT_AGENCY_RELATED") {
        throw new Error("Only government-agency-related cases can be settled here");
      }

      if (!inspection.violationSeverity || !["MINOR", "MAJOR"].includes(inspection.violationSeverity)) {
        throw new Error("Only MINOR or MAJOR cases can be settled through this action");
      }

      if (inspection.complianceCaseStatus !== "FLAGGED_UNSETTLED") {
        throw new Error("Case is not in FLAGGED_UNSETTLED status");
      }

      if (inspection.isSettled) {
        throw new Error("Case is already settled");
      }

      if (inspection.forcedClosure) {
        throw new Error("Forced closure cases cannot be settled here");
      }

      const previousStatus = inspection.complianceCaseStatus;
      const previousApplicationStatus = inspection.application?.status ?? null;
      let restoredApplicationStatus: string | null = null;

      const updated = await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          isSettled: true,
          settledAt: new Date(),
          settledById: departmentHeadUserId,
          complianceCaseStatus: "SETTLED",
          settlementRemarks: normalizedRemarks,
        },
      });

      // Settled minor/major government cases leave the revocation track so renewal can proceed.
      if (inspection.application?.id && inspection.application.status === "REVOCATION_REVIEW") {
        assertStatusTransition(inspection.application.status, "RELEASED");
        await tx.businessApplication.update({
          where: { id: inspection.application.id },
          data: { status: "RELEASED" },
        });
        restoredApplicationStatus = "RELEASED";

        await tx.applicationHistory.create({
          data: {
            applicationId: inspection.application.id,
            actorId: departmentHeadUserId,
            actorRole: "DEPARTMENT_HEAD",
            fromStatus: previousApplicationStatus,
            toStatus: "RELEASED",
            remarks: `Department Head marked flagged case as SETTLED and restored the permit for renewal. Remarks: ${normalizedRemarks}`,
          },
        });
      } else if (inspection.application?.id) {
        await tx.applicationHistory.create({
          data: {
            applicationId: inspection.application.id,
            actorId: departmentHeadUserId,
            actorRole: "DEPARTMENT_HEAD",
            fromStatus: inspection.application.status,
            toStatus: inspection.application.status,
            remarks: `Department Head marked flagged case as SETTLED. Remarks: ${normalizedRemarks}`,
          },
        });
      }

      try {
        await createAuditLog({
          actorId: departmentHeadUserId,
          actorRole: "DEPARTMENT_HEAD",
          action: "SETTLED",
          module: "INSPECTION",
          entityType: "INSPECTION",
          entityId: inspection.id,
          inspectionId: inspection.id,
          applicationId: inspection.application?.id ?? null,
          businessRecordId: inspection.businessRecordId,
          beforeStatus: previousStatus,
          afterStatus: "SETTLED",
          description: "Department Head marked government-agency-related compliance case as SETTLED.",
          metadata: {
            settlementRemarks: normalizedRemarks,
            restoredApplicationStatus,
          },
        });
      } catch (err) {
        console.error("[Settlement] audit failed", err instanceof Error ? err.message : String(err));
      }

      try {
        if (inspection.application?.id) {
          const phone = inspection.businessRecord?.phone ?? null;
          await tx.smsDeliveryLog.create({
            data: {
              applicationId: inspection.application.id,
              applicantId: inspection.businessRecord?.applicant?.id ?? null,
              phoneNumber: phone,
              provider: "none",
              status: "SKIPPED",
              messageBody:
                "Your business compliance case has been marked as settled. You may continue with eligible transactions such as renewal, subject to normal system rules.",
            },
          });
        }
      } catch (err) {
        console.error("[Settlement] notification log failed", err instanceof Error ? err.message : String(err));
      }

      return {
        inspectionId: updated.id,
        applicationId: inspection.application?.id ?? null,
        businessRecordId: inspection.businessRecordId,
        complianceCaseStatus: updated.complianceCaseStatus,
        settledAt: updated.settledAt,
        restoredApplicationStatus,
      };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
}

export async function applyDepartmentHeadInspectionVerification(
  inspectionId: string,
  departmentHeadUserId: string,
  remarks?: string,
  nonComplianceType?: string,
  violationSeverity?: string,
  complianceDecision?: string
) {
  const normalizedRemarks = remarks?.trim();

  if (!normalizedRemarks) {
    throw new Error("Verification remarks are required");
  }

  return prisma.$transaction(async (tx: any) => {
    const inspection = await tx.inspection.findUnique({
      where: { id: inspectionId },
      include: {
        inspector: { select: { name: true } },
        application: {
          select: {
            id: true,
            status: true,
            applicationNumber: true,
            applicantId: true,
            applicant: { select: { email: true } },
            permitIssuance: { select: { documentNumber: true } },
          },
        },
        businessRecord: {
          select: {
            id: true,
            businessStatus: true,
            businessName: true,
          },
        },
      },
    });

    if (!inspection) {
      throw new Error("Inspection not found");
    }

    if (inspection.status !== "DH_VERIFICATION_PENDING") {
      throw new Error("Inspection is not pending Department Head verification");
    }

    if (!inspection.application || inspection.application.status !== "RELEASED") {
      throw new Error("Inspection application is not released");
    }

    if (!inspection.businessRecord || inspection.businessRecord.businessStatus !== "ACTIVE") {
      throw new Error("Business is not active");
    }

    if (inspection.inspectorId === departmentHeadUserId) {
      throw new Error("JIT cannot verify its own submitted inspection");
    }

    if (inspection.complianceStatus === "COMPLIANT" || (inspection.complianceStatus === "PENDING_REVIEW" && complianceDecision === "COMPLIANT")) {
      await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          status: "VERIFIED_COMPLIANT",
          complianceStatus: "COMPLIANT",
          decidedById: departmentHeadUserId,
          decidedAt: new Date(),
        },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId: inspection.application.id,
          actorId: departmentHeadUserId,
          actorRole: "DEPARTMENT_HEAD",
          fromStatus: "RELEASED",
          toStatus: "RELEASED",
          remarks: `Department Head verified COMPLIANT inspection. Remarks: ${normalizedRemarks}`,
        },
      });

      return {
        inspectionId: inspection.id,
        applicationId: inspection.application.id,
        applicationNumber: inspection.application.applicationNumber,
        inspectionStatus: "VERIFIED_COMPLIANT",
        applicationStatus: mapDbStatusToUi(inspection.application.status),
        complianceStatus: inspection.complianceStatus,
      };
    }

    // NON_COMPLIANT path: require nonComplianceType and violationSeverity
    const validNonComplianceTypes = ["GOVERNMENT_AGENCY_RELATED", "RENEWAL_RELATED"];
    const validViolationSeverities = ["MINOR", "MAJOR", "SEVERE"];

    if (!nonComplianceType || !validNonComplianceTypes.includes(nonComplianceType)) {
      throw new Error("non-compliance type is required and must be GOVERNMENT_AGENCY_RELATED or RENEWAL_RELATED");
    }

    if (!violationSeverity || !validViolationSeverities.includes(violationSeverity)) {
      throw new Error("violation severity is required and must be MINOR, MAJOR, or SEVERE");
    }

    // Determine complianceCaseStatus and forced closure flags based on severity and type
    let complianceCaseStatus = "FLAGGED_UNSETTLED";
    let forcedClosureFlag = false;
    let forcedClosureAtTime: Date | null = null;

    // GOVERNMENT_AGENCY_RELATED + SEVERE => FORCED_CLOSURE_PENDING + forcedClosure
    if (nonComplianceType === "GOVERNMENT_AGENCY_RELATED" && violationSeverity === "SEVERE") {
      complianceCaseStatus = "FORCED_CLOSURE_PENDING";
      forcedClosureFlag = true;
      forcedClosureAtTime = new Date();
    }

    // All other combinations are FLAGGED_UNSETTLED for settlement workflow

    assertStatusTransition(inspection.application.status, "REVOCATION_REVIEW");

    await tx.businessApplication.update({
      where: { id: inspection.application.id },
      data: { status: "REVOCATION_REVIEW" },
    });

    await tx.inspection.update({
      where: { id: inspection.id },
      data: {
        status: "VERIFIED_NON_COMPLIANT",
        complianceStatus: "NON_COMPLIANT",
        decidedById: departmentHeadUserId,
        decidedAt: new Date(),
        nonComplianceType: nonComplianceType,
        violationSeverity: violationSeverity,
        complianceCaseStatus: complianceCaseStatus,
        isSettled: false,
        forcedClosure: forcedClosureFlag,
        forcedClosureAt: forcedClosureAtTime,
        forcedClosureById: forcedClosureFlag ? departmentHeadUserId : null,
      },
    });

    const departmentHeadUser = await tx.user.findUnique({
      where: { id: departmentHeadUserId },
      select: { name: true },
    });

    const revocationContext = buildRevocationContextFromParts({
      applicationId: inspection.application.id,
      applicationNumber: inspection.application.applicationNumber,
      applicantId: inspection.application.applicantId,
      applicantEmail: inspection.application.applicant.email,
      inspectionId: inspection.id,
      businessName: inspection.businessRecord.businessName,
      permitNumber: inspection.application.permitIssuance?.documentNumber ?? null,
      recommendationRemarks: inspection.revocationRecommendationRemarks ?? inspection.revocationRemarks,
      inspectionComment: inspection.comment,
      nonComplianceType,
      violationSeverity,
      departmentHeadRemarks: normalizedRemarks,
      eventDate: new Date(),
      departmentOfficerLabel: departmentHeadUser?.name ?? "Department Head",
      eventType: "REVOCATION_REVIEW_ENTERED",
    });

    await tx.applicationHistory.create({
      data: {
        applicationId: inspection.application.id,
        actorId: departmentHeadUserId,
        actorRole: "DEPARTMENT_HEAD",
        fromStatus: "RELEASED",
        toStatus: "REVOCATION_REVIEW",
        remarks: buildRevocationHistoryRemarksForEvent("REVOCATION_REVIEW_ENTERED", revocationContext),
      },
    });

    return {
      inspectionId: inspection.id,
      applicationId: inspection.application.id,
      applicationNumber: inspection.application.applicationNumber,
      inspectionStatus: "VERIFIED_NON_COMPLIANT",
      applicationStatus: mapDbStatusToUi("REVOCATION_REVIEW"),
      complianceStatus: inspection.complianceStatus,
      nonComplianceType,
      violationSeverity,
      complianceCaseStatus,
    };
  });
}

export async function listDepartmentHeadCompliantList(): Promise<DepartmentHeadCompliantListRow[]> {
  const rows = await prisma.inspection.findMany({
    where: {
      status: "VERIFIED_COMPLIANT",
      complianceStatus: "COMPLIANT",
      application: {
        status: "RELEASED",
      },
      businessRecord: {
        businessStatus: "ACTIVE",
      },
    },
    include: {
      inspector: { select: { name: true } },
      decidedBy: { select: { name: true } },
      application: {
        select: {
          id: true,
          applicationNumber: true,
          permitIssuance: { select: { documentNumber: true } },
        },
      },
      businessRecord: {
        select: {
          businessName: true,
          tradeName: true,
          businessType: true,
          ownerName: true,
          businessAddress: true,
          lineOfBusiness: true,
          applicant: { select: { name: true } },
        },
      },
    },
    orderBy: [{ decidedAt: "desc" }, { createdAt: "desc" }],
  });

  return rows
    .filter((row: any) => Boolean(row.application) && Boolean(row.decidedAt) && Boolean(row.decidedBy))
    .map((row: any) => ({
      inspectionId: row.id,
      businessRecordId: row.businessRecordId,
      applicationId: row.applicationId,
      applicationNumber: row.application.applicationNumber,
      permitOrCertificateNumber: row.application.permitIssuance?.documentNumber ?? null,
      businessName: row.businessRecord.businessName,
      tradeName: row.businessRecord.tradeName ?? null,
      ownerName: row.businessRecord.ownerName,
      applicantName: row.businessRecord.applicant?.name ?? "-",
      businessAddress: row.businessRecord.businessAddress,
      businessType: row.businessRecord.businessType ?? "-",
      lineOfBusiness: row.businessRecord.lineOfBusiness ?? "-",
      jitComment: row.comment?.trim() || null,
      inspectionDate: row.createdAt.toISOString(),
      verifiedAt: row.decidedAt.toISOString(),
      verifiedBy: row.decidedBy?.name ?? row.inspector.name,
      evidenceFileName: row.evidenceFileName,
      evidenceMimeType: row.evidenceMimeType,
      hasEvidence: Boolean(row.evidenceStoragePath),
      inspectionStatus: row.status,
    }));
}

export async function listDepartmentHeadRevokedPermitList(): Promise<DepartmentHeadRevokedPermitRow[]> {
  const result = await listDepartmentHeadRevokedPermitListPaginated({ page: 1, pageSize: 50 });
  return result.records;
}

export async function listDepartmentHeadRevokedPermitListPaginated(options?: {
  page?: number | string;
  pageSize?: number | string;
}): Promise<PaginatedResult<DepartmentHeadRevokedPermitRow>> {
  const { page, pageSize, skip, take } = resolvePagination(options);

  const where = {
    revocationDecision: "APPROVED" as const,
    status: "REVOKED" as const,
    decidedAt: { not: null },
    application: {
      status: "REVOKED" as const,
    },
    businessRecord: {
      businessStatus: "INACTIVE" as const,
    },
  };

  const [rows, totalCount] = await Promise.all([
    prisma.inspection.findMany({
      where,
      include: {
        inspector: { select: { name: true } },
        decidedBy: { select: { name: true } },
        revocationSettledBy: { select: { name: true } },
        application: {
          select: {
            id: true,
            applicationNumber: true,
            status: true,
            permitIssuance: { select: { documentNumber: true } },
          },
        },
        businessRecord: {
          select: {
            businessName: true,
            ownerName: true,
            businessAddress: true,
            lineOfBusiness: true,
            businessStatus: true,
            applicant: { select: { name: true } },
          },
        },
      },
      orderBy: [{ decidedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.inspection.count({ where }),
  ]);

  const records = rows
    .filter((row: any) => Boolean(row.application) && Boolean(row.decidedAt))
    .map((row: any) => ({
      inspectionId: row.id,
      businessRecordId: row.businessRecordId,
      applicationId: row.applicationId,
      applicationNumber: row.application.applicationNumber,
      permitOrCertificateNumber: row.application.permitIssuance?.documentNumber ?? null,
      businessName: row.businessRecord.businessName,
      ownerName: row.businessRecord.ownerName,
      applicantName: row.businessRecord.applicant?.name ?? "-",
      businessAddress: row.businessRecord.businessAddress,
      lineOfBusiness: row.businessRecord.lineOfBusiness ?? "-",
      jitInspectionDate: row.createdAt.toISOString(),
      jitInspectorName: row.inspector.name,
      jitComment: row.comment?.trim() || null,
      revocationRemarks: row.revocationRemarks?.trim() || null,
      revocationDecisionDate: row.decidedAt.toISOString(),
      decidedByName: row.decidedBy?.name ?? "-",
      evidenceFileName: row.evidenceFileName,
      evidenceMimeType: row.evidenceMimeType,
      hasEvidence: Boolean(row.evidenceStoragePath),
      inspectionStatus: row.status,
      applicationStatus: mapDbStatusToUi(row.application.status),
      businessStatus: row.businessRecord.businessStatus,
      revocationSettledAt: row.revocationSettledAt ? row.revocationSettledAt.toISOString() : null,
      revocationSettledBy: row.revocationSettledBy?.name ?? null,
      revocationSettlementRemarks: row.revocationSettlementRemarks?.trim() || null,
      isSettled: Boolean(row.revocationSettledAt),
    }));

  return buildPaginatedResult(records, totalCount, page, pageSize);
}

export async function applyDepartmentHeadRevocationDecision(
  inspectionId: string,
  departmentHeadUserId: string,
  action: RevocationDecisionAction,
  remarks?: string
) {
  const normalizedRemarks = remarks?.trim();

  if (!normalizedRemarks) {
    throw new Error("Department Head remarks are required.");
  }

  return prisma.$transaction(async (tx: any) => {
    const inspection = await tx.inspection.findUnique({
      where: { id: inspectionId },
      include: {
        inspector: { select: { name: true } },
        application: {
          select: {
            id: true,
            status: true,
            applicationNumber: true,
            applicantId: true,
            applicant: { select: { email: true } },
            permitIssuance: { select: { documentNumber: true } },
          },
        },
        businessRecord: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
    });

    if (!inspection) {
      throw new Error("Inspection record not found.");
    }

    if (inspection.status !== "VERIFIED_NON_COMPLIANT") {
      throw new Error(
        `Inspection status is '${inspection.status}', expected VERIFIED_NON_COMPLIANT. Cannot proceed with revocation decision.`
      );
    }

    if (inspection.complianceStatus !== "NON_COMPLIANT") {
      throw new Error(
        `Inspection compliance status is '${inspection.complianceStatus}', expected NON_COMPLIANT. Cannot proceed.`
      );
    }

    if (inspection.revocationDecision !== null) {
      throw new Error(
        `A revocation decision has already been recorded: ${inspection.revocationDecision}. Decision cannot be changed.`
      );
    }

    if (!inspection.application) {
      throw new Error("No linked application found for this inspection.");
    }

    if (inspection.application.status === "REVOKED") {
      throw new Error("The permit/application is already marked as REVOKED.");
    }

    if (inspection.application.status !== "REVOCATION_REVIEW") {
      throw new Error(
        `Application status is '${inspection.application.status}', expected REVOCATION_REVIEW. Revocation decision cannot be applied in this state.`
      );
    }

    const departmentHeadUser = await tx.user.findUnique({
      where: { id: departmentHeadUserId },
      select: { name: true },
    });

    const decisionDate = new Date();

    if (action === "APPROVE") {
      assertStatusTransition(inspection.application.status, "REVOKED");

      await tx.businessApplication.update({
        where: { id: inspection.application.id },
        data: { status: "REVOKED" },
      });

      await tx.businessRecord.update({
        where: { id: inspection.businessRecord.id },
        data: { businessStatus: "INACTIVE" },
      });

      await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          status: toRevocationInspectionStatus(action),
          revocationDecision: "APPROVED",
          revocationRemarks: normalizedRemarks,
          decidedById: departmentHeadUserId,
          decidedAt: new Date(),
        },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId: inspection.application.id,
          actorId: departmentHeadUserId,
          actorRole: "DEPARTMENT_HEAD",
          fromStatus: "REVOCATION_REVIEW",
          toStatus: "REVOKED",
          remarks: buildRevocationHistoryRemarksForEvent(
            "REVOCATION_APPROVED",
            buildRevocationContextFromParts({
              applicationId: inspection.application.id,
              applicationNumber: inspection.application.applicationNumber,
              applicantId: inspection.application.applicantId,
              applicantEmail: inspection.application.applicant.email,
              inspectionId: inspection.id,
              businessName: inspection.businessRecord.businessName,
              permitNumber: inspection.application.permitIssuance?.documentNumber ?? null,
              recommendationRemarks: inspection.revocationRecommendationRemarks ?? inspection.revocationRemarks,
              inspectionComment: inspection.comment,
              nonComplianceType: inspection.nonComplianceType,
              violationSeverity: inspection.violationSeverity,
              departmentHeadRemarks: null,
              decisionRemarks: normalizedRemarks,
              eventDate: decisionDate,
              departmentOfficerLabel: departmentHeadUser?.name ?? "Department Head",
              eventType: "REVOCATION_APPROVED",
            })
          ),
        },
      });
    } else {
      assertStatusTransition(inspection.application.status, "RELEASED");

      await tx.businessApplication.update({
        where: { id: inspection.application.id },
        data: { status: "RELEASED" },
      });

      await tx.businessRecord.update({
        where: { id: inspection.businessRecord.id },
        data: { businessStatus: "ACTIVE" },
      });

      await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          status: toRevocationInspectionStatus(action),
          revocationDecision: "DENIED",
          revocationRemarks: normalizedRemarks,
          decidedById: departmentHeadUserId,
          decidedAt: new Date(),
        },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId: inspection.application.id,
          actorId: departmentHeadUserId,
          actorRole: "DEPARTMENT_HEAD",
          fromStatus: "REVOCATION_REVIEW",
          toStatus: "RELEASED",
          remarks: buildRevocationHistoryRemarksForEvent(
            "REVOCATION_DENIED",
            buildRevocationContextFromParts({
              applicationId: inspection.application.id,
              applicationNumber: inspection.application.applicationNumber,
              applicantId: inspection.application.applicantId,
              applicantEmail: inspection.application.applicant.email,
              inspectionId: inspection.id,
              businessName: inspection.businessRecord.businessName,
              permitNumber: inspection.application.permitIssuance?.documentNumber ?? null,
              recommendationRemarks: inspection.revocationRecommendationRemarks ?? inspection.revocationRemarks,
              inspectionComment: inspection.comment,
              nonComplianceType: inspection.nonComplianceType,
              violationSeverity: inspection.violationSeverity,
              departmentHeadRemarks: null,
              decisionRemarks: normalizedRemarks,
              eventDate: decisionDate,
              departmentOfficerLabel: departmentHeadUser?.name ?? "Department Head",
              eventType: "REVOCATION_DENIED",
            })
          ),
        },
      });
    }

    return {
      inspectionId: inspection.id,
      applicationId: inspection.application.id,
      applicationNumber: inspection.application.applicationNumber,
      inspectionStatus: toRevocationInspectionStatus(action),
      applicationStatus: action === "APPROVE" ? mapDbStatusToUi("REVOKED") : mapDbStatusToUi("RELEASED"),
      businessStatus: action === "APPROVE" ? "INACTIVE" : "ACTIVE",
    };
  });
}

export async function requireDepartmentHeadSession() {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== "DEPARTMENT_HEAD") {
    return null;
  }

  // Re-verify against DB so disabled or role-changed accounts lose access
  // immediately — not after JWT expiry. Mirrors requireBploSession and
  // requireSuperAdminSession which were hardened in security pass 1.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, isActive: true },
  });

  if (!dbUser || dbUser.role !== "DEPARTMENT_HEAD" || !dbUser.isActive) {
    return null;
  }

  return session;
}

export async function getDepartmentHeadApprovalDocument(applicationId: string, documentId: string) {
  const application = await prisma.businessApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true },
  });

  if (!application) {
    throw new Error("Application not found");
  }

  if (application.status !== "DEPARTMENT_HEAD_REVIEW") {
    throw new Error("Application is not in Department Head review stage");
  }

  const document = await prisma.applicationDocument.findFirst({
    where: {
      id: documentId,
      applicationId,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  return document;
}
