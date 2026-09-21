import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { removeApplicantDocument, storeApplicantDocument } from "@/lib/document-storage";
import { requireJitSession } from "@/lib/jit-api";
import { createJitInspection } from "@/lib/jit-inspections";
import { parseChecklistPayload, type ChecklistItemInput } from "@/lib/jit-post-audit-checklist";
import { logInspectionAction } from "@/lib/audit-log";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ businessRecordId: string }> }
) {
  const session = await requireJitSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { businessRecordId } = await params;
  const formData = await req.formData();

  const commentRaw = formData.get("comment");
  const checklistRaw = formData.get("checklist");
  const evidence = formData.get("evidencePhoto");
  const referToBploRaw = formData.get("referToBplo");
  const referralReasonRaw = formData.get("referralReason");
  const referralRemarksRaw = formData.get("referralRemarks");

  const comment = typeof commentRaw === "string" ? commentRaw : undefined;
  const referToBplo = typeof referToBploRaw === "string" && referToBploRaw === "1";
  const referralReason = typeof referralReasonRaw === "string" ? referralReasonRaw : undefined;
  const referralRemarks = typeof referralRemarksRaw === "string" ? referralRemarksRaw : undefined;

  if (typeof checklistRaw !== "string" || checklistRaw.trim().length === 0) {
    return NextResponse.json({ error: "checklist is required" }, { status: 422 });
  }

  let checklist: ChecklistItemInput[];
  try {
    checklist = parseChecklistPayload(JSON.parse(checklistRaw));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid checklist payload";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  if (
    evidence instanceof File &&
    evidence.size > 0 &&
    !evidence.type.startsWith("image/") &&
    evidence.type !== "application/pdf"
  ) {
    return NextResponse.json({ error: "Photo evidence must be an image or PDF file" }, { status: 422 });
  }

  const storedEvidencePaths: string[] = [];
  const storedEvidenceMimeTypes: string[] = [];

  try {
    for (const item of checklist) {
      const evidenceField = formData.get(`checklistEvidence_${item.departmentKey}`);
      if (!(evidenceField instanceof File) || evidenceField.size === 0) {
        continue;
      }

      if (!evidenceField.type.startsWith("image/") && evidenceField.type !== "application/pdf") {
        throw new Error(`Checklist evidence for ${item.departmentKey} must be an image or PDF file`);
      }

      const stored = await storeApplicantDocument(evidenceField, {
        objectPrefix: `jit-checklist/${businessRecordId}/${item.departmentKey}`,
      });

      storedEvidencePaths.push(stored.storagePath);
      storedEvidenceMimeTypes.push(stored.mimeType);
      item.evidence = {
        fileName: stored.fileName,
        storagePath: stored.storagePath,
        bucket: stored.bucket,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
      };
    }

    const storedEvidence =
      evidence instanceof File && evidence.size > 0
        ? await storeApplicantDocument(evidence, {
            objectPrefix: `jit-inspections/${businessRecordId}/evidence`,
          })
        : null;

    if (storedEvidence) {
      storedEvidencePaths.push(storedEvidence.storagePath);
      storedEvidenceMimeTypes.push(storedEvidence.mimeType);
    }

    const inspection = await createJitInspection(businessRecordId, session.user.id, {
      comment,
      checklist,
      evidence: storedEvidence
        ? {
            fileName: storedEvidence.fileName,
            storagePath: storedEvidence.storagePath,
            bucket: storedEvidence.bucket,
            mimeType: storedEvidence.mimeType,
            sizeBytes: storedEvidence.sizeBytes,
          }
        : undefined,
    });

    const submittedDescription = "JIT submitted inspection (pending Department Head verification)";

    void logInspectionAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "JIT",
      inspection.inspectionId,
      businessRecordId,
      inspection.applicationId,
      "SUBMITTED",
      null,
      inspection.status,
      undefined,
      submittedDescription,
      { comment, hasEvidence: !!storedEvidence, checklistItemCount: checklist.length }
    );

    if (storedEvidence) {
      void logInspectionAction(
        session.user.id,
        session.user.name ?? session.user.email ?? null,
        "JIT",
        inspection.inspectionId,
        businessRecordId,
        inspection.applicationId,
        "REVIEWED",
        inspection.status,
        inspection.status,
        undefined,
        "JIT uploaded inspection evidence",
        { evidenceFileName: storedEvidence.fileName }
      );
    }

    return NextResponse.json({ inspection });
  } catch (error) {
    await Promise.all(
      storedEvidencePaths.map((storagePath, index) =>
        removeApplicantDocument(storagePath, storedEvidenceMimeTypes[index])
      )
    );

    const message = error instanceof Error ? error.message : "";
    const status =
      message === "Only active released businesses can be inspected"
        ? 404
        : message.includes("required") || message.includes("must be") || message.includes("checklist")
          ? 422
          : 400;
    return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to create inspection") }, { status });
  }
}
