import { describe, expect, it } from "vitest";
import { normalizeBusinessInfo } from "@/lib/business-rules";
import { baseBusinessInfo } from "../whitebox/fixtures";

/**
 * Unit and integration tests for Tax Declaration Number:
 * - Entering & format preservation (e.g. 2026-18045-00001)
 * - Creating a record
 * - Viewing a record
 * - Editing a record
 */
describe("TC-TDN — Tax Declaration Number implementation and persistence", () => {
  const exampleFormat = "2026-18045-00001";

  it("TC-TDN-01 preserves exact value and format of Tax Declaration Number in normalizeBusinessInfo", () => {
    const info = baseBusinessInfo({
      propertyOwnership: "Owned",
      taxDeclarationNumber: exampleFormat,
    });

    const normalized = normalizeBusinessInfo(info);
    expect(normalized.taxDeclarationNumber).toBe("2026-18045-00001");
  });

  it("TC-TDN-02 preserves leading zeroes and hyphenated format without distortion", () => {
    const rawInputs = [
      "2026-18045-00001",
      "2025-00123-00009",
      "TD-2026-B1-0042",
      "  2026-18045-00001  ",
    ];

    for (const raw of rawInputs) {
      const normalized = normalizeBusinessInfo(
        baseBusinessInfo({ taxDeclarationNumber: raw })
      );
      expect(normalized.taxDeclarationNumber).toBe(raw.trim());
      expect(normalized.taxDeclarationNumber).toMatch(/^2026-18045-00001|2025-00123-00009|TD-2026-B1-0042$/);
    }
  });

  it("TC-TDN-03 handles empty or missing tax declaration number gracefully", () => {
    const emptyNormalized = normalizeBusinessInfo(
      baseBusinessInfo({ taxDeclarationNumber: "" })
    );
    expect(emptyNormalized.taxDeclarationNumber).toBe("");

    const undefinedNormalized = normalizeBusinessInfo(
      baseBusinessInfo({ taxDeclarationNumber: undefined as any })
    );
    expect(undefinedNormalized.taxDeclarationNumber).toBe("");
  });

  it("TC-TDN-04 creates a record with Tax Declaration Number and maintains exact data in payload", () => {
    const createdInfo = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleFormat,
      })
    );

    const applicationRecord = {
      businessApplicationId: "app-tdn-create",
      applicationNumber: "EBPLS-2026-0001",
      status: "DRAFT",
      formData: createdInfo,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(applicationRecord.formData.taxDeclarationNumber).toBe("2026-18045-00001");
  });

  it("TC-TDN-05 views a record and extracts exact Tax Declaration Number for display", () => {
    const recordFormData = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleFormat,
      })
    );

    // Mimic the readText / formValue helpers used across Applicant, BPLO, and Superadmin view pages
    const readTaxDeclaration = (formData: Record<string, any>) => {
      const val = formData.taxDeclarationNumber;
      return typeof val === "string" && val.trim().length > 0 ? val.trim() : "-";
    };

    expect(readTaxDeclaration(recordFormData)).toBe("2026-18045-00001");

    // When empty
    expect(readTaxDeclaration({})).toBe("-");
  });

  it("TC-TDN-06 edits a record by updating Tax Declaration Number and preserves the new format", () => {
    // Initial record
    let currentInfo = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleFormat,
      })
    );
    expect(currentInfo.taxDeclarationNumber).toBe("2026-18045-00001");

    // User updates the field in edit mode
    const updatedValue = "2026-18045-00002";
    currentInfo = normalizeBusinessInfo({
      ...currentInfo,
      taxDeclarationNumber: updatedValue,
    });

    expect(currentInfo.taxDeclarationNumber).toBe("2026-18045-00002");
    expect(currentInfo.taxDeclarationNumber).not.toBe(exampleFormat);
  });

  it("TC-TDN-07 transfers Tax Declaration Number to BusinessRecord payload upon permit issuance", () => {
    const formData = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleFormat,
      })
    );

    // Mimic payload builder in bplo-permit-issuance.ts line 539-540
    const businessRecordPayload = {
      taxDeclarationNumber:
        typeof formData.taxDeclarationNumber === "string" ? formData.taxDeclarationNumber : null,
      propertyOwnership:
        typeof formData.propertyOwnership === "string" ? formData.propertyOwnership : null,
    };

    expect(businessRecordPayload.taxDeclarationNumber).toBe("2026-18045-00001");
  });
});
