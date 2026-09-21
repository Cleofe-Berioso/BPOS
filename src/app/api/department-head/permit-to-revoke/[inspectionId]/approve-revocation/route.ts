import { NextResponse } from "next/server";
import { applyDepartmentHeadRevocationDecision, requireDepartmentHeadSession } from "@/lib/department-head-api";
import { logInspectionAction, logRevocationAction } from "@/lib/audit-log";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const session = await requireDepartmentHeadSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { inspectionId } = await params;

  let payload: { remarks?: string } = {};
  try {
    payload = (await req.json()) as { remarks?: string };
  } catch {
    payload = {};
  }

  try {
    const result = await applyDepartmentHeadRevocationDecision(
      inspectionId,
      session.user.id,
      "APPROVE",
      payload.remarks
    );

    // Audit: Flagged case reviewed
    void logInspectionAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "DEPARTMENT_HEAD",
      result.inspectionId,
      null,
      result.applicationId,
      "REVIEWED",
      "REVOCATION_REVIEW",
      "REVOCATION_REVIEW",
      "NON_COMPLIANT",
      "Department Head reviewed flagged case",
      { remarks: payload.remarks }
    );


    // Audit: Revocation approved
    void logRevocationAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "DEPARTMENT_HEAD",
      result.inspectionId,
      result.applicationId,
      "APPROVED",
      payload.remarks,
      "APPROVED",
      `Department Head approved revocation: ${payload.remarks || "No remarks"}`,
      { remarks: payload.remarks }
    );

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    // Determine HTTP status from the error message content
    const status =
      message.includes("not found") ? 404
        : message.includes("already been recorded") || message.includes("already marked as REVOKED")
          ? 409
          : message.includes("remarks are required") || message.includes("expected VERIFIED_NON_COMPLIANT")
            || message.includes("expected NON_COMPLIANT") || message.includes("expected REVOCATION_REVIEW")
            ? 422
            : message.includes("Unauthorized") ? 403
              : 500;

    // Always return the real error message so the Department Head knows exactly what failed
    const responseMessage = message || "Unable to approve revocation. Please contact the system administrator.";
    return NextResponse.json({ error: responseMessage }, { status });
  }
}
