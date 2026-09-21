import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { applyDepartmentHeadInspectionVerification, requireDepartmentHeadSession } from "@/lib/department-head-api";
import { logInspectionAction } from "@/lib/audit-log";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const session = await requireDepartmentHeadSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { inspectionId } = await params;

  let payload: { remarks?: string; nonComplianceType?: string; violationSeverity?: string; complianceDecision?: string } = {};
  try {
    payload = (await req.json()) as { remarks?: string; nonComplianceType?: string; violationSeverity?: string; complianceDecision?: string };
  } catch {
    payload = {};
  }

  try {
    const result = await applyDepartmentHeadInspectionVerification(
      inspectionId,
      session.user.id,
      payload.remarks,
      payload.nonComplianceType,
      payload.violationSeverity,
      payload.complianceDecision
    );
    const isCompliant = result.complianceStatus === "COMPLIANT";
    const nextInspectionStatus = isCompliant ? "VERIFIED_COMPLIANT" : "VERIFIED_NON_COMPLIANT";
    const activityDescription = isCompliant
      ? "Department Head verified compliant inspection"
      : "Department Head verified non-compliant inspection";

    // Audit: Inspection verified
    void logInspectionAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "DEPARTMENT_HEAD",
      result.inspectionId,
      null,
      result.applicationId ?? null,
      "VERIFIED",
      "DH_VERIFICATION_PENDING",
      nextInspectionStatus,
      result.complianceStatus as any,
      `${activityDescription}. Remarks: ${payload.remarks || "No remarks"}`,
      {
        remarks: payload.remarks,
        complianceStatus: result.complianceStatus,
        nonComplianceType: result.nonComplianceType,
        violationSeverity: result.violationSeverity,
        complianceCaseStatus: result.complianceCaseStatus,
      }
    );

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status =
      message === "Inspection not found"
        ? 404
        : message.includes("required") || message.includes("pending") || message.includes("cannot") || message.includes("released") || message.includes("active")
          ? 422
          : 400;
    return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to verify inspection") }, { status });
  }
}