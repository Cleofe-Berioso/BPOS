const CLOSURE_COMPLETED_STATUS = "RELEASED";

const CLOSURE_TRIGGER_STATUSES = new Set([
  "FORCED_CLOSURE_PENDING",
  "EXPIRED_UNSETTLED",
  "CLOSED_NON_COMPLIANT",
]);

const CLOSURE_UPDATABLE_STATUSES = new Set([
  "FORCED_CLOSURE_PENDING",
  "EXPIRED_UNSETTLED",
]);

type ClosureCompletionStatus = "RELEASED";

type InspectionTransition = {
  id: string;
  previousComplianceCaseStatus: string;
  nextComplianceCaseStatus: "CLOSED_NON_COMPLIANT";
};

export type ComplianceRelatedClosureResult = {
  applied: boolean;
  reason:
    | "NOT_CLOSURE_APPLICATION"
    | "NOT_COMPLETION_POINT"
    | "NOT_COMPLIANCE_RELATED"
    | "NO_RELATED_COMPLIANCE_CASE"
    | "FINALIZED";
  closureType: string | null;
  businessRecordId: string | null;
  previousBusinessStatus: string | null;
  newBusinessStatus: "CLOSED" | null;
  affectedInspections: InspectionTransition[];
};

function buildComplianceClosureRemarks(input: {
  closureType: string | null;
  previousBusinessStatus: string;
  affectedInspections: InspectionTransition[];
}) {
  const inspectionSummary =
    input.affectedInspections.length > 0
      ? input.affectedInspections
          .map(
            (inspection) =>
              `${inspection.id}: ${inspection.previousComplianceCaseStatus} -> ${inspection.nextComplianceCaseStatus}`
          )
          .join("; ")
      : "None";

  return [
    "Compliance-related closure completed. Business marked CLOSED after approved Closure Application.",
    `closureType=${input.closureType ?? "-"}`,
    `businessStatus=${input.previousBusinessStatus} -> CLOSED`,
    `affectedInspections=${inspectionSummary}`,
  ].join(" | ");
}

export async function finalizeComplianceRelatedClosure(
  tx: any,
  input: {
    closureApplicationId: string;
    actingUserId: string;
    completionStatus?: ClosureCompletionStatus;
  }
): Promise<ComplianceRelatedClosureResult> {
  const completionStatus = input.completionStatus ?? CLOSURE_COMPLETED_STATUS;

  const application = await tx.businessApplication.findUnique({
    where: { businessApplicationId: input.closureApplicationId },
    select: {
      businessApplicationId: true,
      status: true,
      applicationType: true,
      closureType: true,
      businessRecordId: true,
      businessRecord: {
        select: {
          businessRecordId: true,
          businessStatus: true,
          inspections: {
            where: { nonComplianceType: "GOVERNMENT_AGENCY_RELATED" },
            select: {
              inspectionId: true,
              complianceCaseStatus: true,
              forcedClosure: true,
              isSettled: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!application) {
    throw new Error("Closure application not found");
  }

  if (application.applicationType !== "CLOSURE") {
    return {
      applied: false,
      reason: "NOT_CLOSURE_APPLICATION",
      closureType: application.closureType,
      businessRecordId: application.businessRecordId,
      previousBusinessStatus: application.businessRecord?.businessStatus ?? null,
      newBusinessStatus: null,
      affectedInspections: [],
    };
  }

  if (application.status !== completionStatus) {
    return {
      applied: false,
      reason: "NOT_COMPLETION_POINT",
      closureType: application.closureType,
      businessRecordId: application.businessRecordId,
      previousBusinessStatus: application.businessRecord?.businessStatus ?? null,
      newBusinessStatus: null,
      affectedInspections: [],
    };
  }

  if (application.closureType !== "NON_COMPLIANT_RELATED") {
    return {
      applied: false,
      reason: "NOT_COMPLIANCE_RELATED",
      closureType: application.closureType,
      businessRecordId: application.businessRecordId,
      previousBusinessStatus: application.businessRecord?.businessStatus ?? null,
      newBusinessStatus: null,
      affectedInspections: [],
    };
  }

  if (!application.businessRecordId || !application.businessRecord) {
    throw new Error("Compliance-related closure requires a linked business record");
  }

  const hasRelatedComplianceCase = application.businessRecord.inspections.some(
    (inspection: { complianceCaseStatus: string; forcedClosure: boolean }) =>
      inspection.forcedClosure || CLOSURE_TRIGGER_STATUSES.has(inspection.complianceCaseStatus)
  );

  if (!hasRelatedComplianceCase) {
    return {
      applied: false,
      reason: "NO_RELATED_COMPLIANCE_CASE",
      closureType: application.closureType,
      businessRecordId: application.businessRecordId,
      previousBusinessStatus: application.businessRecord.businessStatus,
      newBusinessStatus: null,
      affectedInspections: [],
    };
  }

  const previousBusinessStatus = application.businessRecord.businessStatus;
  const affectedInspections: InspectionTransition[] = application.businessRecord.inspections
    .filter((inspection: { complianceCaseStatus: string }) =>
      CLOSURE_UPDATABLE_STATUSES.has(inspection.complianceCaseStatus)
    )
    .map((inspection: { inspectionId: string; complianceCaseStatus: string }) => ({
      id: inspection.inspectionId,
      previousComplianceCaseStatus: inspection.complianceCaseStatus,
      nextComplianceCaseStatus: "CLOSED_NON_COMPLIANT",
    }));

  await tx.businessRecord.update({
    where: { businessRecordId: application.businessRecordId },
    data: {
      businessStatus: "CLOSED",
      closedAt: new Date(),
      closureApplicationId: application.businessApplicationId,
    },
  });

  if (affectedInspections.length > 0) {
    await tx.inspection.updateMany({
      where: {
        inspectionId: { in: affectedInspections.map((inspection) => inspection.id) },
      },
      data: {
        complianceCaseStatus: "CLOSED_NON_COMPLIANT",
        autoClosed: true,
        isSettled: false,
      },
    });
  }

  await tx.applicationHistory.create({
    data: {
      applicationId: application.id,
      actorId: input.actingUserId,
      actorRole: "BPLO",
      fromStatus: completionStatus,
      toStatus: completionStatus,
      remarks: buildComplianceClosureRemarks({
        closureType: application.closureType,
        previousBusinessStatus,
        affectedInspections,
      }),
    },
  });

  return {
    applied: true,
    reason: "FINALIZED",
    closureType: application.closureType,
    businessRecordId: application.businessRecordId,
    previousBusinessStatus,
    newBusinessStatus: "CLOSED",
    affectedInspections,
  };
}
