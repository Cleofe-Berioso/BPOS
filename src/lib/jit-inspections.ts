import { listActivePermittedBusinessLocations, listActivePermittedBusinessLocationsPaginated, type BusinessLocationMapRow } from "@/lib/business-location";
import {
  getChecklistQuestionForDepartment,
  type ChecklistItemInput,
} from "@/lib/jit-post-audit-checklist";
import { getJitInspectionCycleStartedAt } from "@/lib/jit-settings";
import { prisma } from "@/lib/prisma";
import type { PaginatedResult } from "@/lib/pagination";

type ComplianceStatus = "PENDING_REVIEW" | "COMPLIANT" | "NON_COMPLIANT";
type InspectionStatus =
  | "COMPLIANT"
  | "NON_COMPLIANT"
  | "DH_VERIFICATION_PENDING"
  | "VERIFIED_COMPLIANT"
  | "VERIFIED_NON_COMPLIANT"
  | "REVOCATION_REVIEW"
  | "REVOCATION_DENIED"
  | "REVOKED";

interface EvidencePayload {
  fileName: string;
  storagePath: string;
  bucket?: string;
  mimeType: string;
  sizeBytes: number;
}

interface CreateInspectionInput {
  comment?: string;
  evidence?: EvidencePayload;
  checklist: ChecklistItemInput[];
}

export type JitMapMarkerStatus = "UNINSPECTED" | "PENDING_INSPECTION" | "COMPLIANT" | "REVOKED";

export type JitMapMarkerSettlementHints = {
  isSettled?: boolean | null;
  complianceCaseStatus?: string | null;
  revocationSettledAt?: Date | string | null;
};

export interface JitInspectableBusinessRow extends BusinessLocationMapRow {
  latestInspection: {
    complianceStatus: ComplianceStatus;
    status: InspectionStatus;
    createdAt: string;
  } | null;
}

/**
 * Maps inspection status to JIT map marker status.
 * - No inspection record = UNINSPECTED (gray)
 * - Pending verification/review states = PENDING_INSPECTION (yellow)
 * - VERIFIED_COMPLIANT = COMPLIANT (green)
 * - Settled compliance / revocation settlement = COMPLIANT (green)
 * - REVOKED (unsettled) = REVOKED (red)
 */
export function getJitMapMarkerStatus(
  inspectionStatus: string | null,
  settlement?: JitMapMarkerSettlementHints | null
): JitMapMarkerStatus {
  const isSettledCase =
    settlement?.isSettled === true ||
    settlement?.complianceCaseStatus === "SETTLED" ||
    Boolean(settlement?.revocationSettledAt);

  // Settlement restores map readiness: settled cases show as green even when the
  // inspection row still carries VERIFIED_NON_COMPLIANT / REVOKED for audit history.
  if (isSettledCase) {
    return "COMPLIANT";
  }

  if (!inspectionStatus) {
    return "UNINSPECTED";
  }

  if (
    inspectionStatus === "PENDING_REVIEW" ||
    inspectionStatus === "DH_VERIFICATION_PENDING" ||
    inspectionStatus === "NON_COMPLIANT" ||
    inspectionStatus === "VERIFIED_NON_COMPLIANT" ||
    inspectionStatus === "REVOCATION_REVIEW"
  ) {
    return "PENDING_INSPECTION";
  }

  if (inspectionStatus === "VERIFIED_COMPLIANT") {
    return "COMPLIANT";
  }

  if (inspectionStatus === "REVOKED") {
    return "REVOKED";
  }

  // Default to UNINSPECTED for other statuses
  return "UNINSPECTED";
}

/**
 * Gets the hex color for a JIT map marker status.
 */
export function getJitMapMarkerColor(status: JitMapMarkerStatus): string {
  switch (status) {
    case "UNINSPECTED":
      return "#9ca3af"; // gray
    case "PENDING_INSPECTION":
      return "#fbbf24"; // yellow
    case "COMPLIANT":
      return "#10b981"; // green
    case "REVOKED":
      return "#ef4444"; // red
    default:
      return "#9ca3af"; // gray
  }
}

export async function listJitInspectableBusinesses(): Promise<JitInspectableBusinessRow[]> {
  const rows = await listActivePermittedBusinessLocations();
  return attachLatestInspections(rows);
}

async function attachLatestInspections(rows: BusinessLocationMapRow[]): Promise<JitInspectableBusinessRow[]> {
  const businessRecordIds = rows.map((row) => row.businessRecordId);

  if (businessRecordIds.length === 0) {
    return [];
  }

  const cycleStartedAt = await getJitInspectionCycleStartedAt();
  const inspectionModel = (prisma as any).inspection;
  const inspections = await inspectionModel.findMany({
    where: {
      businessRecordId: {
        in: businessRecordIds,
      },
      ...(cycleStartedAt ? { createdAt: { gte: cycleStartedAt } } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      businessRecordId: true,
      complianceStatus: true,
      status: true,
      createdAt: true,
    },
  });

  const latestByRecord = new Map<string, (typeof inspections)[number]>();
  for (const row of inspections) {
    if (!latestByRecord.has(row.businessRecordId)) {
      latestByRecord.set(row.businessRecordId, row);
    }
  }

  return rows.map((row) => {
    const latest = latestByRecord.get(row.businessRecordId);

    return {
      ...row,
      latestInspection: latest
        ? {
            complianceStatus: latest.complianceStatus as ComplianceStatus,
            status: latest.status as InspectionStatus,
            createdAt: latest.createdAt.toISOString(),
          }
        : null,
    };
  });
}

export async function listJitInspectableBusinessesPaginated(options?: {
  search?: string;
  barangay?: string;
  page?: number | string;
  pageSize?: number | string;
}): Promise<PaginatedResult<JitInspectableBusinessRow>> {
  const locationResult = await listActivePermittedBusinessLocationsPaginated(
    { search: options?.search, barangay: options?.barangay },
    options
  );

  const records = await attachLatestInspections(locationResult.records);

  return {
    ...locationResult,
    records,
  };
}

export async function createJitInspection(
  businessRecordId: string,
  inspectorId: string,
  input: CreateInspectionInput
) {
  const trimmedComment = input.comment?.trim() ?? "";

  if (!trimmedComment) {
    throw new Error("General inspection remarks are required");
  }

  if (!input.checklist || input.checklist.length !== 8) {
    throw new Error("All 8 post-audit checklist responses are required");
  }

  const created = await prisma.$transaction(async (tx: any) => {
    const activeBusiness = await tx.businessRecord.findFirst({
      where: {
        businessRecordId,
        businessStatus: "ACTIVE",
      },
      select: {
        businessRecordId: true,
        applications: {
          where: {
            status: "RELEASED",
            applicationType: {
              in: ["NEW", "RENEWAL"],
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 1,
          select: {
            businessApplicationId: true,
            status: true,
          },
        },
      },
    });

    const releasedApplication = activeBusiness?.applications[0] ?? null;

    if (!activeBusiness || !releasedApplication) {
      throw new Error("Only active released businesses can be inspected");
    }

    const inspection = await tx.inspection.create({
      data: {
        businessRecordId,
        applicationId: releasedApplication.businessApplicationId,
        inspectorId,
        complianceStatus: "PENDING_REVIEW",
        status: "DH_VERIFICATION_PENDING",
        comment: trimmedComment || null,
        evidenceFileName: input.evidence?.fileName ?? null,
        evidenceStoragePath: input.evidence?.storagePath ?? null,
        evidenceBucket: input.evidence?.bucket ?? null,
        evidenceMimeType: input.evidence?.mimeType ?? null,
        evidenceSizeBytes: input.evidence?.sizeBytes ?? null,
        checklistItems: {
          create: input.checklist.map((item) => ({
            departmentKey: item.departmentKey,
            question: getChecklistQuestionForDepartment(item.departmentKey),
            response: item.response,
            remarks: item.remarks ?? null,
            evidenceFileName: item.evidence?.fileName ?? null,
            evidenceStoragePath: item.evidence?.storagePath ?? null,
            evidenceBucket: item.evidence?.bucket ?? null,
            evidenceMimeType: item.evidence?.mimeType ?? null,
            evidenceSizeBytes: item.evidence?.sizeBytes ?? null,
          })),
        },
      },
      select: {
        inspectionId: true,
        applicationId: true,
        complianceStatus: true,
        status: true,
        createdAt: true,
      },
    });

    await tx.applicationHistory.create({
      data: {
        applicationId: releasedApplication.businessApplicationId,
        actorId: inspectorId,
        actorRole: "JIT",
        fromStatus: "RELEASED",
        toStatus: "RELEASED",
        remarks: "JIT submitted inspection with post-audit checklist.",
      },
    });

    if (input.evidence) {
      await tx.applicationHistory.create({
        data: {
          applicationId: releasedApplication.businessApplicationId,
          actorId: inspectorId,
          actorRole: "JIT",
          fromStatus: "RELEASED",
          toStatus: "RELEASED",
          remarks: `JIT uploaded inspection evidence (${input.evidence.fileName}).`,
        },
      });
    }

    return inspection;
  });

  return {
    id: created.inspectionId,
    inspectionId: created.inspectionId,
    applicationId: created.applicationId,
    complianceStatus: created.complianceStatus as ComplianceStatus,
    status: created.status as "DH_VERIFICATION_PENDING",
    createdAt: created.createdAt.toISOString(),
  };
}
