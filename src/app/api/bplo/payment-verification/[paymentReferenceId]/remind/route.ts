import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { requireBploSession } from "@/lib/bplo-api";
import { sendPaymentVerifiedEmail } from "@/lib/payment-notifications";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ paymentReferenceId: string }> }
) {
  const session = await requireBploSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentReferenceId } = await params;

  try {
    const ref = await (prisma as any).paymentReference.findUnique({
      where: { paymentReferenceId },
      select: {
        paymentReferenceId: true,
        status: true,
      },
    });

    if (!ref) {
      return NextResponse.json({ error: "Payment reference not found" }, { status: 404 });
    }

    if (ref.status !== "VERIFIED") {
      return NextResponse.json(
        { error: "Payment reminder can only be sent for VERIFIED payment references." },
        { status: 400 }
      );
    }

    const result = await sendPaymentVerifiedEmail(paymentReferenceId, session.user.id);

    if (!result.sent) {
      return NextResponse.json(
        {
          error: result.reason || "Failed to send email. Please check your Gmail SMTP configuration.",
          details: result,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      recipient: result.recipientEmail,
      messageId: result.messageId,
      message: `Gmail payment reminder sent successfully to ${result.recipientEmail}.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to send payment reminder email") },
      { status: 500 }
    );
  }
}
