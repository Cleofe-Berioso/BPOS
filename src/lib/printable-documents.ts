import { prisma } from "@/lib/prisma";
import { toMoneyNumber } from "@/lib/money";

export type PrintableDocumentType = "BUSINESS_PERMIT" | "BUSINESS_CLOSURE_CERTIFICATE";

export type ApplicationTypeForPrint = "NEW" | "RENEWAL" | "CLOSURE";

export type ApplicationStatusForPrint =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ASSESSED"
  | "APPROVED_FOR_PAYMENT"
  | "PAID"
  | "FOR_RELEASE"
  | "RELEASED"
  | "RETURNED_FOR_CORRECTION"
  | "REJECTED";

export type PermitIssuanceStatusForPrint = "PREPARED" | "FOR_RELEASE" | "RELEASED";

export interface PrintablePermitIssuanceSnapshot {
  id?: string | null;
  documentNumber?: string | null;
  documentPath?: string | null;
  status?: PermitIssuanceStatusForPrint | null;
}

export interface PrintablePaymentSnapshot {
  // At least one verified payment reference exists.
  hasVerifiedPaymentReference: boolean;
}

export interface PrintableDocumentApplication {
  id: string;
  applicantId: string;
  applicationType: ApplicationTypeForPrint;
  status: ApplicationStatusForPrint;
  permitIssuance?: PrintablePermitIssuanceSnapshot | null;
  payment?: PrintablePaymentSnapshot | null;
}

export interface BploPrintableEligibility {
  canPrint: boolean;
  reasons: string[];
  documentType: PrintableDocumentType;
}

export interface ApplicantPrintableEligibility {
  canPrint: boolean;
  reasons: string[];
  documentType: PrintableDocumentType;
}

export interface BusinessPermitPrintData {
  heading: {
    republic: string;
    province: string;
    municipality: string;
    office: string;
    title: string;
  };
  permitNumber: string;
  applicationNumber: string;
  classification: "NEW" | "RENEWAL";
  taxYear: string;
  dateIssued: string | null;
  validUntil: string | null;
  plateNumber: string;
  businessName: string;
  tradeName: string;
  ownerOrPresident: string;
  businessType: string;
  registrationNumber: string;
  tin: string;
  businessAddress: string;
  lineOfBusiness: string;
  natureOfBusiness: string;
  businessActivity: string;
  topNumber: string;
  orNumber: string;
  datePaid: string | null;
  amountPaid: number;
  signatories: {
    bploOfficer: string;
    municipalTreasurer: string;
    mayor: string;
  };
  municipalityNameForBody: string;
  municipalMayorName: string;
  legalNote: string;
}

export type BusinessPermitPrintAccessResult =
  | { ok: true; permit: BusinessPermitPrintData }
  | { ok: false; status: 403 | 404; error: string };

export interface ClosureCertificatePrintData {
  heading: {
    republic: string;
    province: string;
    municipality: string;
    office: string;
    title: string;
  };
  certificateNumber: string;
  applicationNumber: string;
  dateIssued: string | null;
  effectiveClosureDate: string | null;
  businessName: string;
  tradeName: string;
  ownerOrPresident: string;
  businessType: string;
  registrationNumber: string;
  tin: string;
  businessAddress: string;
  reasonForClosure: string;
  topNumber: string;
  orNumber: string;
  datePaid: string | null;
  closureCertificateFee: number;
  paymentDuesPendingFee: number;
  totalPaid: number;
  certificationStatement: string;
  signatories: {
    departmentHeadOfBplo: string;
    bploOfficer: string;
    municipalTreasurerOrAuthorizedOfficer: string;
  };
  verificationPlaceholder: string;
}

export type ClosureCertificatePrintAccessResult =
  | { ok: true; certificate: ClosureCertificatePrintData }
  | { ok: false; status: 403 | 404; error: string };

function hasIssuanceRecord(application: PrintableDocumentApplication): boolean {
  return Boolean(application.permitIssuance?.id);
}


function readText(formData: unknown, key: string, fallback = "-"): string {
  const record = (formData ?? {}) as Record<string, unknown>;
  const value = record[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function toIsoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toYear(value: Date | null | undefined): string {
  const year = value ? value.getFullYear() : new Date().getFullYear();
  return String(year);
}

function toPermitExpiry(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Date(Date.UTC(value.getUTCFullYear(), 11, 31, 23, 59, 59, 999)).toISOString();
}

function toPrintableSnapshot(app: {
  id: string;
  applicantId: string;
  applicationType: ApplicationTypeForPrint;
  status: ApplicationStatusForPrint;
  permitIssuance: {
    id: string;
    documentNumber: string;
    documentPath: string | null;
    status: PermitIssuanceStatusForPrint;
  } | null;
  paymentReferences: Array<{ id: string }>;
}): PrintableDocumentApplication {
  return {
    id: app.id,
    applicantId: app.applicantId,
    applicationType: app.applicationType,
    status: app.status,
    permitIssuance: app.permitIssuance
      ? {
          id: app.permitIssuance.id,
          documentNumber: app.permitIssuance.documentNumber,
          documentPath: app.permitIssuance.documentPath,
          status: app.permitIssuance.status,
        }
      : null,
    payment: {
      hasVerifiedPaymentReference: app.paymentReferences.length > 0,
    },
  };
}

function toBusinessPermitPrintData(app: {
  applicationNumber: string;
  applicationType: ApplicationTypeForPrint;
  formData: unknown;
  applicant: {
    name: string;
  };
  permitIssuance: {
    documentNumber: string;
    issuedAt: Date;
  } | null;
  feeAssessment: {
    assessmentNumber: string;
    annualAssessedAmount: any;
    amountPaid: any;
  } | null;
  paymentReferences: Array<{
    transactionNumber: string;
    paymentDate: Date;
  }>;
}): BusinessPermitPrintData {
  const issuedAt = app.permitIssuance?.issuedAt ?? null;
  const formData = app.formData;
  const businessActivity = readText(formData, "businessActivity", readText(formData, "lineOfBusiness"));
  const municipalityName = "ENRIQUE B. MAGALONA";
  const ownerName = readText(formData, "ownerName", "");
  const applicantName = app.applicant?.name?.trim() ?? "";
  const ownerOrApplicantName = ownerName || applicantName || "-";
  const mayorName = "Hon. Matthew Louis P. Malacon";

  return {
    heading: {
      republic: "Republic of the Philippines",
      province: "Negros Occidental",
      municipality: municipalityName,
      office: "OFFICE OF THE MUNICIPAL MAYOR",
      title: "MAYOR'S BUSINESS PERMIT",
    },
    permitNumber: app.permitIssuance?.documentNumber ?? "-",
    applicationNumber: app.applicationNumber,
    classification: app.applicationType === "RENEWAL" ? "RENEWAL" : "NEW",
    taxYear: toYear(issuedAt),
    dateIssued: toIsoOrNull(issuedAt),
    validUntil: toPermitExpiry(issuedAt),
    plateNumber: readText(formData, "plateNumber", "—"),
    businessName: readText(formData, "businessName"),
    tradeName: readText(formData, "tradeName"),
    ownerOrPresident: ownerOrApplicantName,
    businessType: readText(formData, "businessType"),
    registrationNumber: readText(formData, "registrationNumber"),
    tin: readText(formData, "tin"),
    businessAddress: readText(formData, "businessAddress"),
    lineOfBusiness: readText(formData, "lineOfBusiness", readText(formData, "businessActivity")),
    natureOfBusiness: readText(formData, "lineOfBusiness", readText(formData, "businessActivity")),
    businessActivity,
    topNumber: app.feeAssessment?.assessmentNumber ?? "-",
    orNumber: app.paymentReferences[0]?.transactionNumber ?? "-",
    datePaid: toIsoOrNull(app.paymentReferences[0]?.paymentDate),
    amountPaid: toMoneyNumber(app.feeAssessment?.amountPaid),
    signatories: {
      bploOfficer: "BPLO Officer",
      municipalTreasurer: "Municipal Treasurer",
      mayor: "Mayor",
    },
    municipalityNameForBody: municipalityName,
    municipalMayorName: mayorName,
    legalNote: "This permit must be displayed conspicuously at the place of business.",
  };
}

function toClosureReason(formData: unknown): string {
  const reasonKeys = ["closureReason", "reasonForClosure", "closureRemarks", "remarks"];
  for (const key of reasonKeys) {
    const value = readText(formData, key, "");
    if (value) return value;
  }
  return "-";
}

function toClosureCertificatePrintData(app: {
  applicationNumber: string;
  formData: unknown;
  applicant: {
    name: string;
  };
  permitIssuance: {
    documentNumber: string;
    issuedAt: Date;
  } | null;
  businessRecord: {
    closedAt: Date | null;
  } | null;
  feeAssessment: {
    assessmentNumber: string;
    releasePaymentAmount: any;
    remainingBalance: any;
    amountPaid: any;
  } | null;
  paymentReferences: Array<{
    transactionNumber: string;
    paymentDate: Date;
  }>;
}): ClosureCertificatePrintData {
  const formData = app.formData;
  const ownerName = readText(formData, "ownerName", "");
  const applicantName = app.applicant?.name?.trim() ?? "";
  const ownerOrApplicantName = ownerName || applicantName || "-";

  return {
    heading: {
      republic: "Republic of the Philippines",
      province: "Negros Occidental",
      municipality: "ENRIQUE B. MAGALONA",
      office: "Business Permits and Licensing Office",
      title: "BUSINESS CLOSURE CERTIFICATE",
    },
    certificateNumber: app.permitIssuance?.documentNumber ?? "-",
    applicationNumber: app.applicationNumber,
    dateIssued: toIsoOrNull(app.permitIssuance?.issuedAt),
    effectiveClosureDate: toIsoOrNull(app.businessRecord?.closedAt),
    businessName: readText(formData, "businessName"),
    tradeName: readText(formData, "tradeName"),
    ownerOrPresident: ownerOrApplicantName,
    businessType: readText(formData, "businessType"),
    registrationNumber: readText(formData, "registrationNumber"),
    tin: readText(formData, "tin"),
    businessAddress: readText(formData, "businessAddress"),
    reasonForClosure: toClosureReason(formData),
    topNumber: app.feeAssessment?.assessmentNumber ?? "-",
    orNumber: app.paymentReferences[0]?.transactionNumber ?? "-",
    datePaid: toIsoOrNull(app.paymentReferences[0]?.paymentDate),
    closureCertificateFee: toMoneyNumber(app.feeAssessment?.releasePaymentAmount),
    paymentDuesPendingFee: toMoneyNumber(app.feeAssessment?.remainingBalance),
    totalPaid: toMoneyNumber(app.feeAssessment?.amountPaid),
    certificationStatement:
      "This certifies that the business has completed the required closure processing and has been officially recorded as closed/ceased operation.",
    signatories: {
      departmentHeadOfBplo: "",
      bploOfficer: "BPLO Officer",
      municipalTreasurerOrAuthorizedOfficer: "Municipal Treasurer / Authorized Officer",
    },
    verificationPlaceholder: "Verification QR placeholder",
  };
}

async function findApplicationForPrint(
  applicationId: string,
  applicantId?: string
): Promise<{
  id: string;
  applicantId: string;
  applicationNumber: string;
  applicationType: ApplicationTypeForPrint;
  status: ApplicationStatusForPrint;
  formData: unknown;
   applicant: {
     name: string;
   };
   feeAssessment: {
    assessmentNumber: string;
    annualAssessedAmount: any;
    releasePaymentAmount: any;
    remainingBalance: any;
    amountPaid: any;
  } | null;
  businessRecord: { closedAt: Date | null } | null;
  permitIssuance: {
    id: string;
    documentNumber: string;
    documentPath: string | null;
    status: PermitIssuanceStatusForPrint;
    issuedAt: Date;
  } | null;
  paymentReferences: Array<{
    id: string;
    transactionNumber: string;
    paymentDate: Date;
  }>;
} | null> {
  const row = await prisma.businessApplication.findFirst({
    where: {
      businessApplicationId: applicationId,
      ...(applicantId ? { applicantId } : {}),
    },
    select: {
      businessApplicationId: true,
      applicantId: true,
      applicationNumber: true,
      applicationType: true,
      status: true,
      formData: true,
      applicant: {
        select: {
          name: true,
        },
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
      businessRecord: {
        select: {
          closedAt: true,
        },
      },
      permitIssuance: {
        select: {
          permitIssuanceId: true,
          documentNumber: true,
          documentPath: true,
          status: true,
          issuedAt: true,
        },
      },
      paymentReferences: {
        where: { status: "VERIFIED" },
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: {
          paymentReferenceId: true,
          transactionNumber: true,
          paymentDate: true,
        },
      },
    },
  });

  if (!row) return null;

  const paidAmount =
    row.feeAssessment?.paymentStatus === "PAID"
      ? toMoneyNumber(row.feeAssessment.releasePaymentAmount ?? row.feeAssessment.totalAmount)
      : 0;

  return {
    id: row.businessApplicationId,
    applicantId: row.applicantId,
    applicationNumber: row.applicationNumber,
    applicationType: row.applicationType as ApplicationTypeForPrint,
    status: row.status as ApplicationStatusForPrint,
    formData: row.formData,
    applicant: row.applicant,
    feeAssessment: row.feeAssessment
      ? {
          assessmentNumber: row.feeAssessment.assessmentNumber,
          annualAssessedAmount: row.feeAssessment.annualAssessedAmount,
          releasePaymentAmount: row.feeAssessment.releasePaymentAmount,
          remainingBalance: Math.max(0, toMoneyNumber(row.feeAssessment.totalAmount) - paidAmount),
          amountPaid: paidAmount,
        }
      : null,
    businessRecord: row.businessRecord,
    permitIssuance: row.permitIssuance
      ? {
          id: row.permitIssuance.permitIssuanceId,
          documentNumber: row.permitIssuance.documentNumber,
          documentPath: row.permitIssuance.documentPath,
          status: row.permitIssuance.status as PermitIssuanceStatusForPrint,
          issuedAt: row.permitIssuance.issuedAt,
        }
      : null,
    paymentReferences: row.paymentReferences.map((ref) => ({
      id: ref.paymentReferenceId,
      transactionNumber: ref.transactionNumber,
      paymentDate: ref.paymentDate,
    })),
  };
}

export function getPrintableDocumentType(
  applicationType: ApplicationTypeForPrint
): PrintableDocumentType {
  if (applicationType === "CLOSURE") {
    return "BUSINESS_CLOSURE_CERTIFICATE";
  }

  return "BUSINESS_PERMIT";
}

export function canBploPrintDocument(
  application: PrintableDocumentApplication
): BploPrintableEligibility {
  const reasons: string[] = [];
  const documentType = getPrintableDocumentType(application.applicationType);

  if (application.status !== "RELEASED") {
    reasons.push("Application must be RELEASED before document printing.");
  }

  if (!application.payment?.hasVerifiedPaymentReference) {
    reasons.push("Verified payment is required before document printing.");
  }

  if (!hasIssuanceRecord(application)) {
    reasons.push("Released permit issuance record is required before document printing.");
  }

  if (application.permitIssuance?.status !== "RELEASED") {
    reasons.push("Permit issuance must be RELEASED before document printing.");
  }

  return {
    canPrint: reasons.length === 0,
    reasons,
    documentType,
  };
}

export function canApplicantPrintDocument(
  application: PrintableDocumentApplication,
  currentApplicantId: string
): ApplicantPrintableEligibility {
  const reasons: string[] = [];
  const documentType = getPrintableDocumentType(application.applicationType);

  if (application.applicantId !== currentApplicantId) {
    reasons.push("Document does not belong to the current applicant.");
  }

  if (application.status !== "RELEASED") {
    reasons.push("Application must be RELEASED for applicant printing.");
  }

  if (!hasIssuanceRecord(application)) {
    reasons.push("Permit issuance record is required for applicant printing.");
  }

  if (application.permitIssuance?.status !== "RELEASED") {
    reasons.push("Permit issuance must be RELEASED for applicant printing.");
  }

  if (!application.payment?.hasVerifiedPaymentReference) {
    reasons.push("Verified payment is required before applicant printing.");
  }

  return {
    canPrint: reasons.length === 0,
    reasons,
    documentType,
  };
}

export async function getBploBusinessPermitPrintAccess(
  applicationId: string
): Promise<BusinessPermitPrintAccessResult> {
  const app = await findApplicationForPrint(applicationId);
  if (!app) {
    return { ok: false, status: 404, error: "Application not found" };
  }

  const snapshot = toPrintableSnapshot(app);
  const eligibility = canBploPrintDocument(snapshot);

  if (eligibility.documentType !== "BUSINESS_PERMIT") {
    return {
      ok: false,
      status: 403,
      error: "Closure applications cannot print a Business Permit.",
    };
  }

  if (!eligibility.canPrint) {
    return {
      ok: false,
      status: 403,
      error: eligibility.reasons.join(" "),
    };
  }

  return {
    ok: true,
    permit: toBusinessPermitPrintData(app),
  };
}

export async function getApplicantBusinessPermitPrintAccess(
  applicationId: string,
  applicantId: string
): Promise<BusinessPermitPrintAccessResult> {
  const app = await findApplicationForPrint(applicationId, applicantId);
  if (!app) {
    return { ok: false, status: 404, error: "Permit not found" };
  }

  const snapshot = toPrintableSnapshot(app);
  const eligibility = canApplicantPrintDocument(snapshot, applicantId);

  if (eligibility.documentType !== "BUSINESS_PERMIT") {
    return {
      ok: false,
      status: 403,
      error: "Closure applications cannot print a Business Permit.",
    };
  }

  if (!eligibility.canPrint) {
    return {
      ok: false,
      status: 403,
      error: eligibility.reasons.join(" "),
    };
  }

  return {
    ok: true,
    permit: toBusinessPermitPrintData(app),
  };
}

export async function getBploClosureCertificatePrintAccess(
  applicationId: string
): Promise<ClosureCertificatePrintAccessResult> {
  const app = await findApplicationForPrint(applicationId);
  if (!app) {
    return { ok: false, status: 404, error: "Application not found" };
  }

  const snapshot = toPrintableSnapshot(app);
  const eligibility = canBploPrintDocument(snapshot);

  if (eligibility.documentType !== "BUSINESS_CLOSURE_CERTIFICATE") {
    return {
      ok: false,
      status: 403,
      error: "New and renewal applications cannot print a Business Closure Certificate.",
    };
  }

  if (!eligibility.canPrint) {
    return {
      ok: false,
      status: 403,
      error: eligibility.reasons.join(" "),
    };
  }

  return {
    ok: true,
    certificate: toClosureCertificatePrintData(app),
  };
}

export async function getApplicantClosureCertificatePrintAccess(
  applicationId: string,
  applicantId: string
): Promise<ClosureCertificatePrintAccessResult> {
  const app = await findApplicationForPrint(applicationId, applicantId);
  if (!app) {
    return { ok: false, status: 404, error: "Closure certificate not found" };
  }

  const snapshot = toPrintableSnapshot(app);
  const eligibility = canApplicantPrintDocument(snapshot, applicantId);

  if (eligibility.documentType !== "BUSINESS_CLOSURE_CERTIFICATE") {
    return {
      ok: false,
      status: 403,
      error: "New and renewal applications cannot print a Business Closure Certificate.",
    };
  }

  if (!eligibility.canPrint) {
    return {
      ok: false,
      status: 403,
      error: eligibility.reasons.join(" "),
    };
  }

  return {
    ok: true,
    certificate: toClosureCertificatePrintData(app),
  };
}
