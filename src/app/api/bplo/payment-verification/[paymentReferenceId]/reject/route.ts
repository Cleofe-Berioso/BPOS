import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { requireBploSession } from "@/lib/bplo-api";
import { rejectPaymentReference } from "@/lib/bplo-payment-verification";
import { logPaymentAction } from "@/lib/audit-log";

/** Reject a payment reference (sets payment reference status to REJECTED, app stays APPROVED_FOR_PAYMENT). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ paymentReferenceId: string }> }
) {
  const session = await requireBploSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentReferenceId } = await params;

  let payload: { remarks?: string };
  try {
    payload = (await req.json()) as { remarks?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload.remarks?.trim()) {
    return NextResponse.json(
      { error: "Remarks are required when rejecting a payment" },
      { status: 400 }
    );
  }

  try {
    const result = await rejectPaymentReference(
      paymentReferenceId,
      session.user.id,
      payload.remarks
    );

    await logPaymentAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "BPLO",
      paymentReferenceId,
      result.applicationNumber,
      result.applicationId,
      "REJECTED",
      "PENDING",
      "REJECTED",
      0,
      `Payment rejected: ${payload.remarks || "No remarks"}`,
      { remarks: payload.remarks, action: "REJECT" }
    );

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Payment reference not found" ? 404 : 422;
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to reject payment reference") },
      { status }
    );
  }
}
