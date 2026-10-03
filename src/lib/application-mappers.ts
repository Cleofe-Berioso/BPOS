import type { ApplicationStatus as DbApplicationStatus } from "@prisma/client";
import type { ApplicationStatus } from "@/lib/applicant-types";

export const EDITABLE_APPLICATION_STATUSES: DbApplicationStatus[] = ["DRAFT", "RETURNED_FOR_CORRECTION"];

const dbToUiStatus: Record<DbApplicationStatus, ApplicationStatus> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  DEPARTMENT_HEAD_REVIEW: "Department Head Review",
  DEPARTMENT_HEAD_APPROVED: "Department Head Approved",
  ASSESSED: "Assessed",
  APPROVED_FOR_PAYMENT: "Approved for Payment",
  PAID: "Paid",
  FOR_RELEASE: "For Release",
  RELEASED: "Released",
  REVOCATION_REVIEW: "Revocation Review",
  REVOKED: "Revoked",
  RETURNED_FOR_CORRECTION: "Returned for Correction",
  REJECTED: "Rejected",
};

export function mapDbStatusToUi(status: DbApplicationStatus): ApplicationStatus {
  return dbToUiStatus[status];
}

export function isEditableStatus(status: DbApplicationStatus): boolean {
  return EDITABLE_APPLICATION_STATUSES.includes(status);
}

export function mapPaymentStatusToUi(status: string | null | undefined): string {
  if (!status) return "-";
  const upper = status.trim().toUpperCase();
  if (upper === "VERIFIED") return "Verified";
  if (upper === "RETURNED") return "Returned";
  if (upper === "REJECTED") return "Rejected";
  if (upper === "PENDING") return "Pending";
  return status;
}
