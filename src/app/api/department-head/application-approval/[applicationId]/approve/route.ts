import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { applyDepartmentHeadAction, requireDepartmentHeadSession } from "@/lib/department-head-api";
import { logApplicationAction } from "@/lib/audit-log";

function applicationTypeLabel(value: "NEW" | "RENEWAL" | "CLOSURE"): "New" | "Renewal" | "Closure" {
  if (value === "NEW") return "New";
  if (value === "RENEWAL") return "Renewal";
  return "Closure";
}

interface RouteContext {
  params: Promise<{ applicationId: string }>;
}

export async function POST(_req: Request, context: RouteContext) {
  const session = await requireDepartmentHeadSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { applicationId } = await context.params;
    const application = await applyDepartmentHeadAction(
      applicationId,
      session.user.id,
      "APPROVE"
    );

    // Audit: Application approved by Department Head
    await logApplicationAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "DEPARTMENT_HEAD",
      applicationId,
      application.applicationNumber,
      "APPROVED",
      "DEPARTMENT_HEAD_REVIEW",
      application.status,
      `Department Head approved ${applicationTypeLabel(application.applicationType)} application`,
      {}
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
    return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to approve application") }, { status });
  }
}