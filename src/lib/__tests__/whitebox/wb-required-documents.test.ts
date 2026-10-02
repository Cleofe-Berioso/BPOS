import { describe, expect, it } from "vitest";
import {
  getMissingRequiredDocuments,
  normalizeDocumentName,
  resolveRequiredDocuments,
  resolveOptionalDocuments,
  isClearanceDocument,
  isDocumentSatisfyingRequirement,
} from "@/lib/required-documents";
import { baseBusinessInfo } from "./fixtures";

describe("WB-DOCS — required document resolution", () => {
  it("WB-DOCS-01 NEW sole + owned includes base + DTI + title docs", () => {
    const docs = resolveRequiredDocuments({
      applicationType: "NEW",
      formData: baseBusinessInfo(),
    });
    expect(docs).toEqual(expect.arrayContaining(["BFP Clearance", "DTI Certificate"]));
    expect(docs.some((d) => /Transfer Certificate of Title|Tax Declaration/i.test(d))).toBe(true);
    expect(docs).not.toContain("Market Clearance");
  });

  it("WB-DOCS-02 NEW corporation uses SEC Certificate", () => {
    const docs = resolveRequiredDocuments({
      applicationType: "NEW",
      formData: baseBusinessInfo({ businessType: "Corporation" }),
    });
    expect(docs).toContain("SEC Certificate");
    expect(docs).not.toContain("DTI Certificate");
  });

  it("WB-DOCS-03 conditional market/agri/tax incentive docs", () => {
    const docs = resolveRequiredDocuments({
      applicationType: "NEW",
      formData: baseBusinessInfo({
        isMarket: true,
        isAgriculture: true,
        hasTaxIncentives: "YES",
      }),
    });
    expect(docs).toEqual(
      expect.arrayContaining(["Market Clearance", "Agriculture Clearance", "Tax Incentive Certificate/Proof"])
    );
  });

  it("WB-DOCS-04 RENEWAL base set differs from NEW", () => {
    const renewal = resolveRequiredDocuments({
      applicationType: "RENEWAL",
      formData: baseBusinessInfo(),
    });
    expect(renewal).toEqual(
      expect.arrayContaining([
        "Sworn Declaration of Gross Sales / Income Tax Return",
        "BFP Clearance",
      ])
    );
    expect(renewal).not.toContain("DTI Certificate");
  });

  it("WB-DOCS-05 CLOSURE required set", () => {
    const closure = resolveRequiredDocuments({
      applicationType: "CLOSURE",
      formData: baseBusinessInfo(),
    });
    expect(closure).toEqual(
      expect.arrayContaining(["Closure Letter", "Barangay Certification", "Proof of Ceased Operation"])
    );
    expect(closure).toHaveLength(3);
  });

  it("WB-DOCS-06 missing required detection + alias normalize", () => {
    const required = resolveRequiredDocuments({
      applicationType: "NEW",
      formData: baseBusinessInfo(),
    });
    const missing = getMissingRequiredDocuments(required, ["Zoning Clearance"]);
    expect(missing.length).toBe(required.length - 1);
    expect(normalizeDocumentName("Fire Safety Clearance")).toBe("bfp clearance");
    expect(normalizeDocumentName("DTI Registration Certificate")).toBe("dti certificate");
  });

  it("WB-DOCS-07 not-owned property requires lease/MOA style doc", () => {
    const docs = resolveRequiredDocuments({
      applicationType: "NEW",
      formData: baseBusinessInfo({ propertyOwnership: "Not Owned" }),
    });
    expect(docs.some((d) => /Lease|MOA|Written Consent/i.test(d))).toBe(true);
  });

  it("WB-DOCS-08 WATER BILL/ Affidavit (Required) is in required list for NEW and RENEWAL", () => {
    const newDocs = resolveRequiredDocuments({
      applicationType: "NEW",
      formData: baseBusinessInfo(),
    });
    const renewalDocs = resolveRequiredDocuments({
      applicationType: "RENEWAL",
      formData: baseBusinessInfo(),
    });
    expect(newDocs).toContain("WATER BILL/ Affidavit (Required)");
    expect(renewalDocs).toContain("WATER BILL/ Affidavit (Required)");
  });

  it("WB-DOCS-09 required clearances remain required in NEW and RENEWAL", () => {
    const newDocs = resolveRequiredDocuments({
      applicationType: "NEW",
      formData: baseBusinessInfo(),
    });
    expect(newDocs).toEqual(
      expect.arrayContaining([
        "Zoning Clearance",
        "Sanitary Clearance",
        "Environment Clearance",
        "Engineering Clearance/ Affidavit (Required)",
        "BFP Clearance",
        "Real Property Tax / RPT Clearance",
        "Assessor's Office Clearance",
        "WATER BILL/ Affidavit (Required)",
      ])
    );

    const renewalDocs = resolveRequiredDocuments({
      applicationType: "RENEWAL",
      formData: baseBusinessInfo(),
    });
    expect(renewalDocs).toEqual(
      expect.arrayContaining([
        "Sanitary Office Clearance",
        "Environment Office Clearance",
        "Engineering Clearance/ Affidavit (Required)",
        "BFP Clearance",
        "RPT Clearance",
        "Assessor's Office Clearance",
        "WATER BILL/ Affidavit (Required)",
      ])
    );
  });

  it("WB-DOCS-10 clearance helper accurately distinguishes clearances from non-clearances", () => {
    expect(isClearanceDocument("Zoning Clearance")).toBe(true);
    expect(isClearanceDocument("Sanitary Clearance")).toBe(true);
    expect(isClearanceDocument("Sanitary Office Clearance")).toBe(true);
    expect(isClearanceDocument("BFP Clearance")).toBe(true);
    expect(isClearanceDocument("Environment Clearance")).toBe(true);
    expect(isClearanceDocument("Engineering Clearance/ Affidavit (Required)")).toBe(true);
    expect(isClearanceDocument("Real Property Tax / RPT Clearance")).toBe(true);
    expect(isClearanceDocument("Assessor's Office Clearance")).toBe(true);
    expect(isClearanceDocument("Market Clearance")).toBe(true);
    expect(isClearanceDocument("Agriculture Clearance")).toBe(true);

    expect(isClearanceDocument("Location Plan / Sketch")).toBe(false);
    expect(isClearanceDocument("DTI Certificate")).toBe(false);
    expect(isClearanceDocument("SEC Certificate")).toBe(false);
    expect(isClearanceDocument("CDA Certificate")).toBe(false);
    expect(isClearanceDocument("Audited Financial Statement OR Unaudited AFS if not required by BIR")).toBe(false);
    expect(isClearanceDocument("Sworn Declaration of Gross Sales / Income Tax Return")).toBe(false);
    expect(isClearanceDocument("Closure Letter")).toBe(false);
    expect(isClearanceDocument("Barangay Certification")).toBe(false);
    expect(isClearanceDocument("Proof of Ceased Operation")).toBe(false);
  });

  it("WB-DOCS-11 affidavit satisfies clearance but does NOT satisfy non-clearance", () => {
    // Satisfies clearance requirement
    expect(isDocumentSatisfyingRequirement("Zoning Clearance", "Affidavit in lieu of Zoning Clearance")).toBe(true);
    expect(isDocumentSatisfyingRequirement("Sanitary Clearance", "Affidavit in lieu of Sanitary Clearance")).toBe(true);
    expect(
      isDocumentSatisfyingRequirement("Sanitary Office Clearance", "Affidavit in lieu of Sanitary Clearance")
    ).toBe(true);
    expect(
      isDocumentSatisfyingRequirement("BFP Clearance", "Affidavit of Undertaking (BFP Clearance)")
    ).toBe(true);

    // Mismatched clearance does NOT satisfy
    expect(
      isDocumentSatisfyingRequirement("Zoning Clearance", "Affidavit in lieu of Sanitary Clearance")
    ).toBe(false);

    // Affidavit does NOT satisfy non-clearance requirement
    expect(
      isDocumentSatisfyingRequirement("Location Plan / Sketch", "Affidavit in lieu of Location Plan / Sketch")
    ).toBe(false);
    expect(
      isDocumentSatisfyingRequirement("DTI Certificate", "Affidavit in lieu of DTI Certificate")
    ).toBe(false);
    expect(
      isDocumentSatisfyingRequirement("Closure Letter", "Affidavit in lieu of Closure Letter")
    ).toBe(false);
  });

  it("WB-DOCS-12 missing required detection accepts either clearance or corresponding affidavit", () => {
    const required = ["Location Plan / Sketch", "Zoning Clearance", "Sanitary Clearance"];

    // Neither uploaded -> both clearances missing
    const missingNone = getMissingRequiredDocuments(required, ["Location Plan / Sketch"]);
    expect(missingNone).toEqual(["Zoning Clearance", "Sanitary Clearance"]);

    // Clearance uploaded -> satisfied
    const missingClearance = getMissingRequiredDocuments(required, [
      "Location Plan / Sketch",
      "Zoning Clearance",
    ]);
    expect(missingClearance).toEqual(["Sanitary Clearance"]);

    // Affidavit uploaded for Zoning Clearance -> satisfied
    const missingAffidavit = getMissingRequiredDocuments(required, [
      "Location Plan / Sketch",
      "Affidavit in lieu of Zoning Clearance",
    ]);
    expect(missingAffidavit).toEqual(["Sanitary Clearance"]);

    // Both clearances satisfied (one via clearance, one via affidavit)
    const missingBoth = getMissingRequiredDocuments(required, [
      "Location Plan / Sketch",
      "Zoning Clearance",
      "Affidavit in lieu of Sanitary Clearance",
    ]);
    expect(missingBoth).toEqual([]);
  });
});

