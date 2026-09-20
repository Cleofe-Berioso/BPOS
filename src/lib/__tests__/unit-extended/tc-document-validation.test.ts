import { describe, it, expect } from "vitest";
import {
  DOCUMENT_VALIDATION_UI_STATUSES,
  mapDocumentValidationStatusToUi,
  mapDocumentValidationStatusToDb,
  remarksRequiredForValidationStatus,
  isDocumentApprovalReady,
  evaluateRequiredDocumentsValidation,
} from "@/lib/document-validation";

/**
 * Unit tests for document validation status mapping, idempotency, and readiness.
 * Placed under unit-extended to maintain the thesis 96-test whitebox count.
 */
describe("TC-DOCVAL — status mapping and idempotency", () => {
  it("TC-DOCVAL-01 maps DB statuses to UI statuses correctly", () => {
    expect(mapDocumentValidationStatusToUi("VALID")).toBe("Valid");
    expect(mapDocumentValidationStatusToUi("PENDING_REVIEW")).toBe("Pending Review");
    expect(mapDocumentValidationStatusToUi("INVALID")).toBe("Invalid");
    expect(mapDocumentValidationStatusToUi("INCOMPLETE")).toBe("Incomplete");
    expect(mapDocumentValidationStatusToUi("REQUIRES_RESUBMISSION")).toBe("Requires Resubmission");
  });

  it("TC-DOCVAL-02 is idempotent: preserves already formatted UI statuses without reverting to Pending Review", () => {
    expect(mapDocumentValidationStatusToUi("Valid")).toBe("Valid");
    expect(mapDocumentValidationStatusToUi("Pending Review")).toBe("Pending Review");
    expect(mapDocumentValidationStatusToUi("Invalid")).toBe("Invalid");
    expect(mapDocumentValidationStatusToUi("Incomplete")).toBe("Incomplete");
    expect(mapDocumentValidationStatusToUi("Requires Resubmission")).toBe("Requires Resubmission");
  });

  it("TC-DOCVAL-03 handles normalized or lowercase inputs gracefully", () => {
    expect(mapDocumentValidationStatusToUi("valid")).toBe("Valid");
    expect(mapDocumentValidationStatusToUi("pending_review")).toBe("Pending Review");
    expect(mapDocumentValidationStatusToUi("requires_resubmission")).toBe("Requires Resubmission");
    expect(mapDocumentValidationStatusToUi(null)).toBe("Pending Review");
    expect(mapDocumentValidationStatusToUi(undefined)).toBe("Pending Review");
    expect(mapDocumentValidationStatusToUi("")).toBe("Pending Review");
  });

  it("TC-DOCVAL-04 maps UI and DB statuses to DB enum correctly", () => {
    expect(mapDocumentValidationStatusToDb("Valid")).toBe("VALID");
    expect(mapDocumentValidationStatusToDb("VALID")).toBe("VALID");
    expect(mapDocumentValidationStatusToDb("Pending Review")).toBe("PENDING_REVIEW");
    expect(mapDocumentValidationStatusToDb("PENDING_REVIEW")).toBe("PENDING_REVIEW");
    expect(mapDocumentValidationStatusToDb("Invalid")).toBe("INVALID");
    expect(mapDocumentValidationStatusToDb("INVALID")).toBe("INVALID");
    expect(mapDocumentValidationStatusToDb("Incomplete")).toBe("INCOMPLETE");
    expect(mapDocumentValidationStatusToDb("INCOMPLETE")).toBe("INCOMPLETE");
    expect(mapDocumentValidationStatusToDb("Requires Resubmission")).toBe("REQUIRES_RESUBMISSION");
    expect(mapDocumentValidationStatusToDb("REQUIRES_RESUBMISSION")).toBe("REQUIRES_RESUBMISSION");
  });

  it("TC-DOCVAL-05 determines approval readiness correctly for both DB and UI values", () => {
    expect(isDocumentApprovalReady("VALID")).toBe(true);
    expect(isDocumentApprovalReady("Valid")).toBe(true);
    expect(isDocumentApprovalReady("PENDING_REVIEW")).toBe(false);
    expect(isDocumentApprovalReady("Pending Review")).toBe(false);
    expect(isDocumentApprovalReady("INVALID")).toBe(false);
    expect(isDocumentApprovalReady("Invalid")).toBe(false);
    expect(isDocumentApprovalReady(null)).toBe(false);
    expect(isDocumentApprovalReady(undefined)).toBe(false);
  });

  it("TC-DOCVAL-06 identifies when remarks are required", () => {
    expect(remarksRequiredForValidationStatus("Valid")).toBe(false);
    expect(remarksRequiredForValidationStatus("VALID")).toBe(false);
    expect(remarksRequiredForValidationStatus("Pending Review")).toBe(false);
    expect(remarksRequiredForValidationStatus("PENDING_REVIEW")).toBe(false);
    expect(remarksRequiredForValidationStatus("Invalid")).toBe(true);
    expect(remarksRequiredForValidationStatus("INVALID")).toBe(true);
    expect(remarksRequiredForValidationStatus("Incomplete")).toBe(true);
    expect(remarksRequiredForValidationStatus("INCOMPLETE")).toBe(true);
    expect(remarksRequiredForValidationStatus("Requires Resubmission")).toBe(true);
    expect(remarksRequiredForValidationStatus("REQUIRES_RESUBMISSION")).toBe(true);
  });

  it("TC-DOCVAL-07 correctly evaluates required documents validation when all are Valid", () => {
    const result = evaluateRequiredDocumentsValidation({
      applicationType: "CLOSURE",
      formData: {} as any,
      documents: [
        {
          documentName: "Closure Letter",
          validationStatus: "VALID",
        },
        {
          documentName: "Barangay Certification",
          validationStatus: "Valid",
        },
        {
          documentName: "Proof of Ceased Operation",
          validationStatus: "VALID",
        },
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.blockers.length).toBe(0);
  });

  it("TC-DOCVAL-08 detects blockers when a required document is Pending Review or Invalid", () => {
    const result = evaluateRequiredDocumentsValidation({
      applicationType: "CLOSURE",
      formData: {} as any,
      documents: [
        {
          documentName: "Closure Letter",
          validationStatus: "VALID",
        },
        {
          documentName: "Barangay Certification",
          validationStatus: "PENDING_REVIEW",
        },
        {
          documentName: "Proof of Ceased Operation",
          validationStatus: "INVALID",
          validationRemarks: "Blurry image",
        },
      ],
    });

    expect(result.ready).toBe(false);
    expect(result.blockers.length).toBe(2);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentName: "Barangay Certification",
          validationStatus: "Pending Review",
          reason: "not_valid",
        }),
        expect.objectContaining({
          documentName: "Proof of Ceased Operation",
          validationStatus: "Invalid",
          validationRemarks: "Blurry image",
          reason: "not_valid",
        }),
      ])
    );
  });
});
