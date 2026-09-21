import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import {
  getDepartmentHeadInspectionChecklistForVerification,
  requireDepartmentHeadSession,
} from "@/lib/department-head-api";
import { formatChecklistItemsForReadOnlyApi } from "@/lib/jit-post-audit-checklist";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const session = await requireDepartmentHeadSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { inspectionId } = await params;
    const inspection = await getDepartmentHeadInspectionChecklistForVerification(inspectionId);
    const items = formatChecklistItemsForReadOnlyApi(inspection.checklistItems);

    return NextResponse.json({
      inspectionId: inspection.inspectionId,
      businessRecordId: inspection.businessRecordId,
      applicationId: inspection.applicationId,
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Inspection not found" ? 404 : 400;
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to load inspection checklist") },
      { status }
    );
  }
}
