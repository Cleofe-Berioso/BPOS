import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApplicantSession } from "@/lib/applicant-api";
import { createAuditLog } from "@/lib/audit-log";
import { assertStatusTransition } from "@/lib/application-status";

export async function POST(_req: Request, context: { params: Promise<{ applicationId: string }> }) {
  const session = await requireApplicantSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { applicationId } = await context.params;

  const app = await prisma.businessApplication.findFirst({
    where: { businessApplicationId: applicationId, applicantId: session.user.id },
    include: { feeAssessment: true, paymentReferences: true },
  });

  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  if (!app.feeAssessment || app.feeAssessment.status !== "GENERATED") {
    return NextResponse.json({ error: "Tax Order of Payment is required before requesting reassessment" }, { status: 400 });
  }

  if (app.status !== "APPROVED_FOR_PAYMENT" && app.status !== "ASSESSED") {
    return NextResponse.json(
      { error: "Re-assessment can only be requested while waiting for payment review." },
      { status: 400 }
    );
  }

  // Do not allow if any payment submitted or verified
  const anySubmitted = (app.paymentReferences ?? []).length > 0;
  if (anySubmitted) {
    return NextResponse.json({ error: "Cannot request reassessment after payment has been submitted or verified" }, { status: 400 });
  }

  if (app.feeAssessment.reassessmentRequestedAt) {
    return NextResponse.json({ ok: true, message: "Re-assessment already requested" });
  }

  const now = new Date();
  await prisma.$transaction(async (tx: any) => {
    await tx.feeAssessment.update({
      where: { applicationId: app.businessApplicationId },
      data: {
        reassessmentRequestedAt: now,
        reassessmentRequestedById: session.user.id,
      },
    });

    if (app.status === "APPROVED_FOR_PAYMENT") {
      assertStatusTransition(app.status, "ASSESSED");
      await tx.businessApplication.update({
        where: { businessApplicationId: app.businessApplicationId },
        data: { status: "ASSESSED" },
      });
    }

    await tx.applicationHistory.create({
      data: {
        applicationId: app.businessApplicationId,
        actorId: session.user.id,
        actorRole: "APPLICANT",
        fromStatus: app.status,
        toStatus: app.status === "APPROVED_FOR_PAYMENT" ? "ASSESSED" : app.status,
        remarks: "Applicant requested reassessment for the generated TOP.",
      },
    });
  });

  // Non-blocking audit log
  void createAuditLog({
    actorId: session.user.id,
    actorName: session.user.name,
    actorRole: "APPLICANT",
    action: "REASSESSMENT_REQUESTED",
    module: "ASSESSMENT",
    entityType: "FEE_ASSESSMENT",
    entityId: app.feeAssessment.assessmentNumber ?? null,
    applicationId: app.businessApplicationId,
    description: "Applicant requested reassessment of TOP",
  });

  return NextResponse.json({
    ok: true,
    message: "Re-assessment request submitted. Your TOP is now pending BPLO revision.",
  });
}
