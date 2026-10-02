import { describe, expect, it } from "vitest";
import {
  evaluateRequiredDocumentsValidation,
  isDocumentApprovalReady,
  remarksRequiredForValidationStatus,
} from "@/lib/document-validation";
import { baseBusinessInfo } from "./fixtures";

describe("WB-DOCVAL — document validation rules", () => {
  it("WB-DOCVAL-01 remarks required for Invalid/Incomplete/Requires Resubmission", () => {
    expect(remarksRequiredForValidationStatus("INVALID")).toBe(true);
    expect(remarksRequiredForValidationStatus("INCOMPLETE")).toBe(true);
    expect(remarksRequiredForValidationStatus("REQUIRES_RESUBMISSION")).toBe(true);
    expect(remarksRequiredForValidationStatus("VALID")).toBe(false);
    expect(remarksRequiredForValidationStatus("PENDING_REVIEW")).toBe(false);
  });

  it("WB-DOCVAL-02 approval ready only when VALID", () => {
    expect(isDocumentApprovalReady("VALID")).toBe(true);
    expect(isDocumentApprovalReady("Valid")).toBe(true);
    expect(isDocumentApprovalReady("PENDING_REVIEW")).toBe(false);
    expect(isDocumentApprovalReady(null)).toBe(false);
  });

  it("WB-DOCVAL-03 evaluateRequiredDocumentsValidation blocks pending docs", () => {
    const formData = baseBusinessInfo({
      isMarket: false,
      isAgriculture: false,
      hasTaxIncentives: "NO",
    });
    const requiredProbe = evaluateRequiredDocumentsValidation({
      applicationType: "CLOSURE",
      formData,
      documents: [
        { documentName: "Closure Letter", validationStatus: "VALID", validationRemarks: null },
        { documentName: "Barangay Certification", validationStatus: "PENDING_REVIEW", validationRemarks: null },
        { documentName: "Proof of Ceased Operation", validationStatus: "VALID", validationRemarks: null },
      ],
    });
    expect(requiredProbe.ready).toBe(false);
    expect(requiredProbe.blockers.some((b) => /Barangay/i.test(b.documentName))).toBe(true);
  });

  it("WB-DOCVAL-04 all VALID closure docs → ready", () => {
    const result = evaluateRequiredDocumentsValidation({
      applicationType: "CLOSURE",
      formData: baseBusinessInfo(),
      documents: [
        { documentName: "Closure Letter", validationStatus: "VALID", validationRemarks: null },
        { documentName: "Barangay Certification", validationStatus: "VALID", validationRemarks: null },
        { documentName: "Proof of Ceased Operation", validationStatus: "VALID", validationRemarks: null },
      ],
    });
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("WB-DOCVAL-05 missing required document is a blocker", () => {
    const result = evaluateRequiredDocumentsValidation({
      applicationType: "CLOSURE",
      formData: baseBusinessInfo(),
      documents: [
        { documentName: "Closure Letter", validationStatus: "VALID", validationRemarks: null },
      ],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers.some((b) => b.reason === "missing")).toBe(true);
  });

  it("WB-DOCVAL-06 valid affidavit alternative satisfies clearance in evaluateRequiredDocumentsValidation", () => {
    // For NEW application, base documents include Location Plan / Sketch, Zoning Clearance, Sanitary Clearance, etc.
    const formData = baseBusinessInfo({
      businessType: "Sole Proprietorship",
      propertyOwnership: "Owned",
    });

    const result = evaluateRequiredDocumentsValidation({
      applicationType: "NEW",
      formData,
      documents: [
        { documentName: "Location Plan / Sketch", validationStatus: "VALID" },
        // Satisfied via Affidavit alternative
        { documentName: "Affidavit in lieu of Zoning Clearance", validationStatus: "VALID" },
        // Satisfied via Affidavit alternative
        { documentName: "Affidavit in lieu of Sanitary Clearance", validationStatus: "VALID" },
        { documentName: "Environment Clearance", validationStatus: "VALID" },
        { documentName: "Engineering Clearance/ Affidavit (Required)", validationStatus: "VALID" },
        { documentName: "BFP Clearance", validationStatus: "VALID" },
        { documentName: "Real Property Tax / RPT Clearance", validationStatus: "VALID" },
        { documentName: "Assessor's Office Clearance", validationStatus: "VALID" },
        { documentName: "WATER BILL/ Affidavit (Required)", validationStatus: "VALID" },
        { documentName: "DTI Certificate", validationStatus: "VALID" },
        {
          documentName: "Transfer Certificate of Title OR Tax Declaration (Certified True Copy, 1 copy)",
          validationStatus: "VALID",
        },
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("WB-DOCVAL-07 affidavit alternative with PENDING_REVIEW or INVALID is a blocker", () => {
    const formData = baseBusinessInfo({
      businessType: "Sole Proprietorship",
      propertyOwnership: "Owned",
    });

    const result = evaluateRequiredDocumentsValidation({
      applicationType: "NEW",
      formData,
      documents: [
        { documentName: "Location Plan / Sketch", validationStatus: "VALID" },
        {
          documentName: "Affidavit in lieu of Zoning Clearance",
          validationStatus: "PENDING_REVIEW",
        },
        {
          documentName: "Affidavit in lieu of Sanitary Clearance",
          validationStatus: "INVALID",
          validationRemarks: "Affidavit missing notary stamp",
        },
        { documentName: "Environment Clearance", validationStatus: "VALID" },
        { documentName: "Engineering Clearance/ Affidavit (Required)", validationStatus: "VALID" },
        { documentName: "BFP Clearance", validationStatus: "VALID" },
        { documentName: "Real Property Tax / RPT Clearance", validationStatus: "VALID" },
        { documentName: "Assessor's Office Clearance", validationStatus: "VALID" },
        { documentName: "WATER BILL/ Affidavit (Required)", validationStatus: "VALID" },
        { documentName: "DTI Certificate", validationStatus: "VALID" },
        {
          documentName: "Transfer Certificate of Title OR Tax Declaration (Certified True Copy, 1 copy)",
          validationStatus: "VALID",
        },
      ],
    });

    expect(result.ready).toBe(false);
    expect(result.blockers.length).toBe(2);
    expect(
      result.blockers.some(
        (b) => b.documentName === "Zoning Clearance" && b.validationStatus === "Pending Review"
      )
    ).toBe(true);
    expect(
      result.blockers.some(
        (b) =>
          b.documentName === "Sanitary Clearance" &&
          b.validationStatus === "Invalid" &&
          b.validationRemarks === "Affidavit missing notary stamp"
      )
    ).toBe(true);
  });
});

