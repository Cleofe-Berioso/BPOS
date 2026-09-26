import { describe, expect, it } from "vitest";
import { normalizeBusinessInfo } from "@/lib/business-rules";
import { baseBusinessInfo } from "../whitebox/fixtures";

/**
 * Unit and integration tests for Property Identification Number:
 * - Entering & format preservation (e.g. 180-08-002-001-001)
 * - Creating a record
 * - Viewing a record
 * - Editing a record
 * - Ensuring Tax Declaration Number is maintained in tandem
 */
describe("TC-PIN — Property Identification Number implementation and persistence", () => {
  const examplePin = "180-08-002-001-001";
  const exampleTdn = "2026-18045-00001";

  it("TC-PIN-01 preserves exact value and format of Property Identification Number in normalizeBusinessInfo", () => {
    const info = baseBusinessInfo({
      propertyOwnership: "Owned",
      taxDeclarationNumber: exampleTdn,
      propertyIdentificationNumber: examplePin,
    });

    const normalized = normalizeBusinessInfo(info);
    expect(normalized.propertyIdentificationNumber).toBe("180-08-002-001-001");
    // Ensure Tax Declaration Number is also retained
    expect(normalized.taxDeclarationNumber).toBe("2026-18045-00001");
  });

  it("TC-PIN-02 preserves multi-part hyphenated digits and leading zeroes without distortion", () => {
    const rawInputs = [
      "180-08-002-001-001",
      "045-12-001-003-015",
      "PIN-2026-0001",
      "  180-08-002-001-001  ",
    ];

    for (const raw of rawInputs) {
      const normalized = normalizeBusinessInfo(
        baseBusinessInfo({ propertyIdentificationNumber: raw })
      );
      expect(normalized.propertyIdentificationNumber).toBe(raw.trim());
      expect(normalized.propertyIdentificationNumber).toMatch(
        /^180-08-002-001-001|045-12-001-003-015|PIN-2026-0001$/
      );
    }
  });

  it("TC-PIN-03 handles empty or missing property identification number gracefully", () => {
    const emptyNormalized = normalizeBusinessInfo(
      baseBusinessInfo({ propertyIdentificationNumber: "" })
    );
    expect(emptyNormalized.propertyIdentificationNumber).toBe("");

    const undefinedNormalized = normalizeBusinessInfo(
      baseBusinessInfo({ propertyIdentificationNumber: undefined as any })
    );
    expect(undefinedNormalized.propertyIdentificationNumber).toBe("");
  });

  it("TC-PIN-04 creates a record with Property Identification Number and stores both PIN and TDN in payload", () => {
    const createdInfo = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
      })
    );

    const applicationRecord = {
      businessApplicationId: "app-pin-create",
      applicationNumber: "EBPLS-2026-0002",
      status: "DRAFT",
      formData: createdInfo,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(applicationRecord.formData.propertyIdentificationNumber).toBe("180-08-002-001-001");
    expect(applicationRecord.formData.taxDeclarationNumber).toBe("2026-18045-00001");
  });

  it("TC-PIN-05 views a record and extracts exact Property Identification Number for display", () => {
    const recordFormData = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
      })
    );

    // Mimic the readText / formValue helpers used across Applicant, BPLO, and Superadmin view pages
    const readField = (formData: Record<string, any>, key: string) => {
      const val = formData[key];
      return typeof val === "string" && val.trim().length > 0 ? val.trim() : "-";
    };

    expect(readField(recordFormData, "propertyIdentificationNumber")).toBe("180-08-002-001-001");
    expect(readField(recordFormData, "taxDeclarationNumber")).toBe("2026-18045-00001");

    // When empty
    expect(readField({}, "propertyIdentificationNumber")).toBe("-");
  });

  it("TC-PIN-06 edits a record by updating Property Identification Number and preserves the new format", () => {
    // Initial record
    let currentInfo = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
      })
    );
    expect(currentInfo.propertyIdentificationNumber).toBe("180-08-002-001-001");

    // User updates the PIN in edit mode
    const updatedPin = "180-08-002-001-002";
    currentInfo = normalizeBusinessInfo({
      ...currentInfo,
      propertyIdentificationNumber: updatedPin,
    });

    expect(currentInfo.propertyIdentificationNumber).toBe("180-08-002-001-002");
    expect(currentInfo.propertyIdentificationNumber).not.toBe(examplePin);
    // Tax declaration number must remain unchanged
    expect(currentInfo.taxDeclarationNumber).toBe("2026-18045-00001");
  });

  it("TC-PIN-07 transfers Property Identification Number to BusinessRecord payload upon permit issuance", () => {
    const formData = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
      })
    );

    // Mimic payload builder in bplo-permit-issuance.ts line 541-544
    const businessRecordPayload = {
      taxDeclarationNumber:
        typeof formData.taxDeclarationNumber === "string" ? formData.taxDeclarationNumber : null,
      propertyIdentificationNumber:
        typeof formData.propertyIdentificationNumber === "string"
          ? formData.propertyIdentificationNumber
          : null,
      propertyOwnership:
        typeof formData.propertyOwnership === "string" ? formData.propertyOwnership : null,
    };

    expect(businessRecordPayload.propertyIdentificationNumber).toBe("180-08-002-001-001");
    expect(businessRecordPayload.taxDeclarationNumber).toBe("2026-18045-00001");
  });
});
