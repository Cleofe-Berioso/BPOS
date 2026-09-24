import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

const scriptFilePath = fileURLToPath(import.meta.url);
const scriptDirPath = path.dirname(scriptFilePath);
const ROOT = path.resolve(scriptDirPath, "..");

let prisma!: PrismaClient;

const PASSWORD = "password123";
const PROOF_FILE_PATH = path.resolve(scriptDirPath, "smoke-test-proof.txt");

type Role = "APPLICANT" | "BPLO" | "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "JIT";
type ApplicationType = "NEW" | "RENEWAL" | "CLOSURE";
type ApplicationStatus =
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
type PaymentFrequency = "ANNUAL" | "BI_ANNUAL" | "QUARTERLY";
type PaymentReferenceStatus = "PENDING" | "VERIFIED" | "REJECTED";
type PaymentSettlementStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
type PermitIssuanceStatus = "FOR_RELEASE" | "RELEASED";
type BusinessLocationStatus = "PENDING" | "VERIFIED" | "NEEDS_CORRECTION";

interface SmokeUserInput {
  email: string;
  name: string;
  role: Role;
  isActive?: boolean;
}

interface SmokeBusinessRecordInput {
  applicantId: string;
  registrationNumber: string;
  tin: string;
  businessType: string;
  businessName: string;
  tradeName: string;
  ownerName: string;
  nationality: string;
  email: string;
  phone: string;
  mainOfficeAddress: string;
  businessAddress: string;
  lineOfBusiness: string;
  businessActivity: string;
  assetSize: string;
  totalEmployees: string;
}

interface SmokeApplicationInput {
  applicantId: string;
  applicationNumber: string;
  applicationType: ApplicationType;
  status: ApplicationStatus;
  businessRecordId?: string;
  formData: Prisma.InputJsonValue;
  submittedAt: Date;
}

interface SmokeAssessmentInput {
  applicationId: string;
  assessmentNumber: string;
  paymentFrequency: PaymentFrequency;
  annualAssessedAmount: number;
  amountPaid: number;
  status?: "DRAFT" | "GENERATED";
  computedById: string;
  remarks: string;
}

interface SmokePaymentReferenceInput {
  applicationId: string;
  transactionNumber: string;
  amountPaid: number;
  paymentDate: Date;
  status: PaymentReferenceStatus;
  proofFileName: string;
  proofStoragePath: string;
  proofMimeType: string;
  proofSizeBytes: number;
  submittedAt: Date;
  reviewerRemarks?: string | null;
  reviewedAt?: Date | null;
  reviewedById?: string | null;
}

interface SmokePermitInput {
  applicationId: string;
  documentNumber: string;
  documentType: "BUSINESS_PERMIT" | "CLOSURE_CERTIFICATE";
  status: PermitIssuanceStatus;
  issuedAt: Date;
  preparedById: string;
  releasedAt?: Date | null;
  releasedById?: string | null;
  remarks?: string | null;
}

interface SmokeLocationInput {
  businessRecordId: string;
  latitude: number;
  longitude: number;
  address: string;
  barangay: string;
  status: BusinessLocationStatus;
  submittedById: string;
  verifiedById?: string | null;
  remarks?: string | null;
}

function money(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function toReleasePaymentAmount(annual: number, frequency: PaymentFrequency): number {
  if (frequency === "BI_ANNUAL") return annual / 2;
  if (frequency === "QUARTERLY") return annual / 4;
  return annual;
}

function toSettlementStatus(amountPaid: number, annualAssessedAmount: number): PaymentSettlementStatus {
  if (amountPaid <= 0) return "UNPAID";
  if (amountPaid >= annualAssessedAmount) return "PAID";
  return "PARTIALLY_PAID";
}

function buildFormData(record: {
  registrationNumber: string;
  tin: string;
  businessType: string;
  businessName: string;
  tradeName: string;
  ownerName: string;
  nationality: string;
  email: string;
  phone: string;
  mainOfficeAddress: string;
  businessAddress: string;
  lineOfBusiness: string;
  businessActivity: string;
  assetSize: string;
  totalEmployees: string;
}): Prisma.InputJsonValue {
  return {
    registrationNumber: record.registrationNumber,
    tin: record.tin,
    businessType: record.businessType,
    businessName: record.businessName,
    tradeName: record.tradeName,
    ownerName: record.ownerName,
    nationality: record.nationality,
    email: record.email,
    contactNumber: record.phone,
    mainOfficeAddress: record.mainOfficeAddress,
    businessAddress: record.businessAddress,
    lineOfBusiness: record.lineOfBusiness,
    businessActivity: record.businessActivity,
    assetSize: record.assetSize,
    totalEmployees: record.totalEmployees,
  } satisfies Record<string, string>;
}

async function ensureUser(input: SmokeUserInput) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const isActive = input.isActive ?? true;
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      role: input.role,
      passwordHash,
      isActive,
    },
    create: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash,
      isActive,
    },
  });
}

async function ensureBusinessRecord(input: SmokeBusinessRecordInput) {
  const tin = BigInt(String(input.tin).replace(/\D/g, ""));
  const assetSize = input.assetSize ? String(input.assetSize).replace(/[,\s]/g, "") : null;
  const totalEmployees = input.totalEmployees
    ? Number.parseInt(String(input.totalEmployees).replace(/[,\s]/g, ""), 10)
    : null;

  const numericFields = {
    businessArea: 100,
    totalFloorArea: 120,
    maleEmployees: 2,
    femaleEmployees: 2,
    employeesWithinMunicipality: 3,
    deliveryVehicles: 1,
    assetSize,
    totalEmployees: Number.isFinite(totalEmployees) ? totalEmployees : null,
  };

  return prisma.businessRecord.upsert({
    where: { registrationNumber: input.registrationNumber },
    update: {
      applicantId: input.applicantId,
      businessType: input.businessType,
      tin,
      businessName: input.businessName,
      tradeName: input.tradeName,
      ownerName: input.ownerName,
      nationality: input.nationality,
      email: input.email,
      phone: input.phone,
      mainOfficeAddress: input.mainOfficeAddress,
      businessAddress: input.businessAddress,
      sameAsMainOffice: input.mainOfficeAddress === input.businessAddress,
      businessActivity: input.businessActivity,
      lineOfBusiness: input.lineOfBusiness,
      ...numericFields,
      propertyOwnership: "Owned",
      taxDeclarationNumber: `TD-${input.registrationNumber}`,
      propertyIdentificationNumber: `PIN-${input.registrationNumber}`,
      taxIncentives: "None",
    },
    create: {
      applicantId: input.applicantId,
      registrationNumber: input.registrationNumber,
      businessType: input.businessType,
      tin,
      businessName: input.businessName,
      tradeName: input.tradeName,
      ownerName: input.ownerName,
      nationality: input.nationality,
      email: input.email,
      phone: input.phone,
      mainOfficeAddress: input.mainOfficeAddress,
      businessAddress: input.businessAddress,
      sameAsMainOffice: input.mainOfficeAddress === input.businessAddress,
      businessActivity: input.businessActivity,
      lineOfBusiness: input.lineOfBusiness,
      ...numericFields,
      propertyOwnership: "Owned",
      taxDeclarationNumber: `TD-${input.registrationNumber}`,
      propertyIdentificationNumber: `PIN-${input.registrationNumber}`,
      taxIncentives: "None",
    },
  });
}

async function ensureApplication(input: SmokeApplicationInput) {
  return prisma.businessApplication.upsert({
    where: { applicationNumber: input.applicationNumber },
    update: {
      applicantId: input.applicantId,
      businessRecordId: input.businessRecordId ?? null,
      applicationType: input.applicationType,
      status: input.status,
      formData: input.formData,
      submittedAt: input.submittedAt,
    },
    create: {
      applicationNumber: input.applicationNumber,
      applicantId: input.applicantId,
      businessRecordId: input.businessRecordId ?? null,
      applicationType: input.applicationType,
      status: input.status,
      formData: input.formData,
      submittedAt: input.submittedAt,
    },
  });
}

async function ensureAssessment(input: SmokeAssessmentInput) {
  const releasePaymentAmount = toReleasePaymentAmount(
    input.annualAssessedAmount,
    input.paymentFrequency
  );
  const remainingBalance = Math.max(0, input.annualAssessedAmount - input.amountPaid);

  return prisma.feeAssessment.upsert({
    where: { applicationId: input.applicationId },
    update: {
      assessmentNumber: input.assessmentNumber,
      status: input.status ?? "GENERATED",
      paymentFrequency: input.paymentFrequency,
      annualAssessedAmount: money(input.annualAssessedAmount),
      releasePaymentAmount: money(releasePaymentAmount),
      paymentStatus: toSettlementStatus(input.amountPaid, input.annualAssessedAmount),
      mayorsPermitFee: money(input.annualAssessedAmount),
      regulatoryFees: money(0),
      additionalCharges: money(0),
      penalties: money(0),
      surcharge: money(0),
      interest: money(0),
      closureCertificateFee: money(0),
      otherCharges: money(0),
      totalAmount: money(input.annualAssessedAmount),
      remarks: input.remarks,
      computedById: input.computedById,
      generatedAt: input.status === "DRAFT" ? null : new Date(),
    },
    create: {
      applicationId: input.applicationId,
      assessmentNumber: input.assessmentNumber,
      status: input.status ?? "GENERATED",
      paymentFrequency: input.paymentFrequency,
      annualAssessedAmount: money(input.annualAssessedAmount),
      releasePaymentAmount: money(releasePaymentAmount),
      paymentStatus: toSettlementStatus(input.amountPaid, input.annualAssessedAmount),
      mayorsPermitFee: money(input.annualAssessedAmount),
      regulatoryFees: money(0),
      additionalCharges: money(0),
      penalties: money(0),
      surcharge: money(0),
      interest: money(0),
      closureCertificateFee: money(0),
      otherCharges: money(0),
      totalAmount: money(input.annualAssessedAmount),
      remarks: input.remarks,
      computedById: input.computedById,
      generatedAt: input.status === "DRAFT" ? null : new Date(),
    },
  });
}

async function ensurePaymentReference(input: SmokePaymentReferenceInput) {
  return prisma.paymentReference.upsert({
    where: { transactionNumber: input.transactionNumber },
    update: {
      applicationId: input.applicationId,
      paymentDate: input.paymentDate,
      proofFileName: input.proofFileName,
      proofStoragePath: input.proofStoragePath,
      proofMimeType: input.proofMimeType,
      proofSizeBytes: input.proofSizeBytes,
      status: input.status,
      reviewerRemarks: input.reviewerRemarks ?? null,
      submittedAt: input.submittedAt,
      reviewedAt: input.reviewedAt ?? null,
      reviewedById: input.reviewedById ?? null,
    },
    create: {
      applicationId: input.applicationId,
      transactionNumber: input.transactionNumber,
      paymentDate: input.paymentDate,
      proofFileName: input.proofFileName,
      proofStoragePath: input.proofStoragePath,
      proofMimeType: input.proofMimeType,
      proofSizeBytes: input.proofSizeBytes,
      status: input.status,
      reviewerRemarks: input.reviewerRemarks ?? null,
      submittedAt: input.submittedAt,
      reviewedAt: input.reviewedAt ?? null,
      reviewedById: input.reviewedById ?? null,
    },
  });
}

async function ensurePermitIssuance(input: SmokePermitInput) {
  return prisma.permitIssuance.upsert({
    where: { applicationId: input.applicationId },
    update: {
      documentNumber: input.documentNumber,
      documentType: input.documentType,
      status: input.status,
      issuedAt: input.issuedAt,
      releasedAt: input.releasedAt ?? null,
      preparedById: input.preparedById,
      releasedById: input.releasedById ?? null,
      remarks: input.remarks ?? null,
    },
    create: {
      applicationId: input.applicationId,
      documentNumber: input.documentNumber,
      documentType: input.documentType,
      status: input.status,
      issuedAt: input.issuedAt,
      releasedAt: input.releasedAt ?? null,
      preparedById: input.preparedById,
      releasedById: input.releasedById ?? null,
      remarks: input.remarks ?? null,
    },
  });
}

async function ensureBusinessLocation(input: SmokeLocationInput) {
  return prisma.businessLocation.upsert({
    where: { businessRecordId: input.businessRecordId },
    update: {
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      barangay: input.barangay,
      status: input.status,
      submittedById: input.submittedById,
      verifiedById: input.verifiedById ?? null,
      remarks: input.remarks ?? null,
    },
    create: {
      businessRecordId: input.businessRecordId,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      barangay: input.barangay,
      status: input.status,
      submittedById: input.submittedById,
      verifiedById: input.verifiedById ?? null,
      remarks: input.remarks ?? null,
    },
  });
}

/** Undo revocation/manual QA drift on released smoke rows (status, business record, inspections). */
async function resetReleasedSmokeRecord(applicationId: string, businessRecordId: string) {
  await prisma.businessApplication.update({
    where: { businessApplicationId: applicationId },
    data: { status: "RELEASED" },
  });

  await prisma.businessRecord.update({
    where: { businessRecordId },
    data: {
      businessStatus: "ACTIVE",
      closedAt: null,
      closureApplicationId: null,
    },
  });

  await prisma.inspection.updateMany({
    where: { applicationId, status: "REVOKED" },
    data: {
      status: "VERIFIED_COMPLIANT",
      complianceStatus: "COMPLIANT",
      revocationDecision: null,
      revocationRecommendationRemarks: null,
      revocationRemarks: null,
      decidedById: null,
      decidedAt: null,
      revocationSettledAt: null,
      revocationSettlementRemarks: null,
      revocationSettledById: null,
    },
  });

  await prisma.permitIssuance.updateMany({
    where: { applicationId },
    data: { status: "RELEASED" },
  });
}

async function ensureInspection(input: {
  businessRecordId: string;
  applicationId: string;
  inspectorId: string;
  complianceStatus: "COMPLIANT" | "NON_COMPLIANT";
  status:
    | "COMPLIANT"
    | "NON_COMPLIANT"
    | "DH_VERIFICATION_PENDING"
    | "VERIFIED_COMPLIANT"
    | "VERIFIED_NON_COMPLIANT"
    | "REVOCATION_REVIEW"
    | "REVOCATION_DENIED"
    | "REVOKED";
  comment?: string | null;
  decidedById?: string | null;
  revocationDecision?: "APPROVED" | "DENIED" | null;
  revocationRemarks?: string | null;
  decidedAt?: Date | null;
  revocationSettledAt?: Date | null;
}) {
  const existing = await prisma.inspection.findFirst({
    where: {
      businessRecordId: input.businessRecordId,
      applicationId: input.applicationId,
    },
    select: { inspectionId: true },
  });

  if (existing) {
    return prisma.inspection.update({
      where: { inspectionId: existing.inspectionId },
      data: {
        inspectorId: input.inspectorId,
        complianceStatus: input.complianceStatus,
        status: input.status,
        comment: input.comment ?? null,
        decidedById: input.decidedById ?? null,
        revocationDecision: input.revocationDecision ?? null,
        revocationRemarks: input.revocationRemarks ?? null,
        decidedAt: input.decidedAt ?? null,
        revocationSettledAt: input.revocationSettledAt ?? null,
      },
    });
  }

  return prisma.inspection.create({
    data: {
      businessRecordId: input.businessRecordId,
      applicationId: input.applicationId,
      inspectorId: input.inspectorId,
      complianceStatus: input.complianceStatus,
      status: input.status,
      comment: input.comment ?? null,
      decidedById: input.decidedById ?? null,
      revocationDecision: input.revocationDecision ?? null,
      revocationRemarks: input.revocationRemarks ?? null,
      decidedAt: input.decidedAt ?? null,
      revocationSettledAt: input.revocationSettledAt ?? null,
    },
  });
}

async function ensureHistory(
  applicationId: string,
  actorId: string,
  actorRole: Role,
  fromStatus: ApplicationStatus | null,
  toStatus: ApplicationStatus,
  createdAt: Date,
  remarks: string
) {
  const existing = await prisma.applicationHistory.findFirst({
    where: {
      applicationId,
      actorId,
      actorRole,
      fromStatus,
      toStatus,
      remarks,
    },
    select: { applicationHistoryId: true },
  });

  if (existing) return existing;

  return prisma.applicationHistory.create({
    data: {
      applicationId,
      actorId,
      actorRole,
      fromStatus,
      toStatus,
      remarks,
      createdAt,
    },
  });
}

async function main() {
  try {
    loadEnvFile(path.join(ROOT, ".env"));
  } catch {
    // Optional when DATABASE_URL is already in the environment
  }
  prisma = (await import("../src/lib/prisma")).prisma;

  console.log("[seed-smoke-test-data] start");
  console.log("[seed-smoke-test-data] no reset/delete operations will be performed");

  const applicant = await ensureUser({
    email: "applicant@example.com",
    name: "Juan dela Cruz",
    role: "APPLICANT",
  });
  const duplicateApplicant = await ensureUser({
    email: "smoke.duplicate@example.com",
    name: "Liza Duplicate",
    role: "APPLICANT",
  });
  const bplo = await ensureUser({
    email: "bplo@example.com",
    name: "BPLO Officer",
    role: "BPLO",
  });
  // Prefer the production IT Admin login; migrate any leftover demo email first.
  const legacySuperAdmin = await prisma.user.findUnique({
    where: { email: "superadmin@example.com" },
    select: { userId: true },
  });
  if (legacySuperAdmin) {
    const conflict = await prisma.user.findUnique({
      where: { email: "bpossuperadmin@gmail.com" },
      select: { userId: true },
    });
    if (!conflict) {
      await prisma.user.update({
        where: { userId: legacySuperAdmin.userId },
        data: { email: "bpossuperadmin@gmail.com" },
      });
    }
  }
  const superadmin = await ensureUser({
    email: "bpossuperadmin@gmail.com",
    name: "IT Administrator",
    role: "SUPER_ADMIN",
  });
  const deptHead = await ensureUser({
    email: "dept-head@example.com",
    name: "Department Head Officer",
    role: "DEPARTMENT_HEAD",
  });
  const jit = await ensureUser({
    email: "jit@example.com",
    name: "JIT Inspector",
    role: "JIT",
  });
  await ensureUser({
    email: "jit-disabled@example.com",
    name: "Disabled JIT Inspector",
    role: "JIT",
    isActive: false,
  });

  const retailRecord = await ensureBusinessRecord({
    applicantId: applicant.userId,
    registrationNumber: "SMOKE-REG-RETAIL-001",
    tin: "900-000-001-001",
    businessType: "Sole Proprietorship",
    businessName: "Smoke Retail Hub",
    tradeName: "Retail Hub",
    ownerName: "Maria Santos",
    nationality: "Filipino",
    email: "applicant@example.com",
    phone: "09171230001",
    mainOfficeAddress: "Poblacion East, E.B. Magalona, Negros Occidental",
    businessAddress: "Poblacion East, E.B. Magalona, Negros Occidental",
    lineOfBusiness: "Retail grocery store",
    businessActivity: "Retail trading",
    assetSize: "500000",
    totalEmployees: "4",
  });

  const foodRecord = await ensureBusinessRecord({
    applicantId: applicant.userId,
    registrationNumber: "SMOKE-REG-FOOD-001",
    tin: "900-000-001-002",
    businessType: "Sole Proprietorship",
    businessName: "Smoke Food Corner",
    tradeName: "Food Corner",
    ownerName: "Pedro Reyes",
    nationality: "Filipino",
    email: "applicant@example.com",
    phone: "09171230002",
    mainOfficeAddress: "San Jose, E.B. Magalona, Negros Occidental",
    businessAddress: "San Jose, E.B. Magalona, Negros Occidental",
    lineOfBusiness: "Restaurant and food service",
    businessActivity: "Food preparation",
    assetSize: "650000",
    totalEmployees: "6",
  });

  const paidRecord = await ensureBusinessRecord({
    applicantId: applicant.userId,
    registrationNumber: "SMOKE-REG-PAID-001",
    tin: "900-000-001-003",
    businessType: "Sole Proprietorship",
    businessName: "Smoke Permit Ready Trading",
    tradeName: "Permit Ready Trading",
    ownerName: "Juan dela Cruz",
    nationality: "Filipino",
    email: "applicant@example.com",
    phone: "09171230003",
    mainOfficeAddress: "Poblacion West, E.B. Magalona, Negros Occidental",
    businessAddress: "Poblacion West, E.B. Magalona, Negros Occidental",
    lineOfBusiness: "General merchandise retail",
    businessActivity: "Retail trading",
    assetSize: "450000",
    totalEmployees: "3",
  });

  const assessedRecord = await ensureBusinessRecord({
    applicantId: applicant.userId,
    registrationNumber: "SMOKE-REG-ASSESSED-001",
    tin: "900-000-001-004",
    businessType: "Sole Proprietorship",
    businessName: "Smoke Assessed Services",
    tradeName: "Assessed Services",
    ownerName: "Ana Gomez",
    nationality: "Filipino",
    email: "applicant@example.com",
    phone: "09171230004",
    mainOfficeAddress: "Gahit, E.B. Magalona, Negros Occidental",
    businessAddress: "Gahit, E.B. Magalona, Negros Occidental",
    lineOfBusiness: "Repair service shop",
    businessActivity: "Repair services",
    assetSize: "300000",
    totalEmployees: "2",
  });

  const blockedPermitRecord = await ensureBusinessRecord({
    applicantId: applicant.userId,
    registrationNumber: "SMOKE-REG-PERMIT-BLOCK-001",
    tin: "900-000-001-006",
    businessType: "Sole Proprietorship",
    businessName: "Smoke Permit Blocked Shop",
    tradeName: "Permit Blocked Shop",
    ownerName: "Carla Ramos",
    nationality: "Filipino",
    email: "applicant@example.com",
    phone: "09171230006",
    mainOfficeAddress: "Manta-angan, E.B. Magalona, Negros Occidental",
    businessAddress: "Manta-angan, E.B. Magalona, Negros Occidental",
    lineOfBusiness: "Retail convenience store",
    businessActivity: "Retail trading",
    assetSize: "280000",
    totalEmployees: "2",
  });

  const duplicateRecord = await ensureBusinessRecord({
    applicantId: duplicateApplicant.userId,
    registrationNumber: "SMOKE-REG-DUP-001",
    tin: "900-000-001-005",
    businessType: "Sole Proprietorship",
    businessName: "Smoke Duplicate Test Shop",
    tradeName: "Duplicate Test Shop",
    ownerName: "Liza Duplicate",
    nationality: "Filipino",
    email: "smoke.duplicate@example.com",
    phone: "09171230005",
    mainOfficeAddress: "Tabigue, E.B. Magalona, Negros Occidental",
    businessAddress: "Tabigue, E.B. Magalona, Negros Occidental",
    lineOfBusiness: "Retail store",
    businessActivity: "Retail trading",
    assetSize: "350000",
    totalEmployees: "2",
  });

  const releasedRetail = await ensureApplication({
    applicantId: applicant.userId,
    applicationNumber: "SMOKE-APP-RETAIL-RELEASED",
    applicationType: "NEW",
    status: "RELEASED",
    businessRecordId: retailRecord.businessRecordId,
    formData: buildFormData(retailRecord),
    submittedAt: new Date("2026-01-12T09:00:00.000Z"),
  });
  await ensureAssessment({
    applicationId: releasedRetail.businessApplicationId,
    assessmentNumber: "TOP-SMOKE-RETAIL-REL",
    paymentFrequency: "ANNUAL",
    annualAssessedAmount: 6000,
    amountPaid: 6000,
    computedById: bplo.userId,
    remarks: "Smoke retail released record for map filter testing.",
  });
  await ensurePaymentReference({
    applicationId: releasedRetail.businessApplicationId,
    transactionNumber: "SMOKE-OR-RETAIL-6000",
    amountPaid: 6000,
    paymentDate: new Date("2026-01-18T10:00:00.000Z"),
    status: "VERIFIED",
    proofFileName: "smoke-test-proof.txt",
    proofStoragePath: PROOF_FILE_PATH,
    proofMimeType: "text/plain",
    proofSizeBytes: 156,
    submittedAt: new Date("2026-01-18T10:05:00.000Z"),
    reviewerRemarks: "Smoke verified retail payment.",
    reviewedAt: new Date("2026-01-18T10:20:00.000Z"),
    reviewedById: bplo.userId,
  });
  await ensurePermitIssuance({
    applicationId: releasedRetail.businessApplicationId,
    documentNumber: "BP-SMOKE-RETAIL-001",
    documentType: "BUSINESS_PERMIT",
    status: "RELEASED",
    issuedAt: new Date("2026-01-20T08:30:00.000Z"),
    preparedById: bplo.userId,
    releasedAt: new Date("2026-01-20T09:00:00.000Z"),
    releasedById: bplo.userId,
    remarks: "Smoke released retail permit for map testing.",
  });
  await ensureBusinessLocation({
    businessRecordId: retailRecord.businessRecordId,
    latitude: 10.879421,
    longitude: 122.981332,
    address: "Poblacion East, E.B. Magalona, Negros Occidental",
    barangay: "Poblacion East",
    status: "VERIFIED",
    submittedById: applicant.userId,
    verifiedById: bplo.userId,
    remarks: "Smoke verified retail location.",
  });
  await resetReleasedSmokeRecord(releasedRetail.businessApplicationId, retailRecord.businessRecordId);

  const releasedFood = await ensureApplication({
    applicantId: applicant.userId,
    applicationNumber: "SMOKE-APP-FOOD-RELEASED",
    applicationType: "NEW",
    status: "RELEASED",
    businessRecordId: foodRecord.businessRecordId,
    formData: buildFormData(foodRecord),
    submittedAt: new Date("2026-01-13T09:00:00.000Z"),
  });
  await ensureAssessment({
    applicationId: releasedFood.businessApplicationId,
    assessmentNumber: "TOP-SMOKE-FOOD-REL",
    paymentFrequency: "ANNUAL",
    annualAssessedAmount: 6000,
    amountPaid: 6000,
    computedById: bplo.userId,
    remarks: "Smoke food released record for map filter testing.",
  });
  await ensurePaymentReference({
    applicationId: releasedFood.businessApplicationId,
    transactionNumber: "SMOKE-OR-FOOD-6000",
    amountPaid: 6000,
    paymentDate: new Date("2026-01-19T11:00:00.000Z"),
    status: "VERIFIED",
    proofFileName: "smoke-test-proof.txt",
    proofStoragePath: PROOF_FILE_PATH,
    proofMimeType: "text/plain",
    proofSizeBytes: 156,
    submittedAt: new Date("2026-01-19T11:05:00.000Z"),
    reviewerRemarks: "Smoke verified food payment.",
    reviewedAt: new Date("2026-01-19T11:20:00.000Z"),
    reviewedById: bplo.userId,
  });
  await ensurePermitIssuance({
    applicationId: releasedFood.businessApplicationId,
    documentNumber: "BP-SMOKE-FOOD-001",
    documentType: "BUSINESS_PERMIT",
    status: "RELEASED",
    issuedAt: new Date("2026-01-21T08:30:00.000Z"),
    preparedById: bplo.userId,
    releasedAt: new Date("2026-01-21T09:00:00.000Z"),
    releasedById: bplo.userId,
    remarks: "Smoke released food permit for map testing.",
  });
  await ensureBusinessLocation({
    businessRecordId: foodRecord.businessRecordId,
    latitude: 10.884112,
    longitude: 122.986741,
    address: "San Jose, E.B. Magalona, Negros Occidental",
    barangay: "San Jose",
    status: "VERIFIED",
    submittedById: applicant.userId,
    verifiedById: bplo.userId,
    remarks: "Smoke verified food location.",
  });
  await resetReleasedSmokeRecord(releasedFood.businessApplicationId, foodRecord.businessRecordId);

  const annualPaid = await ensureApplication({
    applicantId: applicant.userId,
    applicationNumber: "SMOKE-APP-NEW-ANNUAL-PAID",
    applicationType: "NEW",
    status: "PAID",
    businessRecordId: paidRecord.businessRecordId,
    formData: buildFormData(paidRecord),
    submittedAt: new Date("2026-02-10T09:00:00.000Z"),
  });
  await ensureAssessment({
    applicationId: annualPaid.businessApplicationId,
    assessmentNumber: "TOP-SMOKE-ANNUAL-PAID",
    paymentFrequency: "ANNUAL",
    annualAssessedAmount: 6000,
    amountPaid: 6000,
    computedById: bplo.userId,
    remarks: "Annual release amount smoke record for permit preparation.",
  });
  await ensurePaymentReference({
    applicationId: annualPaid.businessApplicationId,
    transactionNumber: "SMOKE-OR-ANNUAL-6000",
    amountPaid: 6000,
    paymentDate: new Date("2026-02-14T10:00:00.000Z"),
    status: "VERIFIED",
    proofFileName: "smoke-test-proof.txt",
    proofStoragePath: PROOF_FILE_PATH,
    proofMimeType: "text/plain",
    proofSizeBytes: 156,
    submittedAt: new Date("2026-02-14T10:05:00.000Z"),
    reviewerRemarks: "Verified for permit gating smoke test.",
    reviewedAt: new Date("2026-02-14T10:30:00.000Z"),
    reviewedById: bplo.userId,
  });

  const assessedApp = await ensureApplication({
    applicantId: applicant.userId,
    applicationNumber: "SMOKE-APP-NEW-ASSESSED",
    applicationType: "NEW",
    status: "ASSESSED",
    businessRecordId: assessedRecord.businessRecordId,
    formData: buildFormData(assessedRecord),
    submittedAt: new Date("2026-03-01T09:00:00.000Z"),
  });
  await ensureAssessment({
    applicationId: assessedApp.businessApplicationId,
    assessmentNumber: "TOP-SMOKE-ASSESSED-001",
    paymentFrequency: "ANNUAL",
    annualAssessedAmount: 6000,
    amountPaid: 0,
    computedById: bplo.userId,
    remarks: "Assessed-only record for Assessment & Fees page.",
  });

  const renewalApproved = await ensureApplication({
    applicantId: applicant.userId,
    applicationNumber: "SMOKE-APP-RENEWAL-BI-APPROVED",
    applicationType: "RENEWAL",
    status: "APPROVED_FOR_PAYMENT",
    businessRecordId: retailRecord.businessRecordId,
    formData: buildFormData(retailRecord),
    submittedAt: new Date("2026-03-10T09:00:00.000Z"),
  });
  await ensureAssessment({
    applicationId: renewalApproved.businessApplicationId,
    assessmentNumber: "TOP-SMOKE-BI-APPROVED",
    paymentFrequency: "BI_ANNUAL",
    annualAssessedAmount: 6000,
    amountPaid: 0,
    computedById: bplo.userId,
    remarks: "Bi-annual release amount smoke record with pending payment verification.",
  });
  await ensurePaymentReference({
    applicationId: renewalApproved.businessApplicationId,
    transactionNumber: "SMOKE-OR-RENEWAL-BI-3000",
    amountPaid: 3000,
    paymentDate: new Date("2026-03-12T13:00:00.000Z"),
    status: "PENDING",
    proofFileName: "smoke-test-proof.txt",
    proofStoragePath: PROOF_FILE_PATH,
    proofMimeType: "text/plain",
    proofSizeBytes: 156,
    submittedAt: new Date("2026-03-12T13:05:00.000Z"),
  });

  const closureApproved = await ensureApplication({
    applicantId: applicant.userId,
    applicationNumber: "SMOKE-APP-CLOSURE-QTR-APPROVED",
    applicationType: "CLOSURE",
    status: "APPROVED_FOR_PAYMENT",
    businessRecordId: foodRecord.businessRecordId,
    formData: buildFormData(foodRecord),
    submittedAt: new Date("2026-03-14T09:00:00.000Z"),
  });
  await ensureAssessment({
    applicationId: closureApproved.businessApplicationId,
    assessmentNumber: "TOP-SMOKE-QTR-APPROVED",
    paymentFrequency: "QUARTERLY",
    annualAssessedAmount: 6000,
    amountPaid: 0,
    computedById: bplo.userId,
    remarks: "Quarterly release amount smoke record for applicant payment submission.",
  });

  const permitBlocked = await ensureApplication({
    applicantId: applicant.userId,
    applicationNumber: "SMOKE-APP-PERMIT-BLOCKED-UNPAID",
    applicationType: "NEW",
    status: "APPROVED_FOR_PAYMENT",
    businessRecordId: blockedPermitRecord.businessRecordId,
    formData: buildFormData(blockedPermitRecord),
    submittedAt: new Date("2026-03-15T09:00:00.000Z"),
  });
  await ensureAssessment({
    applicationId: permitBlocked.businessApplicationId,
    assessmentNumber: "TOP-SMOKE-PERMIT-BLOCKED",
    paymentFrequency: "ANNUAL",
    annualAssessedAmount: 6000,
    amountPaid: 0,
    computedById: bplo.userId,
    remarks: "Dedicated blocked permit smoke record that must remain unpaid and unverified.",
  });

  const duplicateApproved = await ensureApplication({
    applicantId: duplicateApplicant.userId,
    applicationNumber: "SMOKE-APP-DUPLICATE-APPROVED",
    applicationType: "NEW",
    status: "APPROVED_FOR_PAYMENT",
    businessRecordId: duplicateRecord.businessRecordId,
    formData: buildFormData(duplicateRecord),
    submittedAt: new Date("2026-03-16T09:00:00.000Z"),
  });
  await ensureAssessment({
    applicationId: duplicateApproved.businessApplicationId,
    assessmentNumber: "TOP-SMOKE-DUP-APPROVED",
    paymentFrequency: "ANNUAL",
    annualAssessedAmount: 6000,
    amountPaid: 0,
    computedById: bplo.userId,
    remarks: "Secondary applicant record for duplicate OR browser testing.",
  });

  const applicantTransitions: Array<{
    applicationId: string;
    actorId: string;
    actorRole: Role;
    statuses: ApplicationStatus[];
  }> = [
    {
      applicationId: releasedRetail.businessApplicationId,
      actorId: bplo.userId,
      actorRole: "BPLO",
      statuses: ["SUBMITTED", "UNDER_REVIEW", "ASSESSED", "APPROVED_FOR_PAYMENT", "PAID", "FOR_RELEASE", "RELEASED"],
    },
    {
      applicationId: releasedFood.businessApplicationId,
      actorId: bplo.userId,
      actorRole: "BPLO",
      statuses: ["SUBMITTED", "UNDER_REVIEW", "ASSESSED", "APPROVED_FOR_PAYMENT", "PAID", "FOR_RELEASE", "RELEASED"],
    },
    {
      applicationId: annualPaid.businessApplicationId,
      actorId: bplo.userId,
      actorRole: "BPLO",
      statuses: ["SUBMITTED", "UNDER_REVIEW", "ASSESSED", "APPROVED_FOR_PAYMENT", "PAID"],
    },
    {
      applicationId: assessedApp.businessApplicationId,
      actorId: bplo.userId,
      actorRole: "BPLO",
      statuses: ["SUBMITTED", "UNDER_REVIEW", "ASSESSED"],
    },
    {
      applicationId: renewalApproved.businessApplicationId,
      actorId: bplo.userId,
      actorRole: "BPLO",
      statuses: ["SUBMITTED", "UNDER_REVIEW", "ASSESSED", "APPROVED_FOR_PAYMENT"],
    },
    {
      applicationId: closureApproved.businessApplicationId,
      actorId: bplo.userId,
      actorRole: "BPLO",
      statuses: ["SUBMITTED", "UNDER_REVIEW", "ASSESSED", "APPROVED_FOR_PAYMENT"],
    },
    {
      applicationId: permitBlocked.businessApplicationId,
      actorId: bplo.userId,
      actorRole: "BPLO",
      statuses: ["SUBMITTED", "UNDER_REVIEW", "ASSESSED", "APPROVED_FOR_PAYMENT"],
    },
    {
      applicationId: duplicateApproved.businessApplicationId,
      actorId: bplo.userId,
      actorRole: "BPLO",
      statuses: ["SUBMITTED", "UNDER_REVIEW", "ASSESSED", "APPROVED_FOR_PAYMENT"],
    },
  ];

  for (const transitionSet of applicantTransitions) {
    let fromStatus: ApplicationStatus | null = null;
    for (let index = 0; index < transitionSet.statuses.length; index += 1) {
      const toStatus = transitionSet.statuses[index];
      await ensureHistory(
        transitionSet.applicationId,
        transitionSet.actorId,
        transitionSet.actorRole,
        fromStatus,
        toStatus,
        new Date(Date.UTC(2026, 0, 10 + index, 9, index * 5)),
        `Smoke workflow transition to ${toStatus}.`
      );
      fromStatus = toStatus;
    }
  }

  await ensureHistory(
    renewalApproved.businessApplicationId,
    applicant.userId,
    "APPLICANT",
    "APPROVED_FOR_PAYMENT",
    "APPROVED_FOR_PAYMENT",
    new Date("2026-03-12T13:05:00.000Z"),
    "Applicant submitted payment reference: SMOKE-OR-RENEWAL-BI-3000, Amount: ₱3,000.00"
  );

  // ── Closed business for WB-DB-CLOSE-04 ──
  const closedRecord = await ensureBusinessRecord({
    applicantId: applicant.userId,
    registrationNumber: "SMOKE-REG-CLOSED-001",
    tin: "900-000-001-099",
    businessType: "Sole Proprietorship",
    businessName: "Smoke Closed Business",
    tradeName: "Closed Business",
    ownerName: "Juan dela Cruz",
    nationality: "Filipino",
    email: "applicant@example.com",
    phone: "09171230099",
    mainOfficeAddress: "Poblacion West, E.B. Magalona, Negros Occidental",
    businessAddress: "Poblacion West, E.B. Magalona, Negros Occidental",
    lineOfBusiness: "General merchandise retail",
    businessActivity: "Retail trading",
    assetSize: "100000",
    totalEmployees: "1",
  });
  await prisma.businessRecord.update({
    where: { businessRecordId: closedRecord.businessRecordId },
    data: { businessStatus: "CLOSED" },
  });

  // ── Phase 6 Debug Map records for VR-P6-* and WB-DB-MAP-04/05 ──
  const p6Seeds = [
    {
      reg: "DBG-P6-MAP-GRAY-BIZ",
      name: "[DEBUG-SEED] P6 Map Gray Business",
      owner: "Debug Owner Gray",
      appNum: "DBG-P6-MAP-GRAY-001",
      inspectionStatus: null,
      revocationSettledAt: null,
      active: true,
      lat: 10.878586,
      lng: 122.978876,
    },
    {
      reg: "DBG-P6-MAP-YELLOW-BIZ",
      name: "[DEBUG-SEED] P6 Map Yellow Business",
      owner: "Debug Owner Yellow",
      appNum: "DBG-P6-MAP-YELLOW-001",
      inspectionStatus: "DH_VERIFICATION_PENDING" as const,
      revocationSettledAt: null,
      active: true,
      lat: 10.879586,
      lng: 122.979876,
    },
    {
      reg: "DBG-P6-MAP-GREEN-BIZ",
      name: "[DEBUG-SEED] P6 Map Green Business",
      owner: "Debug Owner Green",
      appNum: "DBG-P6-MAP-GREEN-001",
      inspectionStatus: "VERIFIED_COMPLIANT" as const,
      revocationSettledAt: null,
      active: true,
      lat: 10.880586,
      lng: 122.980876,
    },
    {
      reg: "DBG-P6-MAP-RED-UNSETTLED-BIZ",
      name: "[DEBUG-SEED] P6 Map Red Unsettled Business",
      owner: "Debug Owner Red Unsettled",
      appNum: "DBG-P6-MAP-RED-UNSETTLED-001",
      inspectionStatus: "REVOKED" as const,
      revocationSettledAt: null,
      active: true,
      lat: 10.881586,
      lng: 122.981876,
    },
    {
      reg: "DBG-P6-MAP-RED-SETTLED-BIZ",
      name: "[DEBUG-SEED] P6 Map Red Settled Business",
      owner: "Debug Owner Red Settled",
      appNum: "DBG-P6-MAP-RED-SETTLED-001",
      inspectionStatus: "REVOKED" as const,
      revocationSettledAt: new Date("2026-05-16T09:00:00.000Z"),
      active: false,
      lat: 10.882586,
      lng: 122.982876,
    },
  ];

  for (let i = 0; i < p6Seeds.length; i++) {
    const s = p6Seeds[i];
    const rec = await ensureBusinessRecord({
      applicantId: applicant.userId,
      registrationNumber: s.reg,
      tin: `900-000-096-00${i + 1}`,
      businessType: "Sole Proprietorship",
      businessName: s.name,
      tradeName: `${s.name} Trade`,
      ownerName: s.owner,
      nationality: "Filipino",
      email: "applicant@example.com",
      phone: "0917123960" + (i + 1),
      mainOfficeAddress: "Purok 1, Barangay 1 (Pob.), Enrique B. Magalona, Negros Occidental",
      businessAddress: "Purok 1, Barangay 1 (Pob.), Enrique B. Magalona, Negros Occidental",
      lineOfBusiness: "Trading",
      businessActivity: "Phase 6 debug map record",
      assetSize: "500000",
      totalEmployees: "4",
    });

    if (!s.active) {
      await prisma.businessRecord.update({
        where: { businessRecordId: rec.businessRecordId },
        data: { businessStatus: "CLOSED" },
      });
    }

    const p6App = await ensureApplication({
      applicantId: applicant.userId,
      applicationNumber: s.appNum,
      applicationType: "NEW",
      status: "RELEASED",
      businessRecordId: rec.businessRecordId,
      formData: buildFormData(rec),
      submittedAt: new Date("2026-05-15T08:00:00.000Z"),
    });

    await ensurePermitIssuance({
      applicationId: p6App.businessApplicationId,
      documentNumber: `${s.appNum}-PERMIT`,
      documentType: "BUSINESS_PERMIT",
      status: "RELEASED",
      issuedAt: new Date("2026-05-16T08:00:00.000Z"),
      releasedAt: new Date("2026-05-16T09:00:00.000Z"),
      preparedById: bplo.userId,
      releasedById: bplo.userId,
      remarks: "[DEBUG-SEED][P6] Released permit for map verification",
    });

    await ensureBusinessLocation({
      businessRecordId: rec.businessRecordId,
      latitude: s.lat,
      longitude: s.lng,
      address: "Purok 1, Barangay 1 (Pob.), Enrique B. Magalona, Negros Occidental",
      barangay: "Barangay 1 (Pob.)",
      status: "VERIFIED",
      submittedById: applicant.userId,
      verifiedById: jit.userId,
      remarks: "[DEBUG-SEED][P6] Verified business location",
    });

    if (s.inspectionStatus) {
      await ensureInspection({
        businessRecordId: rec.businessRecordId,
        applicationId: p6App.businessApplicationId,
        inspectorId: jit.userId,
        complianceStatus: s.inspectionStatus === "VERIFIED_COMPLIANT" ? "COMPLIANT" : "NON_COMPLIANT",
        status: s.inspectionStatus,
        comment: `[DEBUG-SEED][P6] ${s.inspectionStatus} inspection`,
        decidedById: s.inspectionStatus === "REVOKED" ? deptHead.userId : null,
        revocationDecision: s.inspectionStatus === "REVOKED" ? "APPROVED" : null,
        revocationRemarks: s.inspectionStatus === "REVOKED" ? "[DEBUG-SEED][P6] Revoked for verification" : null,
        decidedAt: s.inspectionStatus === "REVOKED" ? new Date("2026-05-16T10:00:00.000Z") : null,
        revocationSettledAt: s.revocationSettledAt,
      });
    }
  }

  const summary = [
    {
      label: "annual_paid_prepare_permit",
      applicationId: annualPaid.businessApplicationId,
      applicationNumber: annualPaid.applicationNumber,
      businessName: paidRecord.businessName,
      ownerName: paidRecord.ownerName,
      status: "PAID",
      frequency: "ANNUAL",
      releasePaymentAmount: 6000,
      paymentReference: "SMOKE-OR-ANNUAL-6000",
    },
    {
      label: "bi_annual_pending_verification",
      applicationId: renewalApproved.businessApplicationId,
      applicationNumber: renewalApproved.applicationNumber,
      businessName: retailRecord.businessName,
      ownerName: retailRecord.ownerName,
      status: "APPROVED_FOR_PAYMENT",
      frequency: "BI_ANNUAL",
      releasePaymentAmount: 3000,
      paymentReference: "SMOKE-OR-RENEWAL-BI-3000",
    },
    {
      label: "quarterly_applicant_payment",
      applicationId: closureApproved.businessApplicationId,
      applicationNumber: closureApproved.applicationNumber,
      businessName: foodRecord.businessName,
      ownerName: foodRecord.ownerName,
      status: "APPROVED_FOR_PAYMENT",
      frequency: "QUARTERLY",
      releasePaymentAmount: 1500,
      paymentReference: null,
    },
    {
      label: "permit_blocked_unpaid",
      applicationId: permitBlocked.businessApplicationId,
      applicationNumber: permitBlocked.applicationNumber,
      businessName: blockedPermitRecord.businessName,
      ownerName: blockedPermitRecord.ownerName,
      frequency: "ANNUAL",
      expectedReleaseAmount: 6000,
      paymentReference: null,
    },
    {
      label: "assessed_queue_record",
      applicationId: assessedApp.businessApplicationId,
      applicationNumber: assessedApp.applicationNumber,
      businessName: assessedRecord.businessName,
      ownerName: assessedRecord.ownerName,
      status: "ASSESSED",
      frequency: "ANNUAL",
      releasePaymentAmount: 6000,
      paymentReference: null,
    },
    {
      label: "released_map_retail",
      applicationId: releasedRetail.businessApplicationId,
      applicationNumber: releasedRetail.applicationNumber,
      businessName: retailRecord.businessName,
      ownerName: retailRecord.ownerName,
      status: "RELEASED",
      frequency: "ANNUAL",
      releasePaymentAmount: 6000,
      paymentReference: "SMOKE-OR-RETAIL-6000",
    },
    {
      label: "released_map_food",
      applicationId: releasedFood.businessApplicationId,
      applicationNumber: releasedFood.applicationNumber,
      businessName: foodRecord.businessName,
      ownerName: foodRecord.ownerName,
      status: "RELEASED",
      frequency: "ANNUAL",
      releasePaymentAmount: 6000,
      paymentReference: "SMOKE-OR-FOOD-6000",
    },
    {
      label: "duplicate_or_secondary_applicant",
      applicationId: duplicateApproved.businessApplicationId,
      applicationNumber: duplicateApproved.applicationNumber,
      businessName: duplicateRecord.businessName,
      ownerName: duplicateRecord.ownerName,
      status: "APPROVED_FOR_PAYMENT",
      frequency: "ANNUAL",
      releasePaymentAmount: 6000,
      paymentReference: null,
    },
  ];

  console.log("[seed-smoke-test-data] accounts", {
    applicant: { email: applicant.email, password: PASSWORD },
    duplicateApplicant: { email: duplicateApplicant.email, password: PASSWORD },
    bplo: { email: bplo.email, password: PASSWORD },
    superadmin: { email: superadmin.email, password: PASSWORD },
  });

  console.log("[seed-smoke-test-data] summary");
  console.table(summary);

  console.log("[seed-smoke-test-data] duplicate_or_reference", {
    existingReference: "SMOKE-OR-RENEWAL-BI-3000",
    sourceApplicationNumber: renewalApproved.applicationNumber,
    duplicateAttemptAccount: duplicateApplicant.email,
    duplicateAttemptApplicationNumber: duplicateApproved.applicationNumber,
  });

  console.log("[seed-smoke-test-data] permit_gating", {
    blockedUnverifiedApplication: renewalApproved.applicationNumber,
    blockedReason: "APPROVED_FOR_PAYMENT with pending payment reference; not eligible for permit issuance queue",
    verifiedPaidApplication: annualPaid.applicationNumber,
    verifiedPaidReference: "SMOKE-OR-ANNUAL-6000",
  });

  console.log("[seed-smoke-test-data] map_filters", {
    retailOwner: retailRecord.ownerName,
    retailCategoryHint: "RETAIL",
    foodOwner: foodRecord.ownerName,
    foodCategoryHint: "FOOD",
  });

  console.log("[seed-smoke-test-data] proof_file", PROOF_FILE_PATH);
  console.log("[seed-smoke-test-data] complete");
}

main()
  .catch((error) => {
    console.error("[seed-smoke-test-data] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });