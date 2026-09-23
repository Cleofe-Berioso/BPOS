import { prisma } from "@/lib/prisma";
import { mapDbStatusToUi } from "@/lib/application-mappers";
import { assertStatusTransition } from "@/lib/application-status";
import { toMoneyNumber } from "@/lib/money";
import { buildPaginatedResult, resolvePagination, type PaginatedResult } from "@/lib/pagination";
import { sendPaymentVerifiedEmail } from "@/lib/payment-notifications";

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
 * Statuses where a payment reference may appear in the BPLO verification queue.
 * Includes RELEASED so historical payment refs for closed-out applications remain visible.
 */
const BPLO_PAYMENT_VISIBLE_STATUSES: DbApplicationStatus[] = [
  "APPROVED_FOR_PAYMENT",
  "PAID",
  "FOR_RELEASE",
  "RELEASED",
];

/**
 * Statuses where the application is still pending payment verification (BPLO hasn't verified yet).
 * Only APPROVED_FOR_PAYMENT allows approve/reject actions.
 */
const BPLO_PAYMENT_ACTIONABLE_STATUS: DbApplicationStatus = "APPROVED_FOR_PAYMENT";

export interface PaymentVerificationRow {
  paymentReferenceId: string;
  applicationId: string;
  applicationNumber: string;
  businessName: string;
  applicantName: string;
  applicantEmail: string;
  applicationType: "NEW" | "RENEWAL" | "CLOSURE";
  topNumber: string | null;
  annualAssessedAmount: number;
  releasePaymentAmount: number;
  totalAmountDue: number;
  amountPaid: number;
  paymentDate: string;
  transactionNumber: string;
  officialReceiptNumber: string;
  submittedAt: string;
  paymentStatus: "PENDING" | "VERIFIED" | "REJECTED";
  applicationStatus: string;
  reviewerRemarks: string | null;
  reviewedAt: string | null;
  proofFileName: string;
}

export interface PaymentVerificationLists {
  pending: PaymentVerificationRow[];
  verified: PaymentVerificationRow[];
  rejected: PaymentVerificationRow[];
}

export interface PaymentVerificationDetail {
  row: PaymentVerificationRow;
  applicant: { id: string; name: string; email: string };
  business: {
    businessName: string;
    businessType: string;
    lineOfBusiness: string;
    assetSize: string;
    totalEmployees: string;
  };
  top: {
    assessmentNumber: string | null;
    paymentFrequency: "ANNUAL" | "BI_ANNUAL" | "QUARTERLY" | null;
    annualAssessedAmount: number;
    releasePaymentAmount: number;
    amountPaid: number;
    remainingBalance: number;
    paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    mayorsPermitFee: number;
    regulatoryFees: number;
    additionalCharges: number;
    penalties: number;
    surcharge: number;
    interest: number;
    closurePaymentDues: number;
    closureCertificateFee: number;
    arrears: number;
    otherCharges: number;
    totalAmount: number;
    remarks: string | null;
    lineItems: Array<{
      id: string;
      description: string;
      amount: number;
      isSystemGenerated: boolean;
    }>;
  };
}

function resolveBusinessName(formData: unknown, fallback: string | null): string {
  const data = (formData ?? {}) as Record<string, unknown>;
  const fromForm =
    typeof data.businessName === "string" && data.businessName.trim()
      ? data.businessName.trim()
      : null;
  return fromForm ?? fallback ?? "-";
}

function resolveString(formData: unknown, key: string): string {
  const data = (formData ?? {}) as Record<string, unknown>;
  const val = data[key];
  return typeof val === "string" && val.trim() ? val.trim() : "-";
}

function toRow(params: {
  app: {
    businessApplicationId: string;
    applicationNumber: string;
    applicationType: "NEW" | "RENEWAL" | "CLOSURE";
    status: DbApplicationStatus;
    formData: unknown;
    applicant: { name: string; email: string };
    businessRecord: { businessName: string } | null;
    feeAssessment: {
      assessmentNumber: string;
      annualAssessedAmount: any;
      releasePaymentAmount: any;
      totalAmount: any;
    } | null;
  };
  ref: {
    paymentReferenceId: string;
    transactionNumber: string;
    paymentDate: Date;
    submittedAt: Date;
    status: "PENDING" | "VERIFIED" | "REJECTED";
    reviewerRemarks: string | null;
    reviewedAt: Date | null;
    proofFileName: string;
  };
}): PaymentVerificationRow {
  const { app, ref } = params;
  const paymentAmt = toMoneyNumber(app.feeAssessment?.releasePaymentAmount ?? app.feeAssessment?.totalAmount);
  return {
    paymentReferenceId: ref.paymentReferenceId,
    applicationId: app.businessApplicationId,
    applicationNumber: app.applicationNumber,
    businessName: resolveBusinessName(app.formData, app.businessRecord?.businessName ?? null),
    applicantName: app.applicant.name,
    applicantEmail: app.applicant.email,
    applicationType: app.applicationType,
    topNumber: app.feeAssessment?.assessmentNumber ?? null,
    annualAssessedAmount: toMoneyNumber(app.feeAssessment?.annualAssessedAmount),
    releasePaymentAmount: toMoneyNumber(app.feeAssessment?.releasePaymentAmount),
    totalAmountDue: toMoneyNumber(app.feeAssessment?.totalAmount),
    amountPaid: paymentAmt,
    paymentDate: ref.paymentDate.toISOString(),
    transactionNumber: ref.transactionNumber,
    officialReceiptNumber: ref.transactionNumber,
    submittedAt: ref.submittedAt.toISOString(),
    paymentStatus: ref.status,
    applicationStatus: mapDbStatusToUi(app.status),
    reviewerRemarks: ref.reviewerRemarks,
    reviewedAt: ref.reviewedAt ? ref.reviewedAt.toISOString() : null,
    proofFileName: ref.proofFileName,
  };
}

async function fetchCandidateApplications() {
  return (prisma as any).businessApplication.findMany({
    where: {
      // Include all application types: NEW, RENEWAL, and CLOSURE.
      // Do NOT filter by applicationType — all types go through the same
      // APPROVED_FOR_PAYMENT status when BPLO generates the TOP, and all
      // types use the same PaymentReference model for OR submission.
      applicationType: { in: ["NEW", "RENEWAL", "CLOSURE"] },
      // Include all statuses where payment references may be visible to BPLO.
      // RELEASED is included so CLOSURE and permit applications that completed
      // their payment flow still appear with their historical payment references.
      status: {
        in: BPLO_PAYMENT_VISIBLE_STATUSES,
      },
      feeAssessment: {
        isNot: null,
      },
      paymentReferences: {
        some: {},
      },
    },
    include: {
      applicant: { select: { userId: true, name: true, email: true } },
      businessRecord: { select: { businessName: true } },
      feeAssessment: {
        select: {
          assessmentNumber: true,
          paymentFrequency: true,
          annualAssessedAmount: true,
          releasePaymentAmount: true,
          paymentStatus: true,
          mayorsPermitFee: true,
          regulatoryFees: true,
          additionalCharges: true,
          penalties: true,
          surcharge: true,
          interest: true,
          closurePaymentDues: true,
          closureCertificateFee: true,
          otherCharges: true,
          totalAmount: true,
          remarks: true,
          lineItems: true,
        },
      },
      paymentReferences: {
        orderBy: { submittedAt: "desc" },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function listPaymentVerificationEntries(): Promise<PaymentVerificationLists> {
  const apps = await fetchCandidateApplications();

  const allRows: PaymentVerificationRow[] = [];

  for (const app of apps as any[]) {
    for (const ref of app.paymentReferences as any[]) {
      allRows.push(
        toRow({
          app: {
            businessApplicationId: app.businessApplicationId,
            applicationNumber: app.applicationNumber,
            applicationType: app.applicationType,
            status: app.status,
            formData: app.formData,
            applicant: app.applicant,
            businessRecord: app.businessRecord,
            feeAssessment: app.feeAssessment,
          },
          ref: {
            paymentReferenceId: ref.paymentReferenceId,
            transactionNumber: ref.transactionNumber,
            paymentDate: ref.paymentDate,
            submittedAt: ref.submittedAt,
            status: ref.status,
            reviewerRemarks: ref.reviewerRemarks,
            reviewedAt: ref.reviewedAt,
            proofFileName: ref.proofFileName,
          },
        })
      );
    }
  }

  allRows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return {
    pending: allRows.filter((r) => r.paymentStatus === "PENDING"),
    verified: allRows.filter((r) => r.paymentStatus === "VERIFIED"),
    rejected: allRows.filter((r) => r.paymentStatus === "REJECTED"),
  };
}

const paymentReferenceApplicationWhere = {
  applicationType: { in: ["NEW", "RENEWAL", "CLOSURE"] as const },
  status: { in: BPLO_PAYMENT_VISIBLE_STATUSES },
  feeAssessment: { isNot: null },
};

const paymentReferenceInclude = {
  application: {
    include: {
      applicant: { select: { userId: true, name: true, email: true } },
      businessRecord: { select: { businessName: true } },
      feeAssessment: {
        select: {
          assessmentNumber: true,
          annualAssessedAmount: true,
          releasePaymentAmount: true,
          totalAmount: true,
        },
      },
    },
  },
} as const;

export async function listPaymentVerificationEntriesPaginated(
  tab: "PENDING" | "VERIFIED" | "REJECTED",
  pagination?: { page?: number | string; pageSize?: number | string }
): Promise<PaginatedResult<PaymentVerificationRow>> {
  const { page, pageSize, skip, take } = resolvePagination(pagination);
  const where = {
    status: tab,
    application: paymentReferenceApplicationWhere,
  };

  const [refs, totalCount] = await Promise.all([
    (prisma as any).paymentReference.findMany({
      where,
      include: paymentReferenceInclude,
      orderBy: { submittedAt: "desc" },
      skip,
      take,
    }),
    (prisma as any).paymentReference.count({ where }),
  ]);

  const records = (refs as any[]).map((ref) =>
    toRow({
      app: {
        businessApplicationId: ref.application.businessApplicationId,
        applicationNumber: ref.application.applicationNumber,
        applicationType: ref.application.applicationType,
        status: ref.application.status,
        formData: ref.application.formData,
        applicant: ref.application.applicant,
        businessRecord: ref.application.businessRecord,
        feeAssessment: ref.application.feeAssessment,
      },
      ref: {
        paymentReferenceId: ref.paymentReferenceId,
        transactionNumber: ref.transactionNumber,
        paymentDate: ref.paymentDate,
        submittedAt: ref.submittedAt,
        status: ref.status,
        reviewerRemarks: ref.reviewerRemarks,
        reviewedAt: ref.reviewedAt,
        proofFileName: ref.proofFileName,
      },
    })
  );

  return buildPaginatedResult(records, totalCount, page, pageSize);
}

async function findReference(paymentReferenceId: string) {
  return (prisma as any).paymentReference.findUnique({
    where: { paymentReferenceId },
    include: {
      application: {
        include: {
          applicant: { select: { userId: true, name: true, email: true } },
          businessRecord: { select: { businessName: true } },
          feeAssessment: true,
        },
      },
    },
  });
}

export async function getPaymentVerificationDetail(
  paymentReferenceId: string
): Promise<PaymentVerificationDetail | null> {
  const found = await findReference(paymentReferenceId);
  if (!found) return null;

  const app = found.application;
  if (!BPLO_PAYMENT_VISIBLE_STATUSES.includes(app.status as DbApplicationStatus)) {
    return null;
  }

  const paymentAmt = toMoneyNumber(app.feeAssessment?.releasePaymentAmount ?? app.feeAssessment?.totalAmount);

  return {
    row: toRow({
      app: {
        businessApplicationId: app.businessApplicationId,
        applicationNumber: app.applicationNumber,
        applicationType: app.applicationType,
        status: app.status as DbApplicationStatus,
        formData: app.formData,
        applicant: app.applicant,
        businessRecord: app.businessRecord,
        feeAssessment: app.feeAssessment,
      },
      ref: {
        paymentReferenceId: found.paymentReferenceId,
        transactionNumber: found.transactionNumber,
        paymentDate: found.paymentDate,
        submittedAt: found.submittedAt,
        status: found.status,
        reviewerRemarks: found.reviewerRemarks,
        reviewedAt: found.reviewedAt,
        proofFileName: found.proofFileName,
      },
    }),
    applicant: {
      id: app.applicant.userId,
      name: app.applicant.name,
      email: app.applicant.email,
    },
    business: {
      businessName: resolveBusinessName(app.formData, app.businessRecord?.businessName ?? null),
      businessType: resolveString(app.formData, "businessType"),
      lineOfBusiness: resolveString(app.formData, "lineOfBusiness"),
      assetSize: resolveString(app.formData, "assetSize"),
      totalEmployees: resolveString(app.formData, "totalEmployees"),
    },
    top: {
      assessmentNumber: app.feeAssessment?.assessmentNumber ?? null,
      paymentFrequency: app.feeAssessment?.paymentFrequency ?? null,
      annualAssessedAmount: toMoneyNumber(app.feeAssessment?.annualAssessedAmount),
      releasePaymentAmount: toMoneyNumber(app.feeAssessment?.releasePaymentAmount),
      amountPaid: paymentAmt,
      remainingBalance: 0,
      paymentStatus: app.feeAssessment?.paymentStatus ?? "UNPAID",
      mayorsPermitFee: toMoneyNumber(app.feeAssessment?.mayorsPermitFee),
      regulatoryFees: toMoneyNumber(app.feeAssessment?.regulatoryFees),
      additionalCharges: toMoneyNumber(app.feeAssessment?.additionalCharges),
      penalties: toMoneyNumber(app.feeAssessment?.penalties),
      surcharge: toMoneyNumber(app.feeAssessment?.surcharge),
      interest: toMoneyNumber(app.feeAssessment?.interest),
      closurePaymentDues: toMoneyNumber(app.feeAssessment?.closurePaymentDues),
      closureCertificateFee: toMoneyNumber(app.feeAssessment?.closureCertificateFee),
      arrears: 0,
      otherCharges: toMoneyNumber(app.feeAssessment?.otherCharges),
      totalAmount: toMoneyNumber(app.feeAssessment?.totalAmount),
      remarks: app.feeAssessment?.remarks ?? null,
      lineItems: (app.feeAssessment?.lineItems ?? []).map((item: any) => ({
        id: item.feeAssessmentLineItemId ?? item.id,
        description: item.description,
        amount: toMoneyNumber(item.amount),
        isSystemGenerated: item.isSystemGenerated,
      })),
    },
  };
}

export async function approvePaymentReference(
  paymentReferenceId: string,
  bploUserId: string,
  remarks?: string
) {
  const found = await findReference(paymentReferenceId);
  if (!found) throw new Error("Payment reference not found");

  const app = found.application;
  const assessment = app.feeAssessment;

  if (!assessment) {
    throw new Error("Fee assessment not found for this application");
  }

  if (found.status !== "PENDING") {
    throw new Error("Only pending payment references can be verified");
  }

  // All application types (NEW, RENEWAL, CLOSURE) must be in APPROVED_FOR_PAYMENT
  // before BPLO can verify the payment. generateTop() moves all types to this status.
  if (app.status !== BPLO_PAYMENT_ACTIONABLE_STATUS) {
    throw new Error(
      `Application is not eligible for payment verification. Expected status: ${BPLO_PAYMENT_ACTIONABLE_STATUS}, current: ${app.status}`
    );
  }

  const requiredForRelease = Math.round(toMoneyNumber(assessment.totalAmount) * 100) / 100;
  const paymentStatus = "PAID";
  const now = new Date();

  await prisma.$transaction(async (tx: any) => {
    assertStatusTransition(app.status, "PAID");
    await tx.paymentReference.update({
      where: { paymentReferenceId: found.paymentReferenceId },
      data: {
        status: "VERIFIED",
        reviewerRemarks: remarks?.trim() ? remarks.trim() : null,
        reviewedAt: now,
        reviewedById: bploUserId,
      },
    });

    await tx.feeAssessment.update({
      where: { applicationId: app.businessApplicationId },
      data: {
        paymentStatus,
      },
    });

    await tx.businessApplication.update({
      where: { businessApplicationId: app.businessApplicationId },
      data: {
        status: "PAID",
      },
    });

    await tx.applicationHistory.create({
      data: {
        applicationId: app.businessApplicationId,
        actorId: bploUserId,
        actorRole: "BPLO",
        fromStatus: "APPROVED_FOR_PAYMENT",
        toStatus: "PAID",
        remarks:
          `BPLO verified OR number ${found.transactionNumber} for ₱${requiredForRelease.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
          })}.` + (remarks?.trim() ? ` Remarks: ${remarks.trim()}` : ""),
      },
    });
  });

  // Dispatch official Gmail payment confirmation and claiming reminder asynchronously
  void sendPaymentVerifiedEmail(found.paymentReferenceId, bploUserId).catch((err) => {
    console.error("[approvePaymentReference] Error dispatching payment reminder email:", err);
  });

  return {
    paymentReferenceId: found.paymentReferenceId,
    applicationId: app.businessApplicationId,
    applicationNumber: app.applicationNumber,
    previousStatus: "APPROVED_FOR_PAYMENT" as const,
    newStatus: "PAID" as const,
    totalAmountDue: toMoneyNumber(assessment.totalAmount),
    releasePaymentAmount: requiredForRelease,
    amountPaid: requiredForRelease,
    remainingBalance: 0,
  };
}

/**
 * Return a pending payment reference to the applicant for correction.
 * Marks PaymentReference REJECTED; application stays APPROVED_FOR_PAYMENT so TOP resubmit remains available.
 * Does NOT move BusinessApplication to RETURNED_FOR_CORRECTION (that status is for document/application review only).
 */
export async function returnPaymentReferenceForCorrection(
  paymentReferenceId: string,
  bploUserId: string,
  remarks: string
) {
  const reason = remarks.trim();
  if (!reason) throw new Error("Remarks are required when returning a payment for correction");

  const found = await findReference(paymentReferenceId);
  if (!found) throw new Error("Payment reference not found");

  const app = found.application;

  if (found.status !== "PENDING") {
    throw new Error("Only pending payment references can be returned for correction");
  }

  // All application types (NEW, RENEWAL, CLOSURE) must be in APPROVED_FOR_PAYMENT
  // before BPLO can return the payment reference for correction.
  if (app.status !== BPLO_PAYMENT_ACTIONABLE_STATUS) {
    throw new Error(
      `Application is not eligible for payment return. Expected status: ${BPLO_PAYMENT_ACTIONABLE_STATUS}, current: ${app.status}`
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx: any) => {
    await tx.paymentReference.update({
      where: { paymentReferenceId: found.paymentReferenceId },
      data: {
        status: "REJECTED",
        reviewerRemarks: reason,
        reviewedAt: now,
        reviewedById: bploUserId,
      },
    });

    await tx.applicationHistory.create({
      data: {
        applicationId: app.businessApplicationId,
        actorId: bploUserId,
        actorRole: "BPLO",
        fromStatus: "APPROVED_FOR_PAYMENT",
        toStatus: "APPROVED_FOR_PAYMENT",
        remarks: `BPLO returned payment for correction (OR ${found.transactionNumber}). Reason: ${reason}`,
      },
    });
  });

  return {
    paymentReferenceId: found.paymentReferenceId,
    applicationId: app.businessApplicationId,
    applicationNumber: app.applicationNumber,
    status: "APPROVED_FOR_PAYMENT" as const,
    rejectionRemarks: reason,
  };
}

/** @deprecated Prefer returnPaymentReferenceForCorrection — same soft-return semantics (UC-BP-12). */
export async function rejectPaymentReference(
  paymentReferenceId: string,
  bploUserId: string,
  remarks: string
) {
  return returnPaymentReferenceForCorrection(paymentReferenceId, bploUserId, remarks);
}
