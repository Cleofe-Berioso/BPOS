import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { requireBploSession } from "@/lib/bplo-api";
import { logPermitAction } from "@/lib/audit-log";
import { preparePermitIssuance } from "@/lib/bplo-permit-issuance";

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
    const result = await preparePermitIssuance(
      applicationId,
      session.user.id,
      payload.remarks
    );

    // Audit: Permit prepared
    await logPermitAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "BPLO",
      result.documentNumber,
      result.documentNumber,
      result.applicationId,
      "PREPARED",
      "ASSESSED",
      result.status,
      `Permit prepared for issuance: ${result.documentType || "BUSINESS_PERMIT"}`,
      {}
    );

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Application not found" ? 404 : 422;
      return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to prepare permit issuance") }, { status });
  }
}
