import { prisma } from "@/lib/prisma";
import { mapDbStatusToUi } from "@/lib/application-mappers";
import { assertStatusTransition } from "@/lib/application-status";
import { toMoneyNumber } from "@/lib/money";
import { sendReleaseStatusSms } from "@/lib/sms";
import { upsertBusinessLocationForBusinessRecord } from "@/lib/business-location";
import { finalizeComplianceRelatedClosure } from "@/lib/compliance-closure";
import { buildPaginatedResult, resolvePagination, type PaginatedResult } from "@/lib/pagination";
import {
  normalizeTin,
  parseDeliveryVehicleCountForDb,
  parseOptionalDecimalForDb,
  parseOptionalIntForDb,
  tinToBigInt,
} from "@/lib/business-rules";

type DbApplicationStatus =
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

type ApplicationType = "NEW" | "RENEWAL" | "CLOSURE";

export type IssuanceDocumentType = "BUSINESS_PERMIT" | "CLOSURE_CERTIFICATE";

export interface PermitIssuanceRow {
  applicationId: string;
  applicationNumber: string;
  businessName: string;
  applicantName: string;
  applicantEmail: string;
  applicationType: ApplicationType;
  topNumber: string | null;
  paymentStatus: "PENDING" | "VERIFIED" | "REJECTED" | null;
  datePaid: string | null;
  requiredReleasePayment: number;
  amountPaid: number;
  remainingBalance: number;
  blockingReason: string | null;
  documentNumber: string | null;
  preparedDate: string | null;
  releasedDate: string | null;
  releasedBy: string | null;
  currentStatus: string;
}

export interface PermitIssuanceLists {
  blocked: PermitIssuanceRow[];
  paid: PermitIssuanceRow[];
  forRelease: PermitIssuanceRow[];
  released: PermitIssuanceRow[];
}

function getBlockingReason(params: {
  rawStatus: DbApplicationStatus;
  latestPaymentStatus: "PENDING" | "VERIFIED" | "REJECTED" | null;
  amountPaid: number;
  requiredReleasePayment: number;
}): string | null {
  const { rawStatus, latestPaymentStatus, amountPaid, requiredReleasePayment } = params;

  if (rawStatus !== "APPROVED_FOR_PAYMENT") return null;
  if (!latestPaymentStatus) return "Awaiting applicant payment submission";
  if (latestPaymentStatus === "PENDING") return "Awaiting BPLO payment verification";
  if (latestPaymentStatus === "REJECTED") return "Payment reference rejected; applicant must resubmit";
  if (requiredReleasePayment > 0 && amountPaid < requiredReleasePayment) {
    return "Required release payment has not been completed";
  }

  return "Awaiting permit eligibility";
}

export interface PermitIssuanceDetail {
  application: {
    id: string;
    applicationNumber: string;
    applicationType: ApplicationType;
    status: string;
    rawStatus: DbApplicationStatus;
    applicantName: string;
    applicantEmail: string;
    businessName: string;
  };
  businessInfo: {
    businessType: string;
    registrationNumber: string;
    tin: string;
    businessName: string;
    tradeName: string;
    ownerName: string;
    businessAddress: string;
  };
  paymentSummary: {
    topNumber: string | null;
    totalAmountPaid: number;
    paymentReferenceNumber: string | null;
    paymentVerificationStatus: "PENDING" | "VERIFIED" | "REJECTED" | null;
  };
  preview: {
    title: string;
    subtitle: string;
  };
  issuance: {
    id: string | null;
    documentType: IssuanceDocumentType | null;
    documentNumber: string | null;
    issueDate: string | null;
    validityPeriod: string | null;
    preparedBy: string | null;
    releasedDate: string | null;
    releasedBy: string | null;
    status: "PREPARED" | "FOR_RELEASE" | "RELEASED" | null;
    remarks: string | null;
  };
}

function resolveBusinessName(formData: unknown, fallback: string | null): string {
  const maybe = (formData ?? {}) as Record<string, unknown>;
  const fromForm =
    typeof maybe.businessName === "string" && maybe.businessName.trim()
      ? maybe.businessName.trim()
      : null;
  return fromForm ?? fallback ?? "-";
}

function resolveFormValue(formData: unknown, key: string): string {
  const maybe = (formData ?? {}) as Record<string, unknown>;
  const value = maybe[key];
  return typeof value === "string" && value.trim() ? value.trim() : "-";
}

function resolveApplicantPhone(formData: unknown): string | null {
  const maybe = (formData ?? {}) as Record<string, unknown>;
  const rawPhone = maybe.phone;
  if (typeof rawPhone !== "string") return null;
  const trimmed = rawPhone.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dateIsoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function resolveDocumentType(applicationType: ApplicationType): IssuanceDocumentType {
  return applicationType === "CLOSURE" ? "CLOSURE_CERTIFICATE" : "BUSINESS_PERMIT";
}

function resolvePermitExpirationDateForRelease(
  applicationType: ApplicationType,
  issuedAt?: Date | null
): Date | null {
  if (applicationType === "CLOSURE") {
    return null;
  }

  const issuanceDate = issuedAt ?? new Date();
  return new Date(Date.UTC(issuanceDate.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
}

const PERMIT_NUMBER_YEAR_SEQ_REGEX = /^(\d{4})-(\d{6})$/;

async function generateDocumentNumber(
  dbClient: any,
  documentType: IssuanceDocumentType
): Promise<string> {
  const year = new Date().getFullYear();

  if (documentType === "BUSINESS_PERMIT") {
    // Format: YYYY-NNNNNN (e.g. 2026-000001)
    // Find the highest existing sequence for this year's permits matching the pattern.
    const existing = await dbClient.permitIssuance.findMany({
      where: {
        documentType: "BUSINESS_PERMIT",
        documentNumber: { startsWith: `${year}-` },
      },
      select: { documentNumber: true },
    });

    let maxSeq = 0;
    for (const row of existing) {
      const match = PERMIT_NUMBER_YEAR_SEQ_REGEX.exec(row.documentNumber ?? "");
      if (match && parseInt(match[1], 10) === year) {
        const seq = parseInt(match[2], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    }

    // Retry loop: increment until a unique candidate is found.
    let nextSeq = maxSeq + 1;
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `${year}-${String(nextSeq).padStart(6, "0")}`;
      const dup = await dbClient.permitIssuance.findFirst({
        where: { documentNumber: candidate },
        select: { permitIssuanceId: true },
      });
      if (!dup) return candidate;
      nextSeq++;
    }
    throw new Error("Unable to generate unique permit number");
  }

  // CLOSURE_CERTIFICATE: keep existing CC-YYYY-NNNNN format
  const count = await dbClient.permitIssuance.count({
    where: {
      documentType: "CLOSURE_CERTIFICATE",
      createdAt: {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
      },
    },
  });
  const seq = String(count + 1).padStart(5, "0");
  return `CC-${year}-${seq}`;
}

function findPaidDate(history: Array<{ toStatus: DbApplicationStatus; createdAt: Date }>): string | null {
  const paid = history
    .slice()
    .reverse()
    .find((item) => item.toStatus === "PAID");
  return paid ? paid.createdAt.toISOString() : null;
}

function toListRow(app: any): PermitIssuanceRow {
  const latestRef = app.paymentReferences?.[0] ?? null;
  const requiredReleasePayment = toMoneyNumber(app.feeAssessment?.releasePaymentAmount);
  const amountPaid =
    app.feeAssessment?.paymentStatus === "PAID"
      ? toMoneyNumber(app.feeAssessment?.releasePaymentAmount ?? app.feeAssessment?.totalAmount)
      : 0;
  const totalAmount = toMoneyNumber(app.feeAssessment?.totalAmount);
  const remainingBalance = Math.max(0, totalAmount - amountPaid);

  return {
    applicationId: app.businessApplicationId,
    applicationNumber: app.applicationNumber,
    businessName: resolveBusinessName(app.formData, app.businessRecord?.businessName ?? null),
    applicantName: app.applicant.name,
    applicantEmail: app.applicant.email,
    applicationType: app.applicationType,
    topNumber: app.feeAssessment?.assessmentNumber ?? null,
    paymentStatus: latestRef?.status ?? null,
    datePaid: findPaidDate(app.history),
    requiredReleasePayment,
    amountPaid,
    remainingBalance,
    blockingReason: getBlockingReason({
      rawStatus: app.status,
      latestPaymentStatus: latestRef?.status ?? null,
      amountPaid,
      requiredReleasePayment,
    }),
    documentNumber: app.permitIssuance?.documentNumber ?? null,
    preparedDate: dateIsoOrNull(app.permitIssuance?.issuedAt),
    releasedDate: dateIsoOrNull(app.permitIssuance?.releasedAt),
    releasedBy: app.permitIssuance?.releasedBy?.name ?? null,
    currentStatus: mapDbStatusToUi(app.status),
  };
}

export type PermitIssuanceBucket = "blocked" | "paid" | "forRelease" | "released";

const PERMIT_ISSUANCE_BUCKET_STATUS: Record<PermitIssuanceBucket, DbApplicationStatus> = {
  blocked: "APPROVED_FOR_PAYMENT",
  paid: "PAID",
  forRelease: "FOR_RELEASE",
  released: "RELEASED",
};

const permitIssuanceInclude = {
  applicant: { select: { name: true, email: true } },
  businessRecord: { select: { businessName: true } },
  feeAssessment: {
    select: {
      assessmentNumber: true,
      releasePaymentAmount: true,
      totalAmount: true,
      paymentStatus: true,
    },
  },
  paymentReferences: {
    orderBy: { submittedAt: "desc" as const },
    take: 1,
    select: {
      transactionNumber: true,
      status: true,
    },
  },
  history: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
  permitIssuance: {
    include: {
      releasedBy: { select: { name: true } },
    },
  },
} as const;

export async function listPermitIssuanceEntries(): Promise<PermitIssuanceLists> {
  const rows = await prisma.businessApplication.findMany({
    where: {
      status: {
        in: ["APPROVED_FOR_PAYMENT", "PAID", "FOR_RELEASE", "RELEASED"],
      },
    },
    include: {
      applicant: { select: { name: true, email: true } },
      businessRecord: { select: { businessName: true } },
      feeAssessment: {
        select: {
          assessmentNumber: true,
          releasePaymentAmount: true,
          totalAmount: true,
          paymentStatus: true,
        },
      },
      paymentReferences: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: {
          transactionNumber: true,
          status: true,
        },
      },
      history: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      permitIssuance: {
        include: {
          releasedBy: { select: { name: true } },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return {
    blocked: rows
      .filter((row) => row.status === "APPROVED_FOR_PAYMENT")
      .map(toListRow),
    paid: rows
      .filter((row) => row.status === "PAID")
      .map(toListRow),
    forRelease: rows
      .filter((row) => row.status === "FOR_RELEASE")
      .map(toListRow),
    released: rows
      .filter((row) => row.status === "RELEASED")
      .map(toListRow),
  };
}

export async function listPermitIssuanceBucketPaginated(
  bucket: PermitIssuanceBucket,
  pagination?: { page?: number | string; pageSize?: number | string }
): Promise<PaginatedResult<PermitIssuanceRow>> {
  const { page, pageSize, skip, take } = resolvePagination(pagination);
  const where = { status: PERMIT_ISSUANCE_BUCKET_STATUS[bucket] };

  const [rows, totalCount] = await Promise.all([
    prisma.businessApplication.findMany({
      where,
      include: permitIssuanceInclude,
      orderBy: [{ updatedAt: "desc" }],
      skip,
      take,
    }),
    prisma.businessApplication.count({ where }),
  ]);

  return buildPaginatedResult(rows.map(toListRow), totalCount, page, pageSize);
}

export async function getPermitIssuanceDetail(applicationId: string): Promise<PermitIssuanceDetail | null> {
  const app = await prisma.businessApplication.findUnique({
    where: { businessApplicationId: applicationId },
    include: {
      applicant: { select: { name: true, email: true } },
      businessRecord: { select: { businessName: true } },
      feeAssessment: {
        select: {
          assessmentNumber: true,
          totalAmount: true,
          releasePaymentAmount: true,
          paymentStatus: true,
        },
      },
      paymentReferences: {
        where: { status: "VERIFIED" },
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: {
          transactionNumber: true,
          status: true,
        },
      },
      permitIssuance: {
        include: {
          preparedBy: { select: { name: true } },
          releasedBy: { select: { name: true } },
        },
      },
    },
  });

  if (!app) return null;

  const PERMIT_ISSUANCE_VISIBLE: DbApplicationStatus[] = [
    "APPROVED_FOR_PAYMENT",
    "PAID",
    "FOR_RELEASE",
    "RELEASED",
  ];

  if (!PERMIT_ISSUANCE_VISIBLE.includes(app.status as DbApplicationStatus)) {
    return null;
  }

  const latestRef = app.paymentReferences?.[0] ?? null;
  const docType = resolveDocumentType(app.applicationType as ApplicationType);

  return {
    application: {
      id: app.businessApplicationId,
      applicationNumber: app.applicationNumber,
      applicationType: app.applicationType as ApplicationType,
      status: mapDbStatusToUi(app.status),
      rawStatus: app.status as DbApplicationStatus,
      applicantName: app.applicant.name,
      applicantEmail: app.applicant.email,
      businessName: resolveBusinessName(app.formData, app.businessRecord?.businessName ?? null),
    },
    businessInfo: {
      businessType: resolveFormValue(app.formData, "businessType"),
      registrationNumber: resolveFormValue(app.formData, "registrationNumber"),
      tin: resolveFormValue(app.formData, "tin"),
      businessName: resolveFormValue(app.formData, "businessName"),
      tradeName: resolveFormValue(app.formData, "tradeName"),
      ownerName: resolveFormValue(app.formData, "ownerName"),
      businessAddress: resolveFormValue(app.formData, "businessAddress"),
    },
    paymentSummary: {
      topNumber: app.feeAssessment?.assessmentNumber ?? null,
      totalAmountPaid:
        app.feeAssessment?.paymentStatus === "PAID"
          ? toMoneyNumber(app.feeAssessment?.releasePaymentAmount ?? app.feeAssessment?.totalAmount)
          : 0,
      paymentReferenceNumber: latestRef?.transactionNumber ?? null,
      paymentVerificationStatus: latestRef?.status ?? null,
    },
    preview: {
      title: docType === "CLOSURE_CERTIFICATE" ? "Closure Certificate Preview" : "Business Permit Preview",
      subtitle:
        docType === "CLOSURE_CERTIFICATE"
          ? "Current closure certificate output view"
          : "Current business permit output view",
    },
    issuance: {
      id: app.permitIssuance?.permitIssuanceId ?? null,
      documentType: (app.permitIssuance?.documentType as IssuanceDocumentType | undefined) ?? null,
      documentNumber: app.permitIssuance?.documentNumber ?? null,
      issueDate: dateIsoOrNull(app.permitIssuance?.issuedAt),
      validityPeriod:
        app.applicationType === "CLOSURE"
          ? null
          : app.permitIssuance?.issuedAt
            ? `Valid until December 31, ${new Date(app.permitIssuance.issuedAt).getFullYear()}`
            : null,
      preparedBy: app.permitIssuance?.preparedBy?.name ?? null,
      releasedDate: dateIsoOrNull(app.permitIssuance?.releasedAt),
      releasedBy: app.permitIssuance?.releasedBy?.name ?? null,
      status: app.permitIssuance?.status ?? null,
      remarks: app.permitIssuance?.remarks ?? null,
    },
  };
}

async function upsertBusinessRecordOnRelease(tx: any, app: any): Promise<string | null> {
  if (app.applicationType === "CLOSURE") {
    // Closure business status finalization happens at RELEASED stage.
    // Compliance-related closures are finalized in finalizeComplianceRelatedClosure.
    // Non-compliance closure types still use the standard CLOSED status update.
    return app.businessRecordId ?? null;
  }

  const form = (app.formData ?? {}) as Record<string, unknown>;
  const registrationNumber =
    typeof form.registrationNumber === "string" ? form.registrationNumber.trim() : "";
  const rawTin = typeof form.tin === "string" ? form.tin : "";
  const normalizedTinDigits = normalizeTin(rawTin);
  if (!normalizedTinDigits) {
    throw new Error("TIN is required to release a business permit.");
  }

  const payload = {
    applicantId: app.applicantId,
    businessType: typeof form.businessType === "string" ? form.businessType : "Sole Proprietorship",
    registrationNumber: registrationNumber || `REG-${app.applicationNumber}`,
    tin: tinToBigInt(rawTin),
    businessName: typeof form.businessName === "string" ? form.businessName : "-",
    tradeName: typeof form.tradeName === "string" ? form.tradeName : "-",
    ownerName: typeof form.ownerName === "string" ? form.ownerName : "-",
    nationality: typeof form.nationality === "string" ? form.nationality : "Filipino",
    email: typeof form.email === "string" ? form.email : app.applicant.email,
    phone: typeof form.phone === "string" ? form.phone : "-",
    mainOfficeAddress:
      typeof form.mainOfficeAddress === "string" ? form.mainOfficeAddress : "-",
    businessAddress: typeof form.businessAddress === "string" ? form.businessAddress : "-",
    sameAsMainOffice:
      typeof form.sameAsMainOffice === "boolean" ? form.sameAsMainOffice : true,
    businessArea: parseOptionalDecimalForDb(
      typeof form.businessArea === "string" ? form.businessArea : null
    ),
    totalFloorArea: parseOptionalDecimalForDb(
      typeof form.totalFloorArea === "string" ? form.totalFloorArea : null
    ),
    totalEmployees: parseOptionalIntForDb(
      typeof form.totalEmployees === "string" ? form.totalEmployees : null
    ),
    maleEmployees: parseOptionalIntForDb(
      typeof form.maleEmployees === "string" ? form.maleEmployees : null
    ),
    femaleEmployees: parseOptionalIntForDb(
      typeof form.femaleEmployees === "string" ? form.femaleEmployees : null
    ),
    employeesWithinMunicipality: parseOptionalIntForDb(
      typeof form.employeesWithinMunicipality === "string"
        ? form.employeesWithinMunicipality
        : null
    ),
    deliveryVehicles: parseDeliveryVehicleCountForDb(
      typeof form.deliveryVehicles === "string" ? form.deliveryVehicles : null
    ),
    propertyOwnership:
      typeof form.propertyOwnership === "string" ? form.propertyOwnership : null,
    taxDeclarationNumber:
      typeof form.taxDeclarationNumber === "string" ? form.taxDeclarationNumber : null,
    propertyIdentificationNumber:
      typeof form.propertyIdentificationNumber === "string"
        ? form.propertyIdentificationNumber
        : null,
    taxIncentives:
      typeof form.taxIncentives === "string" ? form.taxIncentives : null,
    businessActivity:
      typeof form.businessActivity === "string" ? form.businessActivity : null,
    lineOfBusiness:
      typeof form.lineOfBusiness === "string" ? form.lineOfBusiness : null,
    assetSize: parseOptionalDecimalForDb(
      typeof form.assetSize === "string" ? form.assetSize : null
    ),
    isMarket: typeof form.isMarket === "boolean" ? form.isMarket : false,
    isAgriculture: typeof form.isAgriculture === "boolean" ? form.isAgriculture : false,
    permitExpirationDate: resolvePermitExpirationDateForRelease(
      app.applicationType as ApplicationType,
      app.permitIssuance?.issuedAt ?? null
    ),
    businessStatus: "ACTIVE" as const,
    closedAt: null,
    closureApplicationId: null,
  };

  if (app.businessRecordId) {
    await tx.businessRecord.update({
      where: { businessRecordId: app.businessRecordId },
      data: payload,
    });
    return app.businessRecordId;
  }

  const record = await tx.businessRecord.upsert({
    where: { registrationNumber: payload.registrationNumber },
    create: payload,
    update: payload,
    select: { businessRecordId: true },
  });

  await tx.businessApplication.update({
    where: { businessApplicationId: app.businessApplicationId },
    data: { businessRecordId: record.businessRecordId },
  });

  return record.businessRecordId;
}

export async function preparePermitIssuance(
  applicationId: string,
  bploUserId: string,
  remarks?: string
) {
  const result = await prisma.$transaction(async (tx: any) => {
    const app = await tx.businessApplication.findUnique({
      where: { businessApplicationId: applicationId },
      include: {
        applicant: { select: { name: true, email: true } },
        businessRecord: { select: { businessName: true, phone: true } },
        feeAssessment: {
          select: {
            releasePaymentAmount: true,
            totalAmount: true,
            paymentStatus: true,
          },
        },
        paymentReferences: {
          where: { status: "VERIFIED" },
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: { paymentReferenceId: true },
        },
        permitIssuance: true,
      },
    });

    if (!app) throw new Error("Application not found");
    if (app.status !== "PAID") {
      throw new Error("Only PAID applications can be prepared for release");
    }

    if (!app.paymentReferences?.[0]) {
      throw new Error("Application payment reference must be VERIFIED before permit preparation");
    }

    const requiredReleasePayment = toMoneyNumber(app.feeAssessment?.releasePaymentAmount);
    const amountPaid =
      app.feeAssessment?.paymentStatus === "PAID"
        ? toMoneyNumber(app.feeAssessment?.releasePaymentAmount ?? app.feeAssessment?.totalAmount)
        : 0;
    if (requiredReleasePayment > 0 && amountPaid < requiredReleasePayment) {
      throw new Error("Required release payment has not been completed");
    }

    const documentType = resolveDocumentType(app.applicationType as ApplicationType);
    const documentNumber = app.permitIssuance?.documentNumber
      ? app.permitIssuance.documentNumber
      : await generateDocumentNumber(tx, documentType);

    const issuance = await tx.permitIssuance.upsert({
      where: { applicationId },
      create: {
        applicationId,
        documentNumber,
        documentType,
        status: "FOR_RELEASE",
        issuedAt: new Date(),
        preparedById: bploUserId,
        remarks: remarks?.trim() || null,
      },
      update: {
        documentType,
        documentNumber,
        status: "FOR_RELEASE",
        issuedAt: app.permitIssuance?.issuedAt ?? new Date(),
        preparedById: app.permitIssuance?.preparedById ?? bploUserId,
        remarks: remarks?.trim() || app.permitIssuance?.remarks || null,
      },
    });

    assertStatusTransition(app.status, "FOR_RELEASE");

    await tx.businessApplication.update({
      where: { businessApplicationId: applicationId },
      data: { status: "FOR_RELEASE" },
    });

    await tx.applicationHistory.create({
      data: {
        applicationId,
        actorId: bploUserId,
        actorRole: "BPLO",
        fromStatus: "PAID",
        toStatus: "FOR_RELEASE",
        remarks:
          `Prepared ${documentType === "CLOSURE_CERTIFICATE" ? "Closure Certificate" : "Business Permit"}` +
          ` (${documentNumber}) for release.${remarks?.trim() ? ` Remarks: ${remarks.trim()}` : ""}`,
      },
    });

    const businessName = resolveBusinessName(app.formData, app.businessRecord?.businessName ?? null);
    const toPhone = resolveApplicantPhone(app.formData) ?? app.businessRecord?.phone ?? null;

    return {
      applicationId,
      applicationNumber: app.applicationNumber,
      documentNumber: issuance.documentNumber,
      documentType: issuance.documentType as IssuanceDocumentType,
      status: issuance.status,
      newApplicationStatus: "FOR_RELEASE" as const,
      smsContext: {
        applicationId,
        applicantId: app.applicantId,
        applicationNumber: app.applicationNumber,
        applicantName: app.applicant.name,
        businessName,
        status: "FOR_RELEASE" as const,
        toPhone,
      },
    };
  });

  const smsDelivery = await sendReleaseStatusSms(result.smsContext);
  return {
    applicationId: result.applicationId,
    applicationNumber: result.applicationNumber,
    documentNumber: result.documentNumber,
    documentType: result.documentType,
    status: result.status,
    newApplicationStatus: result.newApplicationStatus,
    smsDelivery,
  };
}

export async function releasePermitIssuance(
  applicationId: string,
  bploUserId: string,
  remarks?: string
) {
  const result = await prisma.$transaction(async (tx: any) => {
    const app = await tx.businessApplication.findUnique({
      where: { businessApplicationId: applicationId },
      include: {
        applicant: { select: { name: true, email: true } },
        businessRecord: { select: { businessName: true, phone: true } },
        permitIssuance: true,
      },
    });

    if (!app) throw new Error("Application not found");
    if (app.status !== "FOR_RELEASE") {
      throw new Error("Only FOR_RELEASE applications can be marked as released");
    }
    if (!app.permitIssuance) {
      throw new Error("Permit issuance record not found");
    }

    await tx.permitIssuance.update({
      where: { applicationId },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
        releasedById: bploUserId,
        remarks: remarks?.trim() || app.permitIssuance.remarks || null,
      },
    });

    assertStatusTransition(app.status, "RELEASED");

    await tx.businessApplication.update({
      where: { businessApplicationId: applicationId },
      data: { status: "RELEASED" },
    });

    const businessRecordId = await upsertBusinessRecordOnRelease(tx, app);

    let complianceClosureResult: Awaited<ReturnType<typeof finalizeComplianceRelatedClosure>> | null = null;
    if (app.applicationType === "CLOSURE") {
      complianceClosureResult = await finalizeComplianceRelatedClosure(tx, {
        closureApplicationId: applicationId,
        actingUserId: bploUserId,
        completionStatus: "RELEASED",
      });

      if (!complianceClosureResult.applied && businessRecordId) {
        await tx.businessRecord.update({
          where: { businessRecordId },
          data: {
            businessStatus: "CLOSED",
            closedAt: new Date(),
            closureApplicationId: app.businessApplicationId,
          },
        });
      }
    }

    const form = (app.formData ?? {}) as Record<string, unknown>;
    const latitude = typeof form.businessLatitude === "number" ? form.businessLatitude : null;
    const longitude = typeof form.businessLongitude === "number" ? form.businessLongitude : null;

    if (businessRecordId) {
      await upsertBusinessLocationForBusinessRecord(tx, {
        businessRecordId,
        latitude,
        longitude,
        address: typeof form.businessAddress === "string" ? form.businessAddress : null,
        barangay:
          typeof form.barangay === "string" && form.barangay.trim()
            ? form.barangay.trim()
            : typeof form.businessBarangay === "string" && form.businessBarangay.trim()
              ? form.businessBarangay.trim()
              : null,
        submittedById: app.applicantId,
      });
    }

    await tx.applicationHistory.create({
      data: {
        applicationId,
        actorId: bploUserId,
        actorRole: "BPLO",
        fromStatus: "FOR_RELEASE",
        toStatus: "RELEASED",
        remarks:
          `Application marked released.${remarks?.trim() ? ` Remarks: ${remarks.trim()}` : ""}`,
      },
    });

    return {
      applicationId,
      applicationNumber: app.applicationNumber,
      documentNumber: app.permitIssuance.documentNumber,
      status: "RELEASED" as const,
      newApplicationStatus: "RELEASED" as const,
      complianceClosureResult,
    };
  });

  return {
    applicationId: result.applicationId,
    applicationNumber: result.applicationNumber,
    documentNumber: result.documentNumber,
    status: result.status,
    newApplicationStatus: result.newApplicationStatus,
  };
}
