import { prisma } from "@/lib/prisma";
import type { ApplicationType, BusinessInfo } from "@/lib/applicant-types";
import {
  evaluateRequiredDocumentsValidation,
  type RequiredDocumentsValidationResult,
} from "@/lib/document-validation";

export async function getRequiredDocumentsValidationForApplication(
  applicationId: string
): Promise<RequiredDocumentsValidationResult> {
  const application = await prisma.businessApplication.findUnique({
    where: { businessApplicationId: applicationId },
    select: {
      applicationType: true,
      formData: true,
      documents: {
        select: {
          documentName: true,
          validationStatus: true,
          validationRemarks: true,
        },
      },
    },
  });

  if (!application) {
    throw new Error("Application not found");
  }

  return evaluateRequiredDocumentsValidation({
    applicationType: application.applicationType as ApplicationType,
    formData: application.formData as unknown as BusinessInfo,
    documents: application.documents,
  });
}

export async function assertRequiredDocumentsReadyForApproval(applicationId: string): Promise<void> {
  const result = await getRequiredDocumentsValidationForApplication(applicationId);
  if (result.ready) return;

  const summary = result.blockers
    .map((blocker) => {
      if (blocker.reason === "missing") {
        return `${blocker.documentName} (missing upload)`;
      }
      return `${blocker.documentName} (${blocker.validationStatus})`;
    })
    .join("; ");

  throw new Error(
    `Required documents must be marked Valid before approval. Resolve: ${summary}`
  );
}
