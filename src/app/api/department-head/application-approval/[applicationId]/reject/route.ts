import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { applyDepartmentHeadAction, requireDepartmentHeadSession } from "@/lib/department-head-api";
import { logApplicationAction } from "@/lib/audit-log";

interface RouteContext {
  params: Promise<{ applicationId: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  const session = await requireDepartmentHeadSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { remarks?: string };
  try {
    payload = (await req.json()) as { remarks?: string };
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const { applicationId } = await context.params;
    const application = await applyDepartmentHeadAction(
      applicationId,
      session.user.id,
      "REJECT",
      payload.remarks
    );

    // Audit: Application rejected by Department Head
    await logApplicationAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "DEPARTMENT_HEAD",
      applicationId,
      application.applicationNumber,
      "REJECTED",
      "DEPARTMENT_HEAD_REVIEW",
      application.status,
      `Department Head rejected application: ${payload.remarks || "No reason"}`,
      { remarks: payload.remarks }
    );

    return NextResponse.json({ application });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status =
      message === "Application not found"
        ? 404
        : message === "Application is not in Department Head review stage"
          ? 409
          : 400;
    return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to reject application") }, { status });
  }
}