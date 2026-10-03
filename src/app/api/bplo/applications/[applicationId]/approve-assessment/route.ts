import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { requireBploSession } from "@/lib/bplo-api";
import { applyBploReviewAction } from "@/lib/bplo-applications";
import { logApplicationAction } from "@/lib/audit-log";

interface RouteContext {
  params: Promise<{ applicationId: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  const session = await requireBploSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { remarks?: string } = {};
  try {
    payload = (await req.json()) as { remarks?: string };
  } catch {
    payload = {};
  }

  try {
    const { applicationId } = await context.params;
    const application = await applyBploReviewAction(
      applicationId,
      session.user.id,
      "APPROVE_FOR_ASSESSMENT",
      payload.remarks
    );
    
    // Audit: Assessment approved
    await logApplicationAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "BPLO",
      applicationId,
      application.applicationNumber,
      "APPROVED",
      "UNDER_REVIEW",
      application.status,
      "Assessment approved",
      { remarks: payload.remarks }
    );

    return NextResponse.json({ application });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Application not found" ? 404 : 400;
      return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to route application to Department Head review") }, { status });
  }
}
