import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { requireBploSession } from "@/lib/bplo-api";
import { approvePaymentReference } from "@/lib/bplo-payment-verification";
import { logPaymentAction } from "@/lib/audit-log";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ paymentReferenceId: string }> }
) {
  const session = await requireBploSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentReferenceId } = await params;

  let payload: { remarks?: string } = {};
  try {
    payload = (await req.json()) as { remarks?: string };
  } catch {
    payload = {};
  }

  try {
    const result = await approvePaymentReference(
      paymentReferenceId,
      session.user.id,
      payload.remarks
    );

    // Audit: Payment approved
    await logPaymentAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "BPLO",
      paymentReferenceId,
      result.applicationNumber,
      result.applicationId,
      "VERIFIED",
      result.previousPaymentStatus ?? "PENDING",
      "VERIFIED",
      result.totalAmountDue,
      `Payment approved`,
      { remarks: payload.remarks }
    );

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Payment reference not found" ? 404 : 422;
    return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to verify payment reference") }, { status });
  }
}
