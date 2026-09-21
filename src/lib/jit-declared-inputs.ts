import { mapDbStatusToUi } from "@/lib/application-mappers";
import type { BusinessInfo } from "@/lib/applicant-types";
import { mapDocumentValidationStatusToUi } from "@/lib/document-validation";
import { tinFromDb } from "@/lib/business-rules";
import { toMoneyNumber } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { resolveRequiredDocuments } from "@/lib/required-documents";
import {
  JIT_POST_AUDIT_CHECKLIST_ITEMS,
  type JitChecklistDepartmentKey,
} from "@/lib/jit-post-audit-checklist";

const ACTIVE_RELEASED_STATUSES = ["RELEASED"] as const;

export interface JitDeclaredDocumentRow {
  id: string;
  documentName: string;
  fileName: string;
  uploadedAt: string;
  validationStatus: string;
  validationRemarks: string | null;
}

export interface JitDeclaredClearanceRow {
  departmentKey: JitChecklistDepartmentKey;
  departmentLabel: string;
  clearanceLabel: string;
  documentId: string | null;
  documentName: string | null;
  validationStatus: string;
  validationRemarks: string | null;
}

export interface JitDeclaredInputsPayload {
  businessRecordId: string;
  applicationId: string;
  applicationNumber: string;
  applicationType: "NEW" | "RENEWAL";
  applicationStatus: string;
  permitOrCertificateNumber: string | null;
  permitValidUntil: string | null;
  submittedAt: string | null;
  businessInformation: Record<string, string | number | boolean | null>;
  operationDetails: Record<string, string | number | boolean | null>;
  documents: JitDeclaredDocumentRow[];
  clearances: JitDeclaredClearanceRow[];
  treasurerSummary: {
    assessmentNumber: string | null;
    annualAssessedAmount: number | null;
    releasePaymentAmount: number | null;
    amountPaid: number | null;
    remainingBalance: number | null;
    verifiedPaymentCount: number;
  };
}

function asBusinessInfo(value: unknown): BusinessInfo {
  if (!value || typeof value !== "object") {
    return {} as BusinessInfo;
  }
  return value as BusinessInfo;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildBusinessInformation(formData: BusinessInfo, record: {
  businessName: string;
  tradeName: string;
  ownerName: string;
  registrationNumber: string;
  tin: string | bigint | number;
  email: string;
  phone: string;
  businessAddress: string;
  mainOfficeAddress: string;
}): Record<string, string | number | boolean | null> {
  return {
    businessName: pickString(formData.businessName) ?? record.businessName,
    tradeName: pickString(formData.tradeName) ?? record.tradeName,
    businessType: pickString(formData.businessType),
    registrationNumber: pickString(formData.registrationNumber) ?? record.registrationNumber,
    tin: pickString(formData.tin) ?? tinFromDb(record.tin),
    ownerName: pickString(formData.ownerName) ?? record.ownerName,
    nationality: pickString(formData.nationality),
    email: pickString(formData.email) ?? record.email,
    phone: pickString(formData.phone) ?? record.phone,
    mainOfficeAddress: pickString(formData.mainOfficeAddress) ?? record.mainOfficeAddress,
    businessAddress: pickString(formData.businessAddress) ?? record.businessAddress,
    businessBarangay: pickString(formData.businessBarangay ?? formData.barangay),
    businessStreetAddress: pickString(formData.businessStreetAddress),
    propertyOwnership: pickString(formData.propertyOwnership),
    taxDeclarationNumber: pickString(formData.taxDeclarationNumber),
    propertyIdentificationNumber: pickString(formData.propertyIdentificationNumber),
  };
}

function buildOperationDetails(formData: BusinessInfo): Record<string, string | number | boolean | null> {
  return {
    lineOfBusiness: pickString(formData.lineOfBusiness),
    businessActivity: pickString(formData.businessActivity),
    assetSize: pickString(formData.assetSize ?? formData.capitalInvestment),
    totalEmployees: pickString(formData.totalEmployees),
    maleEmployees: pickString(formData.maleEmployees),
    femaleEmployees: pickString(formData.femaleEmployees),
    employeesWithinMunicipality: pickString(formData.employeesWithinMunicipality),
    deliveryVehicles: pickString(formData.deliveryVehicles),
    businessArea: pickString(formData.businessArea),
    totalFloorArea: pickString(formData.totalFloorArea),
    grossProfit: pickString(formData.grossProfit),
    paymentFrequency: pickString(formData.paymentFrequency),
    businessOperationType: pickString(formData.businessOperationType),
    isMarket: formData.isMarket ?? null,
    isAgriculture: formData.isAgriculture ?? null,
    taxIncentives: pickString(formData.taxIncentives),
  };
}

function normalizeDocumentName(value: string): string {
  return value.trim().toLowerCase();
}

function buildClearanceRows(
  formData: BusinessInfo,
  applicationType: "NEW" | "RENEWAL",
  documents: JitDeclaredDocumentRow[]
): JitDeclaredClearanceRow[] {
  const requiredDocs = resolveRequiredDocuments({ applicationType, formData });
  const requiredSet = new Set(requiredDocs.map(normalizeDocumentName));
  const rows: JitDeclaredClearanceRow[] = [];

  for (const template of JIT_POST_AUDIT_CHECKLIST_ITEMS) {
    if (!template.relatedClearanceLabels || template.relatedClearanceLabels.length === 0) {
      continue;
    }

    for (const clearanceLabel of template.relatedClearanceLabels) {
      if (!requiredSet.has(normalizeDocumentName(clearanceLabel))) {
        continue;
      }

      const matchedDoc = documents.find(
        (doc) => normalizeDocumentName(doc.documentName) === normalizeDocumentName(clearanceLabel)
      );

      rows.push({
        departmentKey: template.departmentKey,
        departmentLabel: template.departmentLabel,
        clearanceLabel,
        documentId: matchedDoc?.id ?? null,
        documentName: matchedDoc?.documentName ?? null,
        validationStatus: matchedDoc?.validationStatus ?? "Pending Review",
        validationRemarks: matchedDoc?.validationRemarks ?? null,
      });
    }
  }

  return rows;
}

async function getReleasedApplicationForBusiness(businessRecordId: string) {
  const record = await prisma.businessRecord.findFirst({
    where: {
      businessRecordId,
      businessStatus: "ACTIVE",
    },
    select: {
      businessRecordId: true,
      businessName: true,
      tradeName: true,
      ownerName: true,
      registrationNumber: true,
      tin: true,
      email: true,
      phone: true,
      businessAddress: true,
      mainOfficeAddress: true,
      permitExpirationDate: true,
      applications: {
        where: {
          status: { in: [...ACTIVE_RELEASED_STATUSES] },
          applicationType: { in: ["NEW", "RENEWAL"] },
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          businessApplicationId: true,
          applicationNumber: true,
          applicationType: true,
          status: true,
          submittedAt: true,
          formData: true,
          documents: {
            select: {
              applicationDocumentId: true,
              documentName: true,
              fileName: true,
              uploadedAt: true,
              validationStatus: true,
              validationRemarks: true,
            },
            orderBy: { uploadedAt: "desc" },
          },
          feeAssessment: {
            select: {
              assessmentNumber: true,
              annualAssessedAmount: true,
              releasePaymentAmount: true,
              totalAmount: true,
              paymentStatus: true,
            },
          },
          paymentReferences: {
            where: { status: "VERIFIED" },
            select: { paymentReferenceId: true },
          },
          permitIssuance: {
            select: { documentNumber: true },
          },
        },
      },
    },
  });

  if (!record) {
    throw new Error("Business record not found");
  }

  const application = record.applications[0];
  if (!application) {
    throw new Error("Only active released businesses can be inspected");
  }

  return { record, application };
}

export async function getJitDeclaredInputs(businessRecordId: string): Promise<JitDeclaredInputsPayload> {
  const { record, application } = await getReleasedApplicationForBusiness(businessRecordId);
  const formData = asBusinessInfo(application.formData);
  const applicationType = application.applicationType as "NEW" | "RENEWAL";

  const documents: JitDeclaredDocumentRow[] = application.documents.map((doc) => ({
    id: doc.applicationDocumentId,
    documentName: doc.documentName,
    fileName: doc.fileName,
    uploadedAt: doc.uploadedAt.toISOString(),
    validationStatus: mapDocumentValidationStatusToUi(doc.validationStatus),
    validationRemarks: doc.validationRemarks,
  }));

  const paidAmount =
    application.feeAssessment?.paymentStatus === "PAID"
      ? toMoneyNumber(application.feeAssessment.releasePaymentAmount ?? application.feeAssessment.totalAmount)
      : null;

  return {
    businessRecordId: record.businessRecordId,
    applicationId: application.businessApplicationId,
    applicationNumber: application.applicationNumber,
    applicationType,
    applicationStatus: mapDbStatusToUi(application.status),
    permitOrCertificateNumber: application.permitIssuance?.documentNumber ?? null,
    permitValidUntil: record.permitExpirationDate ? record.permitExpirationDate.toISOString() : null,
    submittedAt: application.submittedAt ? application.submittedAt.toISOString() : null,
    businessInformation: buildBusinessInformation(formData, record),
    operationDetails: buildOperationDetails(formData),
    documents,
    clearances: buildClearanceRows(formData, applicationType, documents),
    treasurerSummary: {
      assessmentNumber: application.feeAssessment?.assessmentNumber ?? null,
      annualAssessedAmount: application.feeAssessment
        ? toMoneyNumber(application.feeAssessment.annualAssessedAmount)
        : null,
      releasePaymentAmount: application.feeAssessment
        ? toMoneyNumber(application.feeAssessment.releasePaymentAmount)
        : null,
      amountPaid: paidAmount,
      remainingBalance: application.feeAssessment
        ? Math.max(0, toMoneyNumber(application.feeAssessment.totalAmount) - (paidAmount ?? 0))
        : null,
      verifiedPaymentCount: application.paymentReferences.length,
    },
  };
}

export async function getJitApplicationDocument(applicationId: string, documentId: string) {
  const application = await prisma.businessApplication.findFirst({
    where: {
      businessApplicationId: applicationId,
      status: { in: [...ACTIVE_RELEASED_STATUSES] },
      applicationType: { in: ["NEW", "RENEWAL"] },
      businessRecord: {
        businessStatus: "ACTIVE",
      },
    },
    select: {
      businessApplicationId: true,
      businessRecordId: true,
    },
  });

  if (!application) {
    throw new Error("Application not available for JIT review");
  }

  const document = await prisma.applicationDocument.findFirst({
    where: { applicationDocumentId: documentId, applicationId },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  return document;
}

export async function getJitInspectionChecklist(inspectionId: string) {
  const inspection = await prisma.inspection.findFirst({
    where: { inspectionId },
    select: {
      inspectionId: true,
      businessRecordId: true,
      applicationId: true,
      checklistItems: {
        orderBy: { departmentKey: "asc" },
        select: {
          inspectionChecklistItemId: true,
          departmentKey: true,
          question: true,
          response: true,
          remarks: true,
          evidenceFileName: true,
          evidenceStoragePath: true,
          evidenceMimeType: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!inspection) {
    throw new Error("Inspection not found");
  }

  return inspection;
}
