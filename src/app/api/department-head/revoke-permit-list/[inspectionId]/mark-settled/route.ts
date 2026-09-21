import { NextRequest, NextResponse } from "next/server";
import { requireDepartmentHeadSession } from "@/lib/department-head-api";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit-log";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const session = await requireDepartmentHeadSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { inspectionId } = await params;
  const body = await req.json();
  const remarks = (body.remarks ?? "").trim();

  if (!remarks) {
    return NextResponse.json(
      { error: "Settlement remarks are required" },
      { status: 400 }
    );
  }

  try {
    const inspection = await prisma.inspection.findUnique({
      where: { inspectionId },
      select: {
        inspectionId: true,
        status: true,
        revocationSettledAt: true,
        businessRecordId: true,
        application: {
          select: {
            businessApplicationId: true,
            applicationNumber: true,
          },
        },
        businessRecord: {
          select: {
            businessRecordId: true,
            businessName: true,
          },
        },
      },
    });

    const settledAt = inspection?.revocationSettledAt ?? null;
    const application = inspection?.application ?? null;
    const businessRecord = inspection?.businessRecord ?? null;

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 }
      );
    }

    if (inspection.status !== "REVOKED") {
      return NextResponse.json(
        { error: "Only revoked inspections can be marked as settled" },
        { status: 400 }
      );
    }

    if (settledAt) {
      return NextResponse.json(
        { error: "This revoked permit is already marked as settled" },
        { status: 400 }
      );
    }

    // Update inspection to mark settlement
    await prisma.inspection.update({
      where: { inspectionId: inspection.inspectionId },
      data: {
        revocationSettledAt: new Date(),
        revocationSettlementRemarks: remarks,
        revocationSettledById: session.user.id,
      },
    });

    // Log audit event (non-blocking)
    try {
      await createAuditLog({
        actorId: session.user.id,
        actorName: session.user.name ?? null,
        actorRole: "DEPARTMENT_HEAD",
        action: "MARKED_REVOCATION_SETTLED",
        module: "REVOCATION",
        entityType: "INSPECTION",
        entityId: inspection.inspectionId,
        businessRecordId: inspection.businessRecordId,
        applicationId: application?.businessApplicationId ?? null,
        description: `Marked revocation as settled for business: ${businessRecord?.businessName ?? inspection.businessRecordId}`,
        metadata: {
          remarks,
          applicationNumber: application?.applicationNumber,
        },
      });
    } catch (error) {
      console.error("Audit log failed:", error);
      // Don't throw - audit logging is non-blocking
    }

    return NextResponse.json({ success: true, inspectionId: inspection.inspectionId });
  } catch (error) {
    console.error("Error marking revoked permit as settled:", error);
    return NextResponse.json(
      { error: "Unable to process settlement" },
      { status: 500 }
    );
  }
}
