import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import {
  ApplicantEligibilityError,
  DuplicateBusinessIdentityError,
  listApplicantApplications,
  saveApplicantApplication,
  SubmitValidationError,
  isRecognizedEbMagalonaBarangay,
  resolveBusinessBarangaySelection,
} from "@/lib/applications";
import {
  APPLICANT_ACCOUNT_NOT_FOUND_MESSAGE,
  resolveApplicantSessionContext,
} from "@/lib/applicant-api";
import type { SaveApplicationInput } from "@/lib/applicant-types";
import { logApplicationAction } from "@/lib/audit-log";
import {
  buildDocumentMaxSizeError,
  DOCUMENT_UPLOAD_ERROR_MAX_SIZE,
  DOCUMENT_UPLOAD_ERROR_UNSUPPORTED_TYPE,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  validateDocumentFileUpload,
} from "@/lib/document-upload-rules";
import { Prisma } from "@prisma/client";

interface SubmitFileInput {
  documentName: string;
  file: File;
}

function hasUnsafeDocumentPayload(payload: SaveApplicationInput): boolean {
  if (!Array.isArray(payload.documents)) {
    return false;
  }

  return payload.documents.some((doc) => {
    const docRecord = doc as unknown as Record<string, unknown>;
    const values = Object.values(docRecord);
    const hasRawLikeField = ["file", "blob", "base64", "content", "preview", "dataUrl"].some(
      (key) => key in docRecord
    );

    if (hasRawLikeField) {
      return true;
    }

    if (typeof doc.sizeBytes === "number" && doc.sizeBytes > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      return true;
    }

    if (typeof doc.fileSize === "number" && doc.fileSize > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      return true;
    }

    return values.some(
      (value) =>
        typeof value === "string" &&
        (value.startsWith("data:") || (value.length > 10000 && value.toLowerCase().includes("base64")))
    );
  });
}

function logApplicantApi(event: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[ApplicantApplicationsAPI] ${event}`, data);
  }
}

function extractValidationFieldKey(message: string): string {
  return message.trim().split(/\s+/)[0] ?? message.trim();
}

export async function GET() {
  const authContext = await resolveApplicantSessionContext();
  if (authContext.ok === false) {
    return NextResponse.json({ error: authContext.error }, { status: authContext.status });
  }

  const rows = await listApplicantApplications(authContext.applicantId);
  if (process.env.NODE_ENV === "development") {
    console.info("[ApplicantApplicationsAPI] list-response-shape", {
      applicationsCount: rows.length,
      firstApplicationKeys: rows[0] ? Object.keys(rows[0]) : [],
    });
  }
  return NextResponse.json({ applications: rows });
}

export async function POST(req: Request) {
  let resolvedUserId: string | null = null;
  let resolvedMode: SaveApplicationInput["mode"] | null = null;
  let resolvedApplicationType: SaveApplicationInput["applicationType"] | null = null;
  let resolvedDocumentCount = 0;
  let dbWriteAttempted = false;

  try {
    const authContext = await resolveApplicantSessionContext();
    if (authContext.ok === false) {
      return NextResponse.json({ error: authContext.error }, { status: authContext.status });
    }

    const session = authContext.session;
    resolvedUserId = authContext.applicantId;

    let payload: SaveApplicationInput;
    let submitFiles: SubmitFileInput[] = [];
    const contentType = req.headers.get("content-type") ?? "";
    const parsePath = contentType.includes("multipart/form-data") ? "formData" : "json";

    logApplicantApi("parse-start", {
      contentType,
      parsePath,
    });

    try {
      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        const payloadRaw = formData.get("payload");

        if (typeof payloadRaw !== "string") {
          return NextResponse.json(
            { error: "Invalid request payload. Expected multipart form data with a JSON 'payload' field." },
            { status: 400 }
          );
        }

        payload = JSON.parse(payloadRaw) as SaveApplicationInput;

        const documentNames = formData
          .getAll("documentNames")
          .filter((value): value is string => typeof value === "string");
        const documentFiles = formData
          .getAll("documentFiles")
          .filter((value): value is File => value instanceof File);

        if (documentNames.length !== documentFiles.length) {
          return NextResponse.json({ error: "Invalid document upload metadata" }, { status: 400 });
        }

        submitFiles = documentFiles.map((file, index) => ({
          file,
          documentName: (documentNames[index] ?? "").trim(),
        }));
      } else {
        payload = (await req.json()) as SaveApplicationInput;
      }
    } catch (error) {
      const parseErrorMessage = error instanceof Error ? error.message : "Unknown parse error";
      logApplicantApi("parse-failed", {
        contentType,
        parsePath,
        errorName: error instanceof Error ? error.name : "UnknownError",
        error: parseErrorMessage,
      });

      const isMultipartRequestTooLarge =
        parsePath === "formData" &&
        /(request body exceeded|exceeded|10mb|too large|entity too large|aborted|econnreset|truncated)/i.test(
          parseErrorMessage
        );

      return NextResponse.json(
        {
          error: isMultipartRequestTooLarge
            ? "Upload failed because the combined uploaded documents exceeded the server request limit. Please compress the files or upload smaller copies."
            : "Invalid request payload. Ensure the request body is valid JSON or multipart form data.",
        },
        { status: 400 }
      );
    }

    logApplicantApi("parse-success", {
      contentType,
      parsePath,
    });

    resolvedMode = payload.mode;
    resolvedApplicationType = payload.applicationType;
    resolvedDocumentCount = Array.isArray(payload.documents) ? payload.documents.length : 0;

    if (process.env.NODE_ENV === "development") {
      const formDataKeys =
        payload.formData && typeof payload.formData === "object"
          ? Object.keys(payload.formData as unknown as Record<string, unknown>)
          : [];

      console.info("[ApplicantApplicationsAPI] submit-payload-shape", {
        payloadKeys: Object.keys(payload as unknown as Record<string, unknown>),
        applicationType: payload.applicationType,
        mode: payload.mode,
        formDataKeys,
        documentsCount: resolvedDocumentCount,
        hasApplicationId: typeof payload.applicationId === "string" && payload.applicationId.length > 0,
      });
    }

    if (!payload?.applicationType || !payload?.formData || !payload?.mode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (
      payload.mode === "SUBMIT" &&
      submitFiles.some((entry) => !entry.documentName || !(entry.file instanceof File))
    ) {
      return NextResponse.json({ error: "Invalid document upload metadata" }, { status: 400 });
    }

    for (const entry of submitFiles) {
      if (!entry.documentName || !(entry.file instanceof File)) {
        return NextResponse.json({ error: "Invalid document upload metadata" }, { status: 400 });
      }

      if (entry.file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: buildDocumentMaxSizeError(entry.file.name) }, { status: 400 });
      }

      const fileValidationError = validateDocumentFileUpload(entry.file);
      if (fileValidationError) {
        return NextResponse.json({ error: fileValidationError }, { status: 400 });
      }
    }

    if (hasUnsafeDocumentPayload(payload)) {
      const oversizedDocument = payload.documents?.some(
        (doc) =>
          (typeof doc.sizeBytes === "number" && doc.sizeBytes > MAX_DOCUMENT_FILE_SIZE_BYTES) ||
          (typeof doc.fileSize === "number" && doc.fileSize > MAX_DOCUMENT_FILE_SIZE_BYTES)
      );

      return NextResponse.json(
        { error: oversizedDocument ? DOCUMENT_UPLOAD_ERROR_MAX_SIZE : "Invalid document payload." },
        { status: 400 }
      );
    }

    if (!["NEW", "RENEWAL", "CLOSURE"].includes(payload.applicationType)) {
      return NextResponse.json({ error: "Invalid application type" }, { status: 400 });
    }

    if (!["DRAFT", "SUBMIT"].includes(payload.mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    logApplicantApi("request", {
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      mode: payload.mode,
      applicationType: payload.applicationType,
      applicationId: payload.applicationId ?? null,
      uploadedDocuments: resolvedDocumentCount,
      validationPassed: true,
    });

    try {
      dbWriteAttempted = true;
      const saved = await saveApplicantApplication(authContext.applicantId, payload, submitFiles);
      if (process.env.NODE_ENV === "development") {
        console.info("[ApplicantApplicationsAPI] save-response-shape", {
          applicationKeys: Object.keys(saved),
          hasApplicationNumber: typeof saved.applicationNumber === "string",
          hasStatus: typeof saved.status === "string",
        });
      }
      logApplicantApi("save-result", {
        mode: payload.mode,
        applicationType: payload.applicationType,
        createdApplicationId: saved.id,
        finalSavedStatus: saved.status,
      });
      logApplicantApi("success", {
        userId: session.user.id,
        userEmail: session.user.email ?? null,
        applicationId: saved.id,
        applicationNumber: saved.applicationNumber,
        status: saved.status,
        dateSubmitted: saved.dateSubmitted,
      });

      // Audit: Application submission
      if (payload.mode === "SUBMIT") {
        await logApplicationAction(
          authContext.applicantId,
          session.user.name ?? session.user.email ?? null,
          "APPLICANT",
          saved.id,
          saved.applicationNumber,
          "SUBMITTED",
          "DRAFT",
          saved.status,
          `${payload.applicationType} application submitted`,
          {
            applicationType: payload.applicationType,
            documentCount: submitFiles.length,
            closureType: payload.closureType ?? null,
            closureTypeOtherReason: payload.closureTypeOtherReason ?? null,
          }
        );
      }

      return NextResponse.json({ application: saved });
    } catch (error) {
      if (error instanceof SubmitValidationError) {
        const missingFieldKeys = error.detail.missingFields.map(extractValidationFieldKey);
        const submittedFormData =
          payload.formData && typeof payload.formData === "object"
            ? (payload.formData as unknown as Record<string, unknown>)
            : {};
        const rawBarangay = typeof submittedFormData.barangay === "string" ? submittedFormData.barangay.trim() : "";
        const rawBusinessBarangay =
          typeof submittedFormData.businessBarangay === "string" ? submittedFormData.businessBarangay.trim() : "";
        const canonicalBarangay = resolveBusinessBarangaySelection({
          barangay: rawBarangay,
          businessBarangay: rawBusinessBarangay,
          sameAsMainOffice: Boolean(submittedFormData.sameAsMainOffice),
          mainOfficeCountry:
            typeof submittedFormData.mainOfficeCountry === "string"
              ? submittedFormData.mainOfficeCountry.trim()
              : "",
          mainOfficeCountryCode:
            typeof submittedFormData.mainOfficeCountryCode === "string"
              ? submittedFormData.mainOfficeCountryCode.trim()
              : "",
          mainOfficeProvince:
            typeof submittedFormData.mainOfficeProvince === "string"
              ? submittedFormData.mainOfficeProvince.trim()
              : "",
          mainOfficeCityMunicipality:
            typeof submittedFormData.mainOfficeCityMunicipality === "string"
              ? submittedFormData.mainOfficeCityMunicipality.trim()
              : "",
          mainOfficeBarangay:
            typeof submittedFormData.mainOfficeBarangay === "string"
              ? submittedFormData.mainOfficeBarangay.trim()
              : "",
        });
        const barangayValidationState = canonicalBarangay.length === 0
          ? "missing"
          : isRecognizedEbMagalonaBarangay(canonicalBarangay)
            ? "valid"
            : "invalid";
        const fieldErrors = {
          ...(error.detail.fieldErrors ?? {}),
          ...Object.fromEntries(
            error.detail.missingFields.map((item) => {
              const key = item.split(" ")[0];
              return [key, item];
            })
          ),
        };

        if (typeof fieldErrors.barangay === "string" && typeof fieldErrors.businessBarangay !== "string") {
          fieldErrors.businessBarangay = fieldErrors.barangay;
        }

        if (process.env.NODE_ENV === "development") {
          const submittedNationality =
            typeof submittedFormData.nationality === "string" ? submittedFormData.nationality.trim() : "";
          console.info("[ApplicantApplicationsAPI] submit-validation-summary", {
            missingFieldsCount: error.detail.missingFields.length,
            missingDocumentsCount: error.detail.missingDocuments.length,
            missingFields: error.detail.missingFields,
            missingDocuments: error.detail.missingDocuments,
            missingFieldKeys,
            missingDocumentNames: error.detail.missingDocuments,
            fieldErrors,
            nationalityValidationResult: missingFieldKeys.includes("nationality") ? "missing" : "present",
            debugFieldValues: {
              nationality: submittedNationality || null,
              email: submittedFormData.email ?? null,
              assetSize: submittedFormData.assetSize ?? null,
              rawBarangay,
              rawBusinessBarangay,
              canonicalBarangay,
              barangayValidationState,
              cityValueUsedForValidation:
                typeof submittedFormData.cityMunicipality === "string"
                  ? submittedFormData.cityMunicipality.trim()
                  : null,
              totalEmployees: submittedFormData.totalEmployees ?? null,
            },
          });
        }

        return NextResponse.json(
          {
            error: "Application is incomplete. Complete all required fields and documents before submitting.",
            detail: error.detail,
            missingFieldKeys,
            fieldErrors,
            missingDocuments: error.detail.missingDocuments,
          },
          { status: 400 }
        );
      }

      if (error instanceof DuplicateBusinessIdentityError) {
        const fieldLabel =
          error.field === "registrationNumber" ? "Registration Number" : "TIN";
        return NextResponse.json(
          {
            error: "This already exist",
            duplicateField: error.field,
            message: `An application with this ${fieldLabel} already exists. Do not proceed with submission.`,
          },
          { status: 409 }
        );
      }

      if (error instanceof ApplicantEligibilityError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      const message = error instanceof Error ? error.message : "Unable to save application";
      const status =
        message === APPLICANT_ACCOUNT_NOT_FOUND_MESSAGE
          ? 401
          : message === "Application not found"
            ? 404
            : message === "This application has already been submitted and is now locked for review."
              ? 403
              : 400;

      logApplicantApi("error", {
        userId: session.user.id,
        userEmail: session.user.email ?? null,
        mode: payload.mode,
        applicationType: payload.applicationType,
        uploadedDocuments: resolvedDocumentCount,
        dbWriteAttempted,
        errorName: error instanceof Error ? error.name : "UnknownError",
        error: message,
        status,
      });
      return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to save application") }, { status });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";

    const isPrismaInitError = error instanceof Prisma.PrismaClientInitializationError;
    const isServiceUnavailable =
      isPrismaInitError ||
      /can't reach database server|database .* unavailable|connection.*refused|timed out/i.test(message);

    logApplicantApi("fatal", {
      userId: resolvedUserId,
      mode: resolvedMode,
      applicationType: resolvedApplicationType,
      uploadedDocuments: resolvedDocumentCount,
      dbWriteAttempted,
      errorName: error instanceof Error ? error.name : "UnknownError",
      error: message,
      status: isServiceUnavailable ? 503 : 500,
    });

    return NextResponse.json(
      {
        error: isServiceUnavailable
          ? "Application service is temporarily unavailable. Please try again in a few moments."
          : "Application submission failed. Please try again.",
      },
      { status: isServiceUnavailable ? 503 : 500 }
    );
  }
}
