import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { getJitInspectionChecklist } from "@/lib/jit-declared-inputs";
import { requireJitSession } from "@/lib/jit-api";
import { JIT_POST_AUDIT_CHECKLIST_ITEMS } from "@/lib/jit-post-audit-checklist";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const session = await requireJitSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { inspectionId } = await params;
    const inspection = await getJitInspectionChecklist(inspectionId);

    const items = inspection.checklistItems.map((item) => {
      const template = JIT_POST_AUDIT_CHECKLIST_ITEMS.find((entry) => entry.departmentKey === item.departmentKey);
      return {
        ...item,
        departmentLabel: template?.departmentLabel ?? item.departmentKey,
        responseLabel:
          item.response === "COMPLIANT"
            ? "Compliant"
            : item.response === "NON_COMPLIANT"
              ? "Non-Compliant"
              : "Not Applicable",
      };
    });

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
