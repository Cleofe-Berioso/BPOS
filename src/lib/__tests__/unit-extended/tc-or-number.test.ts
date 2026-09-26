import { describe, expect, it } from "vitest";
import { normalizeBusinessInfo } from "@/lib/business-rules";
import { baseBusinessInfo } from "../whitebox/fixtures";

/**
 * Unit and integration tests for OR Number:
 * - Entering & format preservation (e.g. OR-2026-00001)
 * - Creating a record
 * - Viewing a record
 * - Editing a record
 * - Verifying all three fields (Tax Declaration Number, Property Identification Number, OR Number)
 *   work correctly together.
 */
describe("TC-OR — OR Number implementation and multi-field cohesion", () => {
  const exampleTdn = "2026-18045-00001";
  const examplePin = "180-08-002-001-001";
  const exampleOr = "OR-2026-00001";

  it("TC-OR-01 preserves exact value and format of OR Number in normalizeBusinessInfo", () => {
    const info = baseBusinessInfo({
      propertyOwnership: "Owned",
      taxDeclarationNumber: exampleTdn,
      propertyIdentificationNumber: examplePin,
      orNumber: exampleOr,
    });

    const normalized = normalizeBusinessInfo(info);
    expect(normalized.orNumber).toBe("OR-2026-00001");
    expect(normalized.taxDeclarationNumber).toBe("2026-18045-00001");
    expect(normalized.propertyIdentificationNumber).toBe("180-08-002-001-001");
  });

  it("TC-OR-02 preserves alphanumeric formats and leading zeroes without distortion", () => {
    const rawInputs = [
      "OR-2026-00001",
      "2026-000456",
      "9876543210",
      "  OR-2026-00001  ",
    ];

    for (const raw of rawInputs) {
      const normalized = normalizeBusinessInfo(
        baseBusinessInfo({ orNumber: raw })
      );
      expect(normalized.orNumber).toBe(raw.trim());
      expect(normalized.orNumber).toMatch(/^OR-2026-00001|2026-000456|9876543210$/);
    }
  });

  it("TC-OR-03 handles empty or undefined OR Number gracefully", () => {
    const emptyNormalized = normalizeBusinessInfo(
      baseBusinessInfo({ orNumber: "" })
    );
    expect(emptyNormalized.orNumber).toBe("");

    const undefinedNormalized = normalizeBusinessInfo(
      baseBusinessInfo({ orNumber: undefined })
    );
    expect(undefinedNormalized.orNumber).toBe("");
  });

  it("TC-OR-04 creates a record storing all three fields (TDN, PIN, OR) simultaneously", () => {
    const createdInfo = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
        orNumber: exampleOr,
      })
    );

    const applicationRecord = {
      businessApplicationId: "app-tri-field-create",
      applicationNumber: "EBPLS-2026-0003",
      status: "DRAFT",
      formData: createdInfo,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(applicationRecord.formData.taxDeclarationNumber).toBe("2026-18045-00001");
    expect(applicationRecord.formData.propertyIdentificationNumber).toBe("180-08-002-001-001");
    expect(applicationRecord.formData.orNumber).toBe("OR-2026-00001");
  });

  it("TC-OR-05 views a record and correctly extracts all three fields for display", () => {
    const recordFormData = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
        orNumber: exampleOr,
      })
    );

    const readField = (formData: Record<string, any>, key: string) => {
      const val = formData[key];
      return typeof val === "string" && val.trim().length > 0 ? val.trim() : "-";
    };

    expect(readField(recordFormData, "taxDeclarationNumber")).toBe("2026-18045-00001");
    expect(readField(recordFormData, "propertyIdentificationNumber")).toBe("180-08-002-001-001");
    expect(readField(recordFormData, "orNumber")).toBe("OR-2026-00001");
  });

  it("TC-OR-06 edits a record by modifying OR Number while preserving TDN and PIN intact", () => {
    let currentInfo = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
        orNumber: exampleOr,
      })
    );

    const newOr = "OR-2026-00002";
    currentInfo = normalizeBusinessInfo({
      ...currentInfo,
      orNumber: newOr,
    });

    expect(currentInfo.orNumber).toBe("OR-2026-00002");
    expect(currentInfo.taxDeclarationNumber).toBe("2026-18045-00001");
    expect(currentInfo.propertyIdentificationNumber).toBe("180-08-002-001-001");
  });

  it("TC-OR-07 allows editing any combination of all three fields independently", () => {
    let currentInfo = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
        orNumber: exampleOr,
      })
    );

    // Update all three
    currentInfo = normalizeBusinessInfo({
      ...currentInfo,
      taxDeclarationNumber: "2026-99999-00001",
      propertyIdentificationNumber: "180-08-999-999-999",
      orNumber: "OR-2026-99999",
    });

    expect(currentInfo.taxDeclarationNumber).toBe("2026-99999-00001");
    expect(currentInfo.propertyIdentificationNumber).toBe("180-08-999-999-999");
    expect(currentInfo.orNumber).toBe("OR-2026-99999");
  });
});
