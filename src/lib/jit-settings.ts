import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit-log";

/**
 * JIT Portal Settings & Compliance Enforcement - Phase 6
 *
 * Handles:
 * - Retrieving JIT portal enabled status
 * - Enforcing unresolved government-agency compliance cases when portal is disabled
 * - Converting FLAGGED_UNSETTLED cases to EXPIRED_UNSETTLED
 * - Resetting the active inspection map cycle so markers return to grey (uninspected)
 * - Tracking enforcement actions for audit purposes
 */

export interface JitPortalEnforcementResult {
  casesEnforced: number;
  affectedInspectionIds: string[];
  details: {
    inspectionId: string;
    businessRegistrationNumber: string;
    nonComplianceType: string;
    previousStatus: string;
    newStatus: string;
  }[];
}

export interface JitUninspectedSummary {
  uninspectedCount: number;
  totalInspectableCount: number;
}

/**
 * Get current JIT portal enabled status
 */
export async function getJitPortalEnabled(): Promise<boolean> {
  const setting = await prisma.systemFeeSetting.findFirst({
    select: { jitPortalEnabled: true },
    orderBy: { updatedAt: "desc" },
  });
  return setting?.jitPortalEnabled ?? true;
}

/**
 * Current inspection-cycle start. Inspections created before this timestamp
 * do not drive JIT map colors (they "disappear" from the active cycle).
 */
export async function getJitInspectionCycleStartedAt(): Promise<Date | null> {
  const setting = await prisma.systemFeeSetting.findFirst({
    select: { jitInspectionCycleStartedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return setting?.jitInspectionCycleStartedAt ?? null;
}

/**
 * Count ACTIVE permitted businesses (new/renewal) that have no inspection
 * in the current JIT inspection cycle.
 */
export async function countUninspectedActivePermittedBusinesses(): Promise<JitUninspectedSummary> {
  const cycleStartedAt = await getJitInspectionCycleStartedAt();

  const activeRecords = await prisma.businessRecord.findMany({
    where: {
      businessStatus: "ACTIVE",
      applications: {
        some: {
          applicationType: { in: ["NEW", "RENEWAL"] },
          status: { in: ["PAID", "FOR_RELEASE", "RELEASED"] },
        },
      },
      location: {
        is: {
          status: "VERIFIED",
        },
      },
    },
    select: { businessRecordId: true },
  });

  const totalInspectableCount = activeRecords.length;
  if (totalInspectableCount === 0) {
    return { uninspectedCount: 0, totalInspectableCount: 0 };
  }

  const ids = activeRecords.map((row) => row.businessRecordId);
  const inspected = await prisma.inspection.findMany({
    where: {
      businessRecordId: { in: ids },
      ...(cycleStartedAt ? { createdAt: { gte: cycleStartedAt } } : {}),
    },
    select: { businessRecordId: true },
    distinct: ["businessRecordId"],
  });

  const inspectedIds = new Set(inspected.map((row) => row.businessRecordId));
  const uninspectedCount = ids.filter((id) => !inspectedIds.has(id)).length;

  return { uninspectedCount, totalInspectableCount };
}

async function resetJitInspectionCycle(settingId: string): Promise<Date> {
  const startedAt = new Date();
  await prisma.systemFeeSetting.update({
    where: { systemFeeSettingId: settingId },
    data: { jitInspectionCycleStartedAt: startedAt },
  });
  return startedAt;
}

/**
 * Enforce unresolved government-agency compliance cases
 *
 * When disabling JIT portal:
 * - Find all FLAGGED_UNSETTLED government-agency-related cases
 * - Mark them as EXPIRED_UNSETTLED
 * - Set autoClosed = true
 * - Keep isSettled = false (not actually settled by applicant/department head)
 * - Keep forcedClosure = false (not a forced closure scenario)
 */
export async function enforceUnresolvedJitComplianceCases(): Promise<JitPortalEnforcementResult> {
  const casesToEnforce = await prisma.inspection.findMany({
    where: {
      nonComplianceType: "GOVERNMENT_AGENCY_RELATED",
      complianceCaseStatus: "FLAGGED_UNSETTLED",
      isSettled: false,
      forcedClosure: false,
    },
    select: {
      inspectionId: true,
      businessRecord: {
        select: {
          registrationNumber: true,
        },
      },
      nonComplianceType: true,
      complianceCaseStatus: true,
    },
  });

  if (casesToEnforce.length === 0) {
    return {
      casesEnforced: 0,
      affectedInspectionIds: [],
      details: [],
    };
  }

  const now = new Date();
  const details: JitPortalEnforcementResult["details"] = [];

  await prisma.$transaction(
    casesToEnforce.map((inspection) => {
      details.push({
        inspectionId: inspection.inspectionId,
        businessRegistrationNumber: inspection.businessRecord?.registrationNumber ?? "UNKNOWN",
        nonComplianceType: inspection.nonComplianceType,
        previousStatus: inspection.complianceCaseStatus,
        newStatus: "EXPIRED_UNSETTLED",
      });

      return prisma.inspection.update({
        where: { inspectionId: inspection.inspectionId },
        data: {
          complianceCaseStatus: "EXPIRED_UNSETTLED",
          autoClosed: true,
          deadlineAt: now,
        },
      });
    })
  );

  return {
    casesEnforced: casesToEnforce.length,
    affectedInspectionIds: casesToEnforce.map((i) => i.inspectionId),
    details,
  };
}

/**
 * Update JIT portal enabled status with enforcement + inspection-cycle reset.
 *
 * Disabling (true → false):
 * - Enforce unresolved FLAGGED_UNSETTLED government cases
 * - Start a new inspection cycle so previous map inspections disappear
 *
 * Enabling (false → true):
 * - Start a new inspection cycle so registered/renewed permits show grey (uninspected) again
 */
export async function updateJitPortalEnabled(input: {
  enabled: boolean;
  changedById: string;
  changedByName: string | null;
  changedByRole: string | null;
}): Promise<{
  success: boolean;
  newValue: boolean;
  enforcementResult?: JitPortalEnforcementResult;
  inspectionCycleStartedAt?: string;
  uninspectedAtDisable?: JitUninspectedSummary;
}> {
  const current = await getJitPortalEnabled();

  if (current === input.enabled) {
    return { success: true, newValue: current };
  }

  let enforcementResult: JitPortalEnforcementResult | undefined;
  let uninspectedAtDisable: JitUninspectedSummary | undefined;

  if (current === true && input.enabled === false) {
    uninspectedAtDisable = await countUninspectedActivePermittedBusinesses();
    enforcementResult = await enforceUnresolvedJitComplianceCases();
  }

  const setting = await prisma.systemFeeSetting.findFirst({
    select: { systemFeeSettingId: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!setting) {
    throw new Error("No system fee setting found");
  }

  // Reset active map cycle on both disable and enable so prior inspected markers clear
  // and re-enabled portals show registered/renewed permits as grey again.
  const cycleStartedAt = await resetJitInspectionCycle(setting.systemFeeSettingId);

  await prisma.systemFeeSetting.update({
    where: { systemFeeSettingId: setting.systemFeeSettingId },
    data: {
      jitPortalEnabled: input.enabled,
      updatedById: input.changedById,
    },
  });

  void createAuditLog({
    actorId: input.changedById,
    actorName: input.changedByName,
    actorRole: input.changedByRole,
    action: "JIT_PORTAL_SETTING_CHANGED",
    module: "SETTINGS",
    entityType: "JIT_PORTAL",
    description: `JIT Portal status changed from ${current ? "enabled" : "disabled"} to ${input.enabled ? "enabled" : "disabled"}`,
    metadata: {
      previousValue: current,
      newValue: input.enabled,
      enforcedCases: enforcementResult?.casesEnforced ?? 0,
      inspectionCycleStartedAt: cycleStartedAt.toISOString(),
      uninspectedAtDisable: uninspectedAtDisable ?? null,
    },
  });

  if (enforcementResult && enforcementResult.casesEnforced > 0) {
    void createAuditLog({
      actorId: input.changedById,
      actorName: input.changedByName,
      actorRole: input.changedByRole,
      action: "JIT_COMPLIANCE_ENFORCEMENT",
      module: "SETTINGS",
      entityType: "INSPECTION",
      description: `Enforced ${enforcementResult.casesEnforced} unresolved government-agency compliance cases to EXPIRED_UNSETTLED`,
      metadata: {
        totalCases: enforcementResult.casesEnforced,
        affectedInspectionIds: enforcementResult.affectedInspectionIds.slice(0, 100),
        details: enforcementResult.details.slice(0, 50),
      },
    });
  }

  return {
    success: true,
    newValue: input.enabled,
    enforcementResult,
    inspectionCycleStartedAt: cycleStartedAt.toISOString(),
    uninspectedAtDisable,
  };
}
