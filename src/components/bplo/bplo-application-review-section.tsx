"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApplicationType, BusinessInfo } from "@/lib/applicant-types";
import {
  evaluateRequiredDocumentsValidation,
  mapDocumentValidationStatusToDb,
} from "@/lib/document-validation";
import { SectionCard } from "@/components/ui/section-card";
import { BploReviewActions } from "@/components/bplo/bplo-review-actions";
import {
  BploDocumentPreviewList,
  type BploDocumentListItem,
} from "@/components/bplo/bplo-document-preview-list";

type BploApplicationReviewSectionProps = {
  applicationId: string;
  currentStatus: string;
  applicationType: ApplicationType;
  formData: BusinessInfo;
  documents: BploDocumentListItem[];
};

function buildApprovalBlockMessage(
  validation: ReturnType<typeof evaluateRequiredDocumentsValidation>
) {
  if (validation.ready) return undefined;
  return `Resolve required document validation first: ${validation.blockers
    .map((blocker) =>
      blocker.reason === "missing"
        ? `${blocker.documentName} (missing upload)`
        : `${blocker.documentName} (${blocker.validationStatus})`
    )
    .join("; ")}`;
}

export function BploApplicationReviewSection({
  applicationId,
  currentStatus,
  applicationType,
  formData,
  documents: initialDocuments,
}: BploApplicationReviewSectionProps) {
  const [documents, setDocuments] = useState(initialDocuments);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  const documentValidation = useMemo(
    () =>
      evaluateRequiredDocumentsValidation({
        applicationType,
        formData,
        documents: documents.map((doc) => ({
          documentName: doc.documentName,
          validationStatus: mapDocumentValidationStatusToDb(
            (doc.validationStatus ?? "Pending Review") as
              | "Pending Review"
              | "Valid"
              | "Invalid"
              | "Incomplete"
              | "Requires Resubmission"
          ),
          validationRemarks: doc.validationRemarks,
        })),
      }),
    [applicationType, documents, formData]
  );

  const approvalBlockMessage = buildApprovalBlockMessage(documentValidation);

  return (
    <>
      <BploReviewActions
        applicationId={applicationId}
        currentStatus={currentStatus}
        approvalBlocked={!documentValidation.ready}
        approvalBlockMessage={approvalBlockMessage}
      />

      <SectionCard title="Documents" description="Requirements attached by the applicant for BPLO review.">
        <BploDocumentPreviewList
          applicationId={applicationId}
          documents={documents}
          onDocumentsChange={setDocuments}
        />
      </SectionCard>
    </>
  );
}
