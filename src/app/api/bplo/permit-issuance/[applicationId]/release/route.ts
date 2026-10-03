import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { requireBploSession } from "@/lib/bplo-api";
import { logPermitAction } from "@/lib/audit-log";
import { releasePermitIssuance } from "@/lib/bplo-permit-issuance";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const session = await requireBploSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { applicationId } = await params;

  let payload: { remarks?: string } = {};
  try {
    payload = (await req.json()) as { remarks?: string };
  } catch {
    payload = {};
  }

  try {
    const result = await releasePermitIssuance(
      applicationId,
      session.user.id,
      payload.remarks
    );

    // Audit: Permit released
    await logPermitAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "BPLO",
      result.documentNumber,
      result.documentNumber,
      result.applicationId,
      "RELEASED",
      "FOR_RELEASE",
      result.status,
      `Permit released`,
      {}
    );

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Application not found" ? 404 : 422;
      return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to release permit issuance") }, { status });
  }
}
