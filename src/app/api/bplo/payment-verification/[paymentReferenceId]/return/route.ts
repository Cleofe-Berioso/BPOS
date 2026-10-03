import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { requireBploSession } from "@/lib/bplo-api";
import { returnPaymentReferenceForCorrection } from "@/lib/bplo-payment-verification";
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

  let payload: { remarks?: string };
  try {
    payload = (await req.json()) as { remarks?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload.remarks?.trim()) {
    return NextResponse.json(
      { error: "Remarks are required when returning a payment for correction" },
      { status: 400 }
    );
  }

  try {
    const result = await returnPaymentReferenceForCorrection(
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
      "RETURNED",
      "PENDING",
      "RETURNED",
      0,
      `Payment returned for correction: ${payload.remarks || "No remarks"}`,
      { remarks: payload.remarks, action: "RETURN_FOR_CORRECTION" }
    );

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Payment reference not found" ? 404 : 422;
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to return payment reference for correction") },
      { status }
    );
  }
}
