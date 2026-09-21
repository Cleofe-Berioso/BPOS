import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit-log";
import { mapDbStatusToUi } from "@/lib/application-mappers";
import { assertStatusTransition } from "@/lib/application-status";
import { computeMayorsPermitFee, detectBusinessCategory } from "@/lib/fee-computation";
import { getRuntimeFeeSettings } from "@/lib/fee-settings";
import { toMoneyNumber } from "@/lib/money";
import type { BusinessInfo, FeeLineItemInput } from "@/lib/applicant-types";
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

type PaymentFrequency = "ANNUAL" | "BI_ANNUAL" | "QUARTERLY";
const PAYMENT_FREQUENCIES: PaymentFrequency[] = ["ANNUAL", "BI_ANNUAL", "QUARTERLY"];

const MAYORS_PERMIT_FEE_LABEL = "Mayor's Permit Fee";
const REGULATORY_FEES_LABEL = "Regulatory Fees";
const RENEWAL_SURCHARGE_LABEL = "Renewal Surcharge";
const RENEWAL_INTEREST_LABEL = "Renewal Interest";
const LIQUOR_TOBACCO_SURCHARGE_LABEL = "Liquor/Tobacco Surcharge (25%)";
const CLOSURE_CERTIFICATE_FEE_LABEL = "Closure Certificate Fee";

const RENEWAL_COMPLIANCE_PENALTY_LABEL_PREFIX = "Renewal Compliance Penalty";

const SEVERITY_ORDER: Record<string, number> = { MINOR: 1, MAJOR: 2, SEVERE: 3 };

function getHighestRenewalComplianceSeverity(
  inspections: Array<{ nonComplianceType: string | null; violationSeverity: string | null; isSettled: boolean }>
): "MINOR" | "MAJOR" | "SEVERE" | null {
  let best: "MINOR" | "MAJOR" | "SEVERE" | null = null;
  for (const insp of inspections) {
    if (insp.nonComplianceType !== "RENEWAL_RELATED") continue;
    if (insp.isSettled) continue;
    const severity = insp.violationSeverity as "MINOR" | "MAJOR" | "SEVERE" | null;
    if (!severity) continue;
    if (!best || SEVERITY_ORDER[severity] > SEVERITY_ORDER[best]) {
      best = severity;
    }
  }
  return best;
}

function resolveRenewalCompliancePenalty(
  severity: "MINOR" | "MAJOR" | "SEVERE" | null,
  runtimeSettings: any
): number {
  void severity;
  void runtimeSettings;
  return 0;
}

const ASSESSMENT_QUEUE_STATUSES: DbApplicationStatus[] = ["DEPARTMENT_HEAD_APPROVED", "ASSESSED"];
const ASSESSMENT_DETAIL_ALLOWED_STATUSES: DbApplicationStatus[] = [
  "DEPARTMENT_HEAD_APPROVED",
  "ASSESSED",
  "APPROVED_FOR_PAYMENT",
];
const ASSESSMENT_MUTATION_ALLOWED_STATUSES: DbApplicationStatus[] = [
  "DEPARTMENT_HEAD_APPROVED",
  "ASSESSED",
];

export interface AssessmentFeeRow {
  id: string;
  applicationNumber: string;
  businessName: string;
  applicantName: string;
  applicantEmail: string;
  applicationType: "NEW" | "RENEWAL" | "CLOSURE";
  lineOfBusiness: string;
  status: string;
  lastUpdated: string;
  hasAssessment: boolean;
  assessmentStatus: "DRAFT" | "GENERATED" | null;
  reassessmentRequested?: boolean;
}

export interface AssessmentLineItem {
  id: string;
  description: string;
  amount: number;
  sortOrder: number;
  isSystemGenerated: boolean;
}

export interface AssessmentDetail {
  id: string;
  applicationNumber: string;
  applicationType: "NEW" | "RENEWAL" | "CLOSURE";
  status: string;
  rawStatus: DbApplicationStatus;
  submittedAt: string | null;
  applicant: { id: string; name: string; email: string };
  businessName: string;
  lineOfBusiness: string;
  assetSize: string;
  totalEmployees: string;
  businessType: string;
  businessActivity: string;
  hasTaxIncentives: boolean;
  applicantPaymentFrequency: PaymentFrequency | null;
  suggestedFees: {
    mayorsPermitFee: number;
    regulatoryFees: number;
    surcharge: number;
    liquorTobaccoSurcharge: number;
    interest: number;
    closureCertificateFee: number;
    computation: string;
    category: string;
    sizeClassification: string;
    detectedCategory: string;
    assetClassification: string;
    workerClassification: string;
    selectedClassification: string;
    assetBasedFee: number;
    workerBasedFee: number;
    selectedMayorPermitFee: number;
    specialRuleApplied: string | null;
    overdueMonths: number;
    renewalCompliancePenalty: number;
    renewalComplianceSeverity: "MINOR" | "MAJOR" | "SEVERE" | null;
  };
  suggestedLineItems: AssessmentLineItem[];
  assessment: SavedAssessment | null;
}

export interface SavedAssessment {
  id: string;
  assessmentNumber: string;
  status: "DRAFT" | "GENERATED";
  paymentFrequency: PaymentFrequency;
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
  computedById: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: AssessmentLineItem[];
  reassessmentRequestedAt: string | null;
}

export interface AssessmentInput {
  lineItems: FeeLineItemInput[];
  closurePaymentDues?: number;
  remarks?: string;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampMoney(value: unknown): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) && parsed > 0 ? roundMoney(parsed) : 0;
}

function resolveBusinessName(formData: unknown, fallback: string | null): string {
  const maybeForm = formData as Partial<BusinessInfo>;
  return maybeForm.businessName ?? fallback ?? "-";
}

function resolveField(formData: unknown, key: keyof BusinessInfo): string {
  const form = formData as Partial<BusinessInfo>;
  const value = form[key];
  return (typeof value === "string" ? value : null) ?? "-";
}

function resolveLiquorOrTobacco(formData: unknown): boolean {
  const maybeForm = formData as Partial<BusinessInfo>;
  return Boolean(maybeForm.isLiquorOrTobacco);
}

function resolveHasTaxIncentives(formData: unknown): boolean {
  const maybeForm = formData as Partial<BusinessInfo>;
  return maybeForm.hasTaxIncentives === "YES";
}

function toDateOnly(date: Date | null): string {
  if (!date) return "-";
  return date.toISOString().slice(0, 10);
}

async function generateAssessmentNumber(dbClient: any = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const count = await dbClient.feeAssessment.count();
  return `TOP-${year}-${String(count + 1).padStart(5, "0")}`;
}

function toAssessmentLineItem(row: any): AssessmentLineItem {
  return {
    id: row.feeAssessmentLineItemId ?? row.id,
    description: row.description,
    amount: toMoneyNumber(row.amount),
    sortOrder: row.sortOrder,
    isSystemGenerated: row.isSystemGenerated,
  };
}

function toSavedAssessment(row: any): SavedAssessment {
  return {
    id: row.feeAssessmentId ?? row.id,
    assessmentNumber: row.assessmentNumber,
    status: row.status as "DRAFT" | "GENERATED",
    paymentFrequency: row.paymentFrequency as PaymentFrequency,
    annualAssessedAmount: toMoneyNumber(row.annualAssessedAmount),
    releasePaymentAmount: toMoneyNumber(row.releasePaymentAmount),
    amountPaid: toMoneyNumber(row.amountPaid ?? 0),
    remainingBalance: toMoneyNumber(row.remainingBalance ?? row.totalAmount ?? 0),
    paymentStatus: row.paymentStatus as "UNPAID" | "PARTIALLY_PAID" | "PAID",
    mayorsPermitFee: toMoneyNumber(row.mayorsPermitFee),
    regulatoryFees: toMoneyNumber(row.regulatoryFees),
    additionalCharges: toMoneyNumber(row.additionalCharges),
    penalties: toMoneyNumber(row.penalties),
    surcharge: toMoneyNumber(row.surcharge),
    interest: toMoneyNumber(row.interest),
    closurePaymentDues: toMoneyNumber(row.closurePaymentDues),
    closureCertificateFee: toMoneyNumber(row.closureCertificateFee),
    arrears: 0,
    otherCharges: toMoneyNumber(row.otherCharges),
    totalAmount: toMoneyNumber(row.totalAmount),
    remarks: row.remarks,
    computedById: row.computedById,
    generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lineItems: (row.lineItems ?? []).map(toAssessmentLineItem),
    reassessmentRequestedAt: row.reassessmentRequestedAt ? (row.reassessmentRequestedAt as Date).toISOString() : null,
  };
}

function monthDifference(startDate: Date, endDate: Date): number {
  const yearDiff = endDate.getUTCFullYear() - startDate.getUTCFullYear();
  const monthDiff = endDate.getUTCMonth() - startDate.getUTCMonth();
  const rawMonths = yearDiff * 12 + monthDiff;
  return endDate.getUTCDate() > startDate.getUTCDate() ? rawMonths + 1 : rawMonths;
}

function resolvePermitExpirationDate(application: any): Date | null {
  const directDate = application.businessRecord?.permitExpirationDate ?? null;
  if (directDate) {
    return directDate;
  }

  const latestReleased = application.businessRecord?.applications?.[0]?.permitIssuance?.releasedAt ?? null;
  if (!latestReleased) {
    return null;
  }

  return new Date(Date.UTC(latestReleased.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
}

function resolveOverdueMonths(application: any): number {
  if (application.applicationType !== "RENEWAL") {
    return 0;
  }

  const expirationDate = resolvePermitExpirationDate(application);
  if (!expirationDate) {
    return 0;
  }

  const now = new Date();
  if (now <= expirationDate) {
    return 0;
  }

  return Math.max(0, monthDifference(expirationDate, now));
}

function buildSuggestedLineItems(
  applicationType: "NEW" | "RENEWAL" | "CLOSURE",
  suggestedFees: AssessmentDetail["suggestedFees"]
): AssessmentLineItem[] {
  const items: AssessmentLineItem[] = [];

  if (applicationType !== "CLOSURE") {
    items.push({
      id: `${MAYORS_PERMIT_FEE_LABEL}-suggested`,
      description: MAYORS_PERMIT_FEE_LABEL,
      amount: suggestedFees.mayorsPermitFee,
      sortOrder: items.length,
      isSystemGenerated: false,
    });

    if (suggestedFees.liquorTobaccoSurcharge > 0) {
      items.push({
        id: `${LIQUOR_TOBACCO_SURCHARGE_LABEL}-system`,
        description: LIQUOR_TOBACCO_SURCHARGE_LABEL,
        amount: suggestedFees.liquorTobaccoSurcharge,
        sortOrder: items.length,
        isSystemGenerated: true,
      });
    }
  }

  if (applicationType === "RENEWAL" && suggestedFees.overdueMonths > 12) {
    items.push({
      id: `${RENEWAL_SURCHARGE_LABEL}-system`,
      description: RENEWAL_SURCHARGE_LABEL,
      amount: suggestedFees.surcharge,
      sortOrder: items.length,
      isSystemGenerated: true,
    });
    items.push({
      id: `${RENEWAL_INTEREST_LABEL}-system`,
      description: RENEWAL_INTEREST_LABEL,
      amount: suggestedFees.interest,
      sortOrder: items.length,
      isSystemGenerated: true,
    });
  }

  if (applicationType === "RENEWAL" && suggestedFees.renewalCompliancePenalty > 0 && suggestedFees.renewalComplianceSeverity) {
    const label = `${RENEWAL_COMPLIANCE_PENALTY_LABEL_PREFIX} (${suggestedFees.renewalComplianceSeverity})`;
    items.push({
      id: `${RENEWAL_COMPLIANCE_PENALTY_LABEL_PREFIX}-system`,
      description: label,
      amount: suggestedFees.renewalCompliancePenalty,
      sortOrder: items.length,
      isSystemGenerated: true,
    });
  }

  if (applicationType === "CLOSURE") {
    items.push({
      id: `${CLOSURE_CERTIFICATE_FEE_LABEL}-system`,
      description: CLOSURE_CERTIFICATE_FEE_LABEL,
      amount: suggestedFees.closureCertificateFee,
      sortOrder: items.length,
      isSystemGenerated: true,
    });
  }

  return items;
}

function isRegulatoryFeeDescription(description: string) {
  const normalized = description.trim().toLowerCase();
  return normalized === REGULATORY_FEES_LABEL.toLowerCase() || normalized === "regulatory fee";
}

export function toReleasePaymentAmount(annualAssessedAmount: number, frequency: PaymentFrequency): number {
  // TOP release now requires full payment amount regardless of installment preference metadata.
  void frequency;
  return annualAssessedAmount;
}

export function resolveApplicantPaymentFrequency(formData: unknown): PaymentFrequency | null {
  const maybeForm = (formData ?? {}) as Record<string, unknown>;
  const raw = maybeForm.paymentFrequency;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim() as PaymentFrequency;
  return PAYMENT_FREQUENCIES.includes(normalized) ? normalized : null;
}

function isBlankCustomLineItem(item: FeeLineItemInput): boolean {
  if (item.isSystemGenerated) return false;
  const trimmedDesc = item.description?.trim() ?? "";
  return !trimmedDesc && !(item.amount > 0);
}

function validateCustomLineItems(lineItems: FeeLineItemInput[]): void {
  const customItems = lineItems.filter((item) => !item.isSystemGenerated && !isBlankCustomLineItem(item));
  customItems.forEach((item, index) => {
    const trimmedDesc = item.description?.trim() ?? "";
    if (!trimmedDesc) {
      throw new Error(`Custom fee item #${index + 1} has an empty description. Please enter a fee description.`);
    }
    if (item.amount <= 0) {
      throw new Error(`Custom fee item #${index + 1} "${trimmedDesc}" has an amount of ${item.amount}. Amount must be greater than 0.`);
    }
  });
}

function sanitizeCustomLineItems(lineItems: FeeLineItemInput[]): Array<{ description: string; amount: number }> {
  return lineItems
    .filter((item) => !item.isSystemGenerated)
    .filter((item) => !isBlankCustomLineItem(item))
    .filter((item) => !isRegulatoryFeeDescription(item.description ?? ""))
    .map((item) => ({
      description: item.description.trim(),
      amount: clampMoney(item.amount),
    }));
}

export function buildAutomaticRenewalCharges(
  baseMayorPermitFee: number,
  overdueMonths: number,
  settings: {
    penalties?: {
      renewalSurchargePercent?: number;
      monthlyInterestPercent?: number;
    };
    activeExtension?: {
      waiveSurcharge?: boolean;
      waiveInterest?: boolean;
    } | null;
    lateRenewalSurchargeRate?: number;
    lateRenewalMonthlyInterestRate?: number;
  } | null | undefined
) {
  if (overdueMonths <= 12 || baseMayorPermitFee <= 0) {
    return { surcharge: 0, interest: 0 };
  }

  const surchargePercent =
    typeof settings?.penalties?.renewalSurchargePercent === "number"
      ? settings.penalties.renewalSurchargePercent
      : typeof settings?.lateRenewalSurchargeRate === "number"
        ? settings.lateRenewalSurchargeRate * 100
        : 25;
  const interestPercent =
    typeof settings?.penalties?.monthlyInterestPercent === "number"
      ? settings.penalties.monthlyInterestPercent
      : typeof settings?.lateRenewalMonthlyInterestRate === "number"
        ? settings.lateRenewalMonthlyInterestRate * 100
        : 2;

  const surcharge = settings?.activeExtension?.waiveSurcharge
    ? 0
    : roundMoney(baseMayorPermitFee * (surchargePercent / 100));
  const interest = settings?.activeExtension?.waiveInterest
    ? 0
    : roundMoney(baseMayorPermitFee * (interestPercent / 100) * overdueMonths);

  return { surcharge, interest };
}

export function buildAutomaticLiquorTobaccoSurcharge(
  applicationType: "NEW" | "RENEWAL" | "CLOSURE",
  baseMayorPermitFee: number,
  isLiquorOrTobacco: boolean,
  settings: any
) {
  if (applicationType === "CLOSURE") {
    return 0;
  }

  if (!isLiquorOrTobacco || baseMayorPermitFee <= 0) {
    return 0;
  }

  const percent = typeof settings?.penalties?.liquorTobaccoAddOnPercent === "number"
    ? settings.penalties.liquorTobaccoAddOnPercent
    : 25;

  return roundMoney(baseMayorPermitFee * (percent / 100));
}

function buildAssessmentTotals(
  applicationType: "NEW" | "RENEWAL" | "CLOSURE",
  customLineItems: Array<{ description: string; amount: number }>,
  isLiquorOrTobacco: boolean,
  closurePaymentDues: number,
  overdueMonths: number,
  runtimeSettings: any,
  renewalCompliancePenalty = 0,
  renewalComplianceSeverity: "MINOR" | "MAJOR" | "SEVERE" | null = null
) {
  const nonRegulatoryCustomLineItems = customLineItems.filter(
    (item) => !isRegulatoryFeeDescription(item.description)
  );
  const isClosure = applicationType === "CLOSURE";
  const mayorLine = isClosure
    ? undefined
    : nonRegulatoryCustomLineItems.find((item) => item.description === MAYORS_PERMIT_FEE_LABEL);
  const automaticRenewal = isClosure
    ? { surcharge: 0, interest: 0 }
    : buildAutomaticRenewalCharges(mayorLine?.amount ?? 0, overdueMonths, runtimeSettings);
  const liquorTobaccoSurcharge = buildAutomaticLiquorTobaccoSurcharge(
    applicationType,
    mayorLine?.amount ?? 0,
    isLiquorOrTobacco,
    runtimeSettings
  );

  const systemLineItems: Array<{ description: string; amount: number; isSystemGenerated: boolean }> = [];
  if (!isClosure && liquorTobaccoSurcharge > 0) {
    systemLineItems.push({
      description: LIQUOR_TOBACCO_SURCHARGE_LABEL,
      amount: liquorTobaccoSurcharge,
      isSystemGenerated: true,
    });
  }
  if (applicationType === "RENEWAL" && overdueMonths > 12) {
    systemLineItems.push({
      description: RENEWAL_SURCHARGE_LABEL,
      amount: automaticRenewal.surcharge,
      isSystemGenerated: true,
    });
    systemLineItems.push({
      description: RENEWAL_INTEREST_LABEL,
      amount: automaticRenewal.interest,
      isSystemGenerated: true,
    });
  }
  if (applicationType === "RENEWAL" && renewalCompliancePenalty > 0 && renewalComplianceSeverity) {
    systemLineItems.push({
      description: `${RENEWAL_COMPLIANCE_PENALTY_LABEL_PREFIX} (${renewalComplianceSeverity})`,
      amount: renewalCompliancePenalty,
      isSystemGenerated: true,
    });
  }
  if (isClosure) {
    // Closure Certificate Fee remains system-fixed. Outstanding/settlement amount is BPLO-entered.
    systemLineItems.push({
      description: CLOSURE_CERTIFICATE_FEE_LABEL,
      amount: 100,
      isSystemGenerated: true,
    });
  }

  const allLineItems = [
    ...nonRegulatoryCustomLineItems.map((item) => ({ ...item, isSystemGenerated: false })),
    ...systemLineItems,
  ].filter((item) => item.amount > 0);

  const totalCustom = nonRegulatoryCustomLineItems.reduce((sum, item) => sum + item.amount, 0);
  const totalSystem = systemLineItems.reduce((sum, item) => sum + item.amount, 0);
  const totalAmount = roundMoney(totalCustom + totalSystem + closurePaymentDues);

  const knownCustomAmount = [mayorLine?.amount ?? 0].reduce((sum, item) => sum + item, 0);
  const uncategorizedCustomAmount = roundMoney(totalCustom - knownCustomAmount);

  return {
    lineItems: allLineItems,
    mayorsPermitFee: isClosure ? 0 : mayorLine?.amount ?? 0,
    regulatoryFees: 0,
    additionalCharges: 0,
    penalties: renewalCompliancePenalty,
    surcharge: roundMoney(automaticRenewal.surcharge + liquorTobaccoSurcharge),
    interest: automaticRenewal.interest,
    closurePaymentDues,
    closureCertificateFee: isClosure ? 100 : 0,
    arrears: 0,
    otherCharges: uncategorizedCustomAmount,
    totalAmount,
  };
}

function sanitizeAssessmentInput(input: AssessmentInput): AssessmentInput {
  return {
    lineItems: input.lineItems ?? [],
    closurePaymentDues: clampMoney(input.closurePaymentDues),
    remarks: input.remarks?.trim() ?? undefined,
  };
}

function parseClosureSettlementAmountForValidation(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

function validateClosureSettlementAmountForTopGeneration(
  applicationType: "NEW" | "RENEWAL" | "CLOSURE",
  mode: "DRAFT" | "GENERATED",
  rawClosurePaymentDues: unknown
): void {
  if (applicationType !== "CLOSURE" || mode !== "GENERATED") {
    return;
  }

  // ₱0 is valid when there are no outstanding dues — the fixed ₱100 certificate fee still makes the TOP payable.
  const settlementAmount = parseClosureSettlementAmountForValidation(rawClosurePaymentDues);
  if (settlementAmount === null) {
    return;
  }
  if (Number.isNaN(settlementAmount)) {
    throw new Error("Settlement / Outstanding Amount must be a valid number (0 or greater) before generating the Closure TOP.");
  }
  if (settlementAmount < 0) {
    throw new Error("Settlement / Outstanding Amount cannot be negative.");
  }
}

function ensureTopHasPayableItems(applicationType: "NEW" | "RENEWAL" | "CLOSURE", totals: ReturnType<typeof buildAssessmentTotals>) {
  if (totals.totalAmount > 0) {
    return;
  }

  if (applicationType === "CLOSURE") {
    throw new Error("Closure assessment must include at least the fixed closure certificate fee or payment dues.");
  }

  throw new Error("Assessment must include at least one fee item before generating the Tax Order of Payment.");
}

async function getAssessmentApplication(applicationId: string, dbClient: any = prisma) {
  return dbClient.businessApplication.findUnique({
    where: { businessApplicationId: applicationId },
    include: {
      applicant: { select: { userId: true, name: true, email: true } },
      businessRecord: {
        include: {
          applications: {
            where: { status: "RELEASED" },
            orderBy: { updatedAt: "desc" },
            take: 1,
            include: {
              permitIssuance: {
                select: { releasedAt: true },
              },
            },
          },
          inspections: {
            select: {
              inspectionId: true,
              nonComplianceType: true,
              violationSeverity: true,
              isSettled: true,
            },
          },
        },
      },
      feeAssessment: {
        include: {
          lineItems: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
}

export async function listAssessmentFeeApplications(): Promise<AssessmentFeeRow[]> {
  const result = await listAssessmentFeeApplicationsPaginated({ page: 1, pageSize: 50 });
  return result.records;
}

export async function listAssessmentFeeApplicationsPaginated(options?: {
  page?: number | string;
  pageSize?: number | string;
}): Promise<PaginatedResult<AssessmentFeeRow>> {
  const { page, pageSize, skip, take } = resolvePagination(options);
  const where = {
    OR: [
      { status: { in: ASSESSMENT_QUEUE_STATUSES } },
      {
        feeAssessment: {
          is: {
            reassessmentRequestedAt: { not: null },
          },
        },
      },
    ],
  };

  const [rows, totalCount] = await Promise.all([
    prisma.businessApplication.findMany({
      where,
      include: {
        applicant: { select: { name: true, email: true } },
        businessRecord: { select: { businessName: true } },
        feeAssessment: { select: { status: true, reassessmentRequestedAt: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip,
      take,
    }),
    prisma.businessApplication.count({ where }),
  ]);

  const records = rows.map((row: any) => ({
    id: row.businessApplicationId,
    applicationNumber: row.applicationNumber,
    businessName: resolveBusinessName(row.formData, row.businessRecord?.businessName ?? null),
    applicantName: row.applicant.name,
    applicantEmail: row.applicant.email,
    applicationType: row.applicationType as "NEW" | "RENEWAL" | "CLOSURE",
    lineOfBusiness: resolveField(row.formData, "lineOfBusiness"),
    status: mapDbStatusToUi(row.status),
    lastUpdated: toDateOnly(row.updatedAt),
    hasAssessment: row.feeAssessment !== null,
    assessmentStatus: (row.feeAssessment?.status as "DRAFT" | "GENERATED" | null) ?? null,
    reassessmentRequested: Boolean(row.feeAssessment?.reassessmentRequestedAt),
  }));

  return buildPaginatedResult(records, totalCount, page, pageSize);
}

export async function getApplicationForAssessment(applicationId: string): Promise<AssessmentDetail | null> {
  const row = await getAssessmentApplication(applicationId);
  if (!row || !ASSESSMENT_DETAIL_ALLOWED_STATUSES.includes(row.status as DbApplicationStatus)) {
    return null;
  }

  const lineOfBusiness = resolveField(row.formData, "lineOfBusiness");
  const assetSize = resolveField(row.formData, "assetSize");
  const totalEmployees = resolveField(row.formData, "totalEmployees");
  const businessActivity = resolveField(row.formData, "businessActivity");
  const businessType = resolveField(row.formData, "businessType");
  const businessName = resolveBusinessName(row.formData, row.businessRecord?.businessName ?? null);
  const overdueMonths = resolveOverdueMonths(row);
  const runtimeSettings = await getRuntimeFeeSettings();
  const isLiquorOrTobacco = resolveLiquorOrTobacco(row.formData);
  const hasTaxIncentives = resolveHasTaxIncentives(row.formData);

  const computed = computeMayorsPermitFee(
    {
      applicationType: row.applicationType as "NEW" | "RENEWAL" | "CLOSURE",
      lineOfBusiness: lineOfBusiness !== "-" ? lineOfBusiness : null,
      assetSize: assetSize !== "-" ? assetSize : null,
      totalEmployees: totalEmployees !== "-" ? totalEmployees : null,
      isLateRenewal: overdueMonths > 12,
      lateMonths: overdueMonths > 12 ? overdueMonths : 0,
    },
    runtimeSettings
  );

  const automaticRenewal = buildAutomaticRenewalCharges(
    computed.selectedMayorPermitFee,
    overdueMonths,
    runtimeSettings
  );
  const liquorFromLob =
    lineOfBusiness !== "-" && detectBusinessCategory(lineOfBusiness) === "LIQUOR_TOBACCO";
  const automaticLiquorTobaccoSurcharge = buildAutomaticLiquorTobaccoSurcharge(
    row.applicationType,
    computed.mayorsPermitFee,
    isLiquorOrTobacco || liquorFromLob,
    runtimeSettings
  );

  const inspections: Array<{ nonComplianceType: string | null; violationSeverity: string | null; isSettled: boolean }> =
    row.businessRecord?.inspections ?? [];
  const renewalComplianceSeverity = row.applicationType === "RENEWAL"
    ? getHighestRenewalComplianceSeverity(inspections)
    : null;
  const renewalCompliancePenalty = resolveRenewalCompliancePenalty(renewalComplianceSeverity, runtimeSettings);

  const suggestedFees = {
    mayorsPermitFee: computed.mayorsPermitFee,
    regulatoryFees: computed.regulatoryFees,
    surcharge: automaticRenewal.surcharge,
    liquorTobaccoSurcharge: automaticLiquorTobaccoSurcharge,
    interest: automaticRenewal.interest,
    closureCertificateFee: row.applicationType === "CLOSURE" ? 100 : computed.closureCertificateFee,
    computation: computed.computation,
    category: computed.category,
    sizeClassification: computed.sizeClassification,
    detectedCategory: computed.detectedCategory,
    assetClassification: computed.assetClassification,
    workerClassification: computed.workerClassification,
    selectedClassification: computed.selectedClassification,
    assetBasedFee: computed.assetBasedFee,
    workerBasedFee: computed.workerBasedFee,
    selectedMayorPermitFee: computed.selectedMayorPermitFee,
    specialRuleApplied:
      automaticLiquorTobaccoSurcharge > 0
        ? `${computed.specialRuleApplied ? `${computed.specialRuleApplied} | ` : ""}Liquor/Tobacco surcharge applies at assessment based on Mayor's Permit Fee`
        : overdueMonths > 12
          ? `Late renewal beyond 1 year (${overdueMonths} months overdue)`
          : computed.specialRuleApplied,
    overdueMonths,
    renewalCompliancePenalty,
    renewalComplianceSeverity,
  };

  return {
    id: row.businessApplicationId,
    applicationNumber: row.applicationNumber,
    applicationType: row.applicationType as "NEW" | "RENEWAL" | "CLOSURE",
    status: mapDbStatusToUi(row.status),
    rawStatus: row.status as DbApplicationStatus,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    applicant: { id: row.applicant.userId, name: row.applicant.name, email: row.applicant.email },
    businessName,
    lineOfBusiness,
    assetSize,
    totalEmployees,
    businessType,
    businessActivity,
    hasTaxIncentives,
    applicantPaymentFrequency: resolveApplicantPaymentFrequency(row.formData),
    suggestedFees,
    suggestedLineItems: buildSuggestedLineItems(row.applicationType, suggestedFees),
    assessment: row.feeAssessment ? toSavedAssessment(row.feeAssessment) : null,
  };
}

function canMutateAssessment(status: DbApplicationStatus, hasPendingReassessment: boolean): boolean {
  if (ASSESSMENT_MUTATION_ALLOWED_STATUSES.includes(status)) {
    return true;
  }

  return status === "APPROVED_FOR_PAYMENT" && hasPendingReassessment;
}

function moveToAssessedWhenNeeded(status: DbApplicationStatus, hasPendingReassessment: boolean): DbApplicationStatus {
  if (status === "DEPARTMENT_HEAD_APPROVED") {
    return "ASSESSED";
  }

  if (status === "APPROVED_FOR_PAYMENT" && hasPendingReassessment) {
    return "ASSESSED";
  }

  return status;
}

async function persistAssessment(
  applicationId: string,
  bploUserId: string,
  input: AssessmentInput,
  mode: "DRAFT" | "GENERATED"
): Promise<SavedAssessment> {
  // Move slow operations outside the transaction to avoid timeout
  const sanitized = sanitizeAssessmentInput(input);
  const runtimeSettings = await getRuntimeFeeSettings();

  // Fetch application outside transaction for pre-validation
  const preCheckApplication = await prisma.businessApplication.findUnique({
    where: { businessApplicationId: applicationId },
    select: {
      businessApplicationId: true,
      status: true,
      applicationType: true,
      formData: true,
      feeAssessment: { select: { feeAssessmentId: true, assessmentNumber: true, status: true, reassessmentRequestedAt: true } },
    },
  });

  if (!preCheckApplication) {
    throw new Error("Application not found");
  }

  const preCheckHasPendingReassessment = Boolean(preCheckApplication.feeAssessment?.reassessmentRequestedAt);
  if (!canMutateAssessment(preCheckApplication.status as DbApplicationStatus, preCheckHasPendingReassessment)) {
    throw new Error(
      mode === "GENERATED"
        ? `Tax Order of Payment can only be generated for DEPARTMENT_HEAD_APPROVED or ASSESSED applications. Current status: ${preCheckApplication.status}`
        : `Assessment draft can only be saved for DEPARTMENT_HEAD_APPROVED or ASSESSED applications. Current status: ${preCheckApplication.status}`
    );
  }

  const existing = preCheckApplication.feeAssessment
    ? {
        id: preCheckApplication.feeAssessment.feeAssessmentId,
        assessmentNumber: preCheckApplication.feeAssessment.assessmentNumber,
        status: preCheckApplication.feeAssessment.status,
      }
    : null;

  if (existing?.status === "GENERATED" && mode === "DRAFT") {
    throw new Error("Tax Order of Payment has already been generated. Cannot revert to draft.");
  }

  validateClosureSettlementAmountForTopGeneration(
    preCheckApplication.applicationType as "NEW" | "RENEWAL" | "CLOSURE",
    mode,
    input.closurePaymentDues
  );

  const applicantPaymentFrequency = resolveApplicantPaymentFrequency(preCheckApplication.formData);
  const isClosureApplication = preCheckApplication.applicationType === "CLOSURE";
  if (!isClosureApplication && !applicantPaymentFrequency) {
    throw new Error("Payment frequency must be selected by the applicant before assessment finalization.");
  }
  const effectivePaymentFrequency: PaymentFrequency = applicantPaymentFrequency ?? "ANNUAL";

  // Validate and compute totals outside transaction
  validateCustomLineItems(sanitized.lineItems);
  const customLineItems = sanitizeCustomLineItems(sanitized.lineItems);

  // Generate assessment number outside transaction
  const assessmentNumber = existing?.assessmentNumber ?? (await generateAssessmentNumber(prisma));

  const savedAssessmentId = await prisma.$transaction(async (tx: any) => {
    // Fetch full application inside transaction for write consistency
    const application = await getAssessmentApplication(applicationId, tx);
    if (!application) {
      throw new Error("Application not found");
    }

    // Re-validate status hasn't changed
    const hasPendingReassessment = Boolean(application.feeAssessment?.reassessmentRequestedAt);
    if (!canMutateAssessment(application.status as DbApplicationStatus, hasPendingReassessment)) {
      throw new Error(
        mode === "GENERATED"
          ? `Tax Order of Payment can only be generated for DEPARTMENT_HEAD_APPROVED or ASSESSED applications. Current status: ${application.status}`
          : `Assessment draft can only be saved for DEPARTMENT_HEAD_APPROVED or ASSESSED applications. Current status: ${application.status}`
      );
    }

    const initialStatus = application.status as DbApplicationStatus;
    const workingStatus = moveToAssessedWhenNeeded(initialStatus, hasPendingReassessment);

    if (workingStatus !== initialStatus) {
      assertStatusTransition(initialStatus, "ASSESSED");
      await tx.businessApplication.update({
        where: { businessApplicationId: applicationId },
        data: { status: "ASSESSED" },
      });
    }

    const overdueMonths = resolveOverdueMonths(application);
    const lob = resolveField(application.formData, "lineOfBusiness");
    const isLiquorOrTobacco =
      resolveLiquorOrTobacco(application.formData) ||
      (lob !== "-" && detectBusinessCategory(lob) === "LIQUOR_TOBACCO");
    const applicationInspections: Array<{ nonComplianceType: string | null; violationSeverity: string | null; isSettled: boolean }> =
      application.businessRecord?.inspections ?? [];
    const complianceSeverity = application.applicationType === "RENEWAL"
      ? getHighestRenewalComplianceSeverity(applicationInspections)
      : null;
    const compliancePenalty = resolveRenewalCompliancePenalty(complianceSeverity, runtimeSettings);
    const totals = buildAssessmentTotals(
      application.applicationType,
      customLineItems,
      isLiquorOrTobacco,
      clampMoney(sanitized.closurePaymentDues),
      overdueMonths,
      runtimeSettings,
      compliancePenalty,
      complianceSeverity
    );

    if (mode === "GENERATED") {
      ensureTopHasPayableItems(application.applicationType, totals);
    }

    const annualAssessedAmount = totals.totalAmount;
    const releasePaymentAmount = toReleasePaymentAmount(annualAssessedAmount, effectivePaymentFrequency);
    const now = new Date();

    const saved = await tx.feeAssessment.upsert({
      where: { applicationId },
      create: {
        applicationId,
        assessmentNumber,
        status: mode,
        paymentFrequency: effectivePaymentFrequency,
        annualAssessedAmount,
        releasePaymentAmount,
        paymentStatus: "UNPAID",
        mayorsPermitFee: totals.mayorsPermitFee,
        regulatoryFees: totals.regulatoryFees,
        additionalCharges: totals.additionalCharges,
        penalties: totals.penalties,
        surcharge: totals.surcharge,
        interest: totals.interest,
        closurePaymentDues: totals.closurePaymentDues,
        closureCertificateFee: totals.closureCertificateFee,
        otherCharges: totals.otherCharges,
        totalAmount: totals.totalAmount,
        remarks: sanitized.remarks ?? null,
        computedById: bploUserId,
        generatedAt: mode === "GENERATED" ? now : null,
        reassessmentRequestedAt: null,
        reassessmentRequestedById: null,
      },
      update: {
        status: mode,
        paymentFrequency: effectivePaymentFrequency,
        annualAssessedAmount,
        releasePaymentAmount,
        paymentStatus: "UNPAID",
        mayorsPermitFee: totals.mayorsPermitFee,
        regulatoryFees: totals.regulatoryFees,
        additionalCharges: totals.additionalCharges,
        penalties: totals.penalties,
        surcharge: totals.surcharge,
        interest: totals.interest,
        closurePaymentDues: totals.closurePaymentDues,
        closureCertificateFee: totals.closureCertificateFee,
        otherCharges: totals.otherCharges,
        totalAmount: totals.totalAmount,
        remarks: sanitized.remarks ?? null,
        computedById: bploUserId,
        generatedAt: mode === "GENERATED" ? now : null,
        ...(mode === "GENERATED" ? { reassessmentRequestedAt: null, reassessmentRequestedById: null } : {}),
      },
    });

    await tx.feeAssessmentLineItem.deleteMany({
      where: { feeAssessmentId: saved.feeAssessmentId },
    });

    if (totals.lineItems.length > 0) {
      await tx.feeAssessmentLineItem.createMany({
        data: totals.lineItems.map((item, index) => ({
          feeAssessmentId: saved.feeAssessmentId,
          description: item.description,
          amount: item.amount,
          sortOrder: index,
          isSystemGenerated: item.isSystemGenerated,
        })),
      });
    }

    if (mode === "GENERATED") {
      assertStatusTransition(workingStatus, "APPROVED_FOR_PAYMENT");
      await tx.businessApplication.update({
        where: { businessApplicationId: applicationId },
        data: { status: "APPROVED_FOR_PAYMENT" },
      });
    }

    if (workingStatus !== initialStatus) {
      await tx.applicationHistory.create({
        data: {
          applicationId,
          actorId: bploUserId,
          actorRole: "BPLO",
          fromStatus: initialStatus,
          toStatus: "ASSESSED",
          remarks:
            initialStatus === "APPROVED_FOR_PAYMENT"
              ? "Assessment workflow reopened for applicant-requested reassessment."
              : "Assessment processing started after Department Head approval.",
        },
      });
    }

    await tx.applicationHistory.create({
      data: {
        applicationId,
        actorId: bploUserId,
        actorRole: "BPLO",
        fromStatus: workingStatus,
        toStatus: mode === "GENERATED" ? "APPROVED_FOR_PAYMENT" : workingStatus,
        remarks:
          mode === "GENERATED"
            ? [
                `Tax Order of Payment generated. TOP No.: ${assessmentNumber}, Total Amount Due: ₱${totals.totalAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
                ...(compliancePenalty > 0 && complianceSeverity
                  ? [`Renewal compliance penalty (${complianceSeverity}): ₱${compliancePenalty.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`]
                  : []),
              ].join(" | ")
            : `Assessment draft saved. Assessment No.: ${assessmentNumber}, Total: ₱${totals.totalAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
      },
    });

    // If reassessment was previously requested and BPLO generated/updated the TOP, record resolution
    if (mode === "GENERATED" && application.feeAssessment?.reassessmentRequestedAt) {
      await tx.applicationHistory.create({
        data: {
          applicationId,
          actorId: bploUserId,
          actorRole: "BPLO",
          fromStatus: application.status as DbApplicationStatus,
          toStatus: "APPROVED_FOR_PAYMENT",
          remarks: "Re-assessment request reviewed and resolved by BPLO. TOP updated.",
        },
      });
      // Audit log entry (non-blocking outside transaction)
    }

    // Return saved ID for post-transaction fetch
    return saved.feeAssessmentId;
  }, { maxWait: 10000, timeout: 10000 });

  const hadReassessment = Boolean(preCheckApplication?.feeAssessment?.reassessmentRequestedAt);

  // Fetch complete assessment after transaction completes
  const savedWithLineItems = await prisma.feeAssessment.findUniqueOrThrow({
    where: { feeAssessmentId: savedAssessmentId },
    include: {
      lineItems: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (hadReassessment && mode === "GENERATED") {
    void createAuditLog({
      actorId: bploUserId,
      actorRole: "BPLO",
      action: "REASSESSMENT_RESOLVED",
      module: "ASSESSMENT",
      entityType: "FEE_ASSESSMENT",
      entityId: savedWithLineItems.assessmentNumber ?? null,
      applicationId: applicationId,
      description: "BPLO reviewed and resolved a previously requested reassessment. TOP regenerated/updated.",
    });
  }

  return toSavedAssessment(savedWithLineItems);
}

export async function saveAssessmentDraft(
  applicationId: string,
  bploUserId: string,
  input: AssessmentInput
): Promise<SavedAssessment> {
  return persistAssessment(applicationId, bploUserId, input, "DRAFT");
}

export async function generateTop(
  applicationId: string,
  bploUserId: string,
  input: AssessmentInput
): Promise<SavedAssessment> {
  return persistAssessment(applicationId, bploUserId, input, "GENERATED");
}
