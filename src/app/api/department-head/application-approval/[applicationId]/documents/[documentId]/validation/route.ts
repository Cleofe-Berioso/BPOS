import { NextResponse } from "next/server";
import type { DocumentValidationStatus } from "@prisma/client";
import { safeApiErrorMessage } from "@/lib/api-errors";
import {
  requireDepartmentHeadSession,
  updateDepartmentHeadDocumentValidation,
} from "@/lib/department-head-api";
import { mapDocumentValidationStatusToDb } from "@/lib/document-validation";

interface RouteContext {
  params: Promise<{ applicationId: string; documentId: string }>;
}

export async function PATCH(req: Request, context: RouteContext) {
  const session = await requireDepartmentHeadSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { applicationId, documentId } = await context.params;
    const body = (await req.json()) as { status?: string; remarks?: string };

    let dbStatus: DocumentValidationStatus;
    try {
      if (!body.status) throw new Error("Missing status");
      dbStatus = mapDocumentValidationStatusToDb(body.status);
    } catch {
      return NextResponse.json({ error: "Invalid validation status" }, { status: 400 });
    }

    const document = await updateDepartmentHeadDocumentValidation(
      applicationId,
      documentId,
      session.user.id,
      {
        status: dbStatus,
        remarks: body.remarks,
      }
    );

    return NextResponse.json({ document });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status =
      message === "Application not found" || message === "Document not found"
        ? 404
        : message === "Application is not available for Department Head review" ||
            message === "Document does not belong to the requested application"
          ? 403
          : message === "Remarks are required for this validation status"
            ? 400
            : 400;
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to update document validation") },
      { status }
    );
  }
}
