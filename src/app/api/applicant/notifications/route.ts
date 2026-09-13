import { NextResponse } from "next/server";
import { resolveApplicantSessionContext } from "@/lib/applicant-api";
import { listApplicantNotifications } from "@/lib/applications";
import { safeApiErrorMessage } from "@/lib/api-errors";

export async function GET(req: Request) {
  const authContext = await resolveApplicantSessionContext();
  if (!authContext.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page") ?? undefined;
    const pageSize = searchParams.get("pageSize") ?? undefined;
    const hasPagination = page != null || pageSize != null;

    const result = hasPagination
      ? await listApplicantNotifications(authContext.applicantId, { page, pageSize })
      : await listApplicantNotifications(authContext.applicantId);

    // Support both the notifications page (`records`) and header hook (`notifications`).
    if (Array.isArray(result)) {
      return NextResponse.json({
        notifications: result,
        records: result,
        totalCount: result.length,
      });
    }

    return NextResponse.json({
      ...result,
      notifications: result.records,
    });
  } catch (error) {
    return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to load notifications") }, { status: 500 });
  }
}
