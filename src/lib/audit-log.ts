import { prisma } from "@/lib/prisma";

/**
 * Audit Log Helper Library - Phase 1 Foundation
 * Non-blocking audit logging for system-wide actions
 *
 * Rules:
 * - All audit logging must be non-blocking
 * - If audit logging fails, it must not break the main workflow
 * - Wrap all audit writes in try/catch
 * - Use console.error for audit failures
 * - Do not throw audit errors into the main workflow
 * - Do not log passwords, tokens, secrets, private URLs
 * - Sanitize metadata before saving
 */

export interface AuditLogEntry {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  applicationId?: string | null;
  businessRecordId?: string | null;
  inspectionId?: string | null;
  paymentReferenceId?: string | null;
  documentId?: string | null;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Sensitive data patterns to sanitize from metadata
 */
const SENSITIVE_PATTERNS = /password|token|secret|apikey|key|authorization|bearer|auth|credential|private|sensitive/i;

/**
 * Sanitize metadata to remove sensitive data
 */
function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): unknown {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    // Skip sensitive keys
    if (SENSITIVE_PATTERNS.test(key)) {
      continue;
    }

    // Sanitize nested objects recursively
    if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Filter out sensitive array items
      sanitized[key] = value.filter((item) => {
        if (typeof item === "string") {
          return !SENSITIVE_PATTERNS.test(item);
        }
        return true;
      });
    } else if (typeof value === "string") {
      // Skip sensitive URLs and paths
      if (value.includes("secretkey") || value.includes("token") || value.includes("password")) {
        continue;
      }
      sanitized[key] = value;
    } else {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeQueryText(value?: string, maxLength = 100): string | undefined {
  if (!value) return undefined;

  const normalized = value.trim().replace(/\0/g, "");
  if (!normalized) return undefined;

  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

/**
 * Base audit log creation function
 * Non-blocking - errors are caught and logged, not thrown
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    // Sanitize metadata before saving
    const sanitizedMetadata = sanitizeMetadata(entry.metadata || null);

    await (prisma as any).auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorName: entry.actorName ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        module: entry.module,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        applicationId: entry.applicationId ?? null,
        businessRecordId: entry.businessRecordId ?? null,
        inspectionId: entry.inspectionId ?? null,
        paymentReferenceId: entry.paymentReferenceId ?? null,
        documentId: entry.documentId ?? null,
        beforeStatus: entry.beforeStatus ?? null,
        afterStatus: entry.afterStatus ?? null,
        description: entry.description ?? null,
        metadata: sanitizedMetadata as any,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (error) {
    // Non-blocking: Log error but don't throw
    console.error(
      "[AuditLog] Failed to create audit log entry:",
      error instanceof Error ? error.message : String(error),
      { action: entry.action, module: entry.module, entityType: entry.entityType }
    );
  }
}

/**
 * Log application status change
 */
export async function logApplicationAction(
  applicantId: string | null,
  applicantName: string | null,
  applicantRole: string | null,
  applicationId: string,
  applicationNumber: string,
  action: "SUBMITTED" | "REVIEWED" | "ASSESSED" | "APPROVED" | "REJECTED" | "RETURNED" | "PAID" | "RELEASED" | "REVOKED",
  beforeStatus: string | null,
  afterStatus: string,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return createAuditLog({
    actorId: applicantId,
    actorName: applicantName,
    actorRole: applicantRole,
    action,
    module: "APPLICATION",
    entityType: "APPLICATION",
    entityId: applicationNumber,
    applicationId,
    beforeStatus,
    afterStatus,
    description,
    metadata,
  });
}

/**
 * Log payment action
 */
export async function logPaymentAction(
  actorId: string | null,
  actorName: string | null,
  actorRole: string | null,
  paymentReferenceId: string,
  transactionNumber: string,
  applicationId: string,
  action: "SUBMITTED" | "REVIEWED" | "VERIFIED" | "REJECTED" | "REFUNDED",
  beforeStatus: string | null,
  afterStatus: string,
  amount?: number,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return createAuditLog({
    actorId,
    actorName,
    actorRole,
    action,
    module: "PAYMENT",
    entityType: "PAYMENT_REFERENCE",
    entityId: transactionNumber,
    applicationId,
    paymentReferenceId,
    beforeStatus,
    afterStatus,
    description: description || `Payment ${action.toLowerCase()}, Amount: PHP${amount || 0}`,
    metadata,
  });
}

/**
 * Log permit action
 */
export async function logPermitAction(
  actorId: string | null,
  actorName: string | null,
  actorRole: string | null,
  permitIssuanceId: string,
  documentNumber: string,
  applicationId: string,
  action: "PREPARED" | "APPROVED_FOR_RELEASE" | "RELEASED" | "VOIDED",
  beforeStatus: string | null,
  afterStatus: string,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return createAuditLog({
    actorId,
    actorName,
    actorRole,
    action,
    module: "PERMIT",
    entityType: "PERMIT_ISSUANCE",
    entityId: documentNumber,
    applicationId,
    beforeStatus,
    afterStatus,
    description,
    metadata,
  });
}

/**
 * Log inspection action
 */
export async function logInspectionAction(
  inspectorId: string | null,
  inspectorName: string | null,
  inspectorRole: string | null,
  inspectionId: string,
  businessRecordId: string,
  applicationId: string | null,
  action: "SUBMITTED" | "VERIFIED" | "ESCALATED" | "REVIEWED" | "COMPLETED",
  beforeStatus: string | null,
  afterStatus: string,
  complianceStatus?: "PENDING_REVIEW" | "COMPLIANT" | "NON_COMPLIANT",
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return createAuditLog({
    actorId: inspectorId,
    actorName: inspectorName,
    actorRole: inspectorRole,
    action,
    module: "INSPECTION",
    entityType: "INSPECTION",
    entityId: inspectionId,
    inspectionId,
    applicationId: applicationId ?? undefined,
    businessRecordId,
    beforeStatus,
    afterStatus,
    description: description || `Inspection ${action.toLowerCase()}, Compliance: ${complianceStatus || "UNKNOWN"}`,
    metadata,
  });
}

/**
 * Log business record revocation action
 */
export async function logRevocationAction(
  actorId: string | null,
  actorName: string | null,
  actorRole: string | null,
  businessRecordId: string,
  applicationId: string | null,
  action: "INITIATED" | "APPROVED" | "DENIED" | "COMPLETED",
  reason?: string,
  decision?: "APPROVED" | "DENIED",
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return createAuditLog({
    actorId,
    actorName,
    actorRole,
    action,
    module: "REVOCATION",
    entityType: "BUSINESS_RECORD",
    entityId: businessRecordId,
    businessRecordId,
    applicationId: applicationId ?? undefined,
    description: description || `Revocation ${action.toLowerCase()}: ${decision || reason || "No reason provided"}`,
    metadata,
  });
}

/**
 * Log user management action
 */
export async function logUserManagementAction(
  actorId: string | null,
  actorName: string | null,
  actorRole: string | null,
  userId: string,
  userEmail: string,
  action: "CREATED" | "ACTIVATED" | "DEACTIVATED" | "ROLE_CHANGED" | "PASSWORD_CHANGED" | "DELETED",
  beforeStatus?: string | null,
  afterStatus?: string | null,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return createAuditLog({
    actorId,
    actorName,
    actorRole,
    action,
    module: "USER_MANAGEMENT",
    entityType: "USER",
    entityId: userEmail,
    beforeStatus,
    afterStatus,
    description: description || `User ${action.toLowerCase()}: ${userEmail}`,
    metadata,
  });
}

/**
 * Log system settings modification
 */
export async function logSettingsAction(
  actorId: string | null,
  actorName: string | null,
  actorRole: string | null,
  settingType: "FEE_CONFIGURATION" | "FEE_CATEGORY" | "SYSTEM_FEE" | "RENEWAL_EXTENSION" | "OTHER",
  settingId: string,
  action: "CREATED" | "UPDATED" | "DELETED",
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return createAuditLog({
    actorId,
    actorName,
    actorRole,
    action,
    module: "SETTINGS",
    entityType: settingType,
    entityId: settingId,
    description: description || `${settingType} ${action.toLowerCase()}`,
    metadata,
  });
}

/**
 * Log document upload/download action
 */
export async function logDocumentAction(
  actorId: string | null,
  actorName: string | null,
  actorRole: string | null,
  documentId: string,
  documentName: string,
  applicationId: string,
  action: "UPLOADED" | "DOWNLOADED" | "DELETED" | "SHARED",
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return createAuditLog({
    actorId,
    actorName,
    actorRole,
    action,
    module: "DOCUMENT",
    entityType: "APPLICATION_DOCUMENT",
    entityId: documentName,
    documentId,
    applicationId,
    description: description || `Document ${action.toLowerCase()}: ${documentName}`,
    metadata,
  });
}

/**
 * Log SMS action
 */
export async function logSmsAction(
  systemActorId: string | null,
  systemActorName: string | null,
  applicantId: string,
  applicantName: string | null,
  applicationId: string,
  action: "SENT" | "FAILED" | "SKIPPED" | "RETRIED",
  phoneNumber?: string,
  provider?: string,
  status?: "SENT" | "FAILED" | "SKIPPED",
  description?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  return createAuditLog({
    actorId: systemActorId || applicantId,
    actorName: systemActorName || applicantName,
    actorRole: "SYSTEM",
    action,
    module: "SMS",
    entityType: "SMS_DELIVERY_LOG",
    entityId: phoneNumber ?? "UNKNOWN",
    applicationId,
    description: description || `SMS ${action.toLowerCase()}, Status: ${status || "UNKNOWN"}, Provider: ${provider || "UNKNOWN"}`,
    metadata: {
      ...(metadata || {}),
      phoneNumber,
      provider,
      status,
    },
  });
}

export interface AuditLogQueryFilters {
  actorId?: string;
  actorRole?: string;
  action?: string;
  module?: string;
  entityType?: string;
  applicationId?: string;
  applicationIds?: string[];
  applicationNumberSearch?: string;
  search?: string;
  searchApplicationIds?: string[];
  businessRecordId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface AuditLogListItem {
  auditLogId: string;
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  module: string;
  entityType: string;
  entityId: string | null;
  applicationId: string | null;
  businessRecordId: string | null;
  beforeStatus: string | null;
  afterStatus: string | null;
  description: string | null;
  createdAt: Date;
}

function buildAuditLogWhere(filters: AuditLogQueryFilters) {
  const andClauses: Array<Record<string, unknown>> = [];

  const actorId = sanitizeQueryText(filters.actorId, 100);
  if (actorId) {
    andClauses.push({ actorId });
  }

  const actorRole = sanitizeQueryText(filters.actorRole, 50);
  if (actorRole) {
    andClauses.push({ actorRole });
  }

  const action = sanitizeQueryText(filters.action, 80);
  if (action) {
    andClauses.push({ action });
  }

  const auditModule = sanitizeQueryText(filters.module, 80);
  if (auditModule) {
    andClauses.push({ module: auditModule });
  }

  const entityType = sanitizeQueryText(filters.entityType, 80);
  if (entityType) {
    andClauses.push({ entityType });
  }

  const applicationId = sanitizeQueryText(filters.applicationId, 100);
  if (applicationId) {
    andClauses.push({ applicationId });
  }

  const businessRecordId = sanitizeQueryText(filters.businessRecordId, 100);
  if (businessRecordId) {
    andClauses.push({ businessRecordId });
  }

  if (filters.applicationIds && filters.applicationIds.length > 0) {
    andClauses.push({ applicationId: { in: filters.applicationIds } });
  }

  const applicationNumberSearch = sanitizeQueryText(filters.applicationNumberSearch, 100);
  if (applicationNumberSearch) {
    const orClauses: Array<Record<string, unknown>> = [{ entityId: { contains: applicationNumberSearch } }];

    if (filters.applicationIds && filters.applicationIds.length > 0) {
      orClauses.push({ applicationId: { in: filters.applicationIds } });
    }

    andClauses.push({ OR: orClauses });
  }

  if (filters.startDate || filters.endDate) {
    const createdAt: Record<string, Date> = {};
    if (filters.startDate) {
      createdAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      createdAt.lte = filters.endDate;
    }
    andClauses.push({ createdAt });
  }

  const searchValue = sanitizeQueryText(filters.search, 120);
  if (searchValue) {
    const orClauses: Array<Record<string, unknown>> = [
      { actorName: { contains: searchValue } },
      { actorRole: { contains: searchValue } },
      { action: { contains: searchValue } },
      { module: { contains: searchValue } },
      { entityType: { contains: searchValue } },
      { entityId: { contains: searchValue } },
      { description: { contains: searchValue } },
    ];

    if (filters.searchApplicationIds && filters.searchApplicationIds.length > 0) {
      orClauses.push({ applicationId: { in: filters.searchApplicationIds } });
    }

    andClauses.push({ OR: orClauses });
  }

  if (andClauses.length === 0) {
    return {};
  }

  return { AND: andClauses };
}

/**
 * Retrieve audit logs (read-only, for System Admin only).
 * Sensitive fields like metadata, IP address, and user agent are intentionally omitted.
 */
export async function getAuditLogs(
  filters: AuditLogQueryFilters,
  skip: number = 0,
  take: number = 50
): Promise<{ logs: AuditLogListItem[]; total: number; skip: number; take: number; error?: string }> {
  try {
    const where = buildAuditLogWhere(filters);

    const [logs, total] = await Promise.all([
      (prisma as any).auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          auditLogId: true,
          actorId: true,
          actorName: true,
          actorRole: true,
          action: true,
          module: true,
          entityType: true,
          entityId: true,
          applicationId: true,
          businessRecordId: true,
          beforeStatus: true,
          afterStatus: true,
          description: true,
          createdAt: true,
        },
      }),
      (prisma as any).auditLog.count({ where }),
    ]);

    const mappedLogs: AuditLogListItem[] = logs.map((row: any) => ({
      ...row,
      auditLogId: row.auditLogId,
      id: row.auditLogId,
    }));

    return { logs: mappedLogs, total, skip, take };
  } catch (error) {
    console.error("[AuditLog] Failed to retrieve audit logs:", error instanceof Error ? error.message : String(error));
    return { logs: [], total: 0, skip, take, error: "Failed to retrieve audit logs" };
  }
}
