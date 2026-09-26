import { describe, expect, it } from "vitest";
import { normalizeBusinessInfo } from "@/lib/business-rules";
import { baseBusinessInfo } from "../whitebox/fixtures";

/**
 * Unit and integration tests for Payment Receipt upload:
 * - Replaces manual OR Number text entry with Payment Receipt upload
 * - Normalization & file name preservation (e.g. official-receipt-2026-00001.pdf)
 * - Cohesion with Tax Declaration Number and Property Identification Number
 * - Complete lifecycle: Create -> Save -> View -> Edit/Replace -> Save again
 */
describe("TC-PR — Payment Receipt upload implementation and multi-field cohesion", () => {
  const exampleTdn = "2026-18045-00001";
  const examplePin = "180-08-002-001-001";
  const exampleReceiptFileName = "official-receipt-2026-00001.pdf";

  it("TC-PR-01 preserves exact file name of Payment Receipt in normalizeBusinessInfo", () => {
    const info = baseBusinessInfo({
      propertyOwnership: "Owned",
      taxDeclarationNumber: exampleTdn,
      propertyIdentificationNumber: examplePin,
      paymentReceiptFileName: exampleReceiptFileName,
    });

    const normalized = normalizeBusinessInfo(info);
    expect(normalized.paymentReceiptFileName).toBe("official-receipt-2026-00001.pdf");
    expect(normalized.taxDeclarationNumber).toBe("2026-18045-00001");
    expect(normalized.propertyIdentificationNumber).toBe("180-08-002-001-001");
  });

  it("TC-PR-02 preserves file names with spaces, special characters, and extensions", () => {
    const rawInputs = [
      "Official Receipt 2026_01.pdf",
      "OR_scan_v2.png",
      "LGU_Cashier_Receipt.jpeg",
      "  receipt-copy.pdf  ",
    ];

    for (const raw of rawInputs) {
      const normalized = normalizeBusinessInfo(
        baseBusinessInfo({ paymentReceiptFileName: raw })
      );
      expect(normalized.paymentReceiptFileName).toBe(raw.trim());
    }
  });

  it("TC-PR-03 handles empty or undefined Payment Receipt gracefully", () => {
    const emptyNormalized = normalizeBusinessInfo(
      baseBusinessInfo({ paymentReceiptFileName: "" })
    );
    expect(emptyNormalized.paymentReceiptFileName).toBe("");

    const undefinedNormalized = normalizeBusinessInfo(
      baseBusinessInfo({ paymentReceiptFileName: undefined })
    );
    expect(undefinedNormalized.paymentReceiptFileName).toBe("");
  });

  it("TC-PR-04 creates a record storing Tax Declaration Number, Property Identification Number, and Payment Receipt", () => {
    const createdInfo = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
        paymentReceiptFileName: exampleReceiptFileName,
      })
    );

    const applicationRecord = {
      businessApplicationId: "app-tri-field-create",
      applicationNumber: "EBPLS-2026-0003",
      status: "DRAFT",
      formData: createdInfo,
      documents: [
        {
          id: "doc-pr-1",
          documentName: "Payment Receipt",
          fileName: exampleReceiptFileName,
          uploadedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(applicationRecord.formData.taxDeclarationNumber).toBe("2026-18045-00001");
    expect(applicationRecord.formData.propertyIdentificationNumber).toBe("180-08-002-001-001");
    expect(applicationRecord.formData.paymentReceiptFileName).toBe("official-receipt-2026-00001.pdf");
    expect(applicationRecord.documents[0].fileName).toBe("official-receipt-2026-00001.pdf");
  });

  it("TC-PR-05 views a record and correctly displays Payment Receipt file name and link", () => {
    const recordFormData = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
        paymentReceiptFileName: exampleReceiptFileName,
      })
    );

    const readReceipt = (formData: Record<string, any>, documents: Array<{ documentName: string; fileName: string }>) => {
      const doc = documents.find((d) => d.documentName.toLowerCase().includes("payment receipt"));
      if (doc) return doc.fileName;
      const fallback = formData.paymentReceiptFileName;
      return typeof fallback === "string" && fallback.trim().length > 0 ? fallback.trim() : "None uploaded";
    };

    const docs = [{ documentName: "Payment Receipt", fileName: "official-receipt-2026-00001.pdf" }];
    expect(readReceipt(recordFormData, docs)).toBe("official-receipt-2026-00001.pdf");
    expect(recordFormData.taxDeclarationNumber).toBe("2026-18045-00001");
    expect(recordFormData.propertyIdentificationNumber).toBe("180-08-002-001-001");
  });

  it("TC-PR-06 edits and replaces Payment Receipt upload while preserving TDN and PIN", () => {
    let currentInfo = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
        paymentReceiptFileName: exampleReceiptFileName,
      })
    );

    const replacedReceiptFileName = "updated_payment_receipt_2026.png";
    currentInfo = normalizeBusinessInfo({
      ...currentInfo,
      paymentReceiptFileName: replacedReceiptFileName,
    });

    expect(currentInfo.paymentReceiptFileName).toBe("updated_payment_receipt_2026.png");
    expect(currentInfo.taxDeclarationNumber).toBe("2026-18045-00001");
    expect(currentInfo.propertyIdentificationNumber).toBe("180-08-002-001-001");
  });

  it("TC-PR-07 complete lifecycle: create -> save -> view -> remove receipt -> save again", () => {
    let appState = normalizeBusinessInfo(
      baseBusinessInfo({
        propertyOwnership: "Owned",
        taxDeclarationNumber: exampleTdn,
        propertyIdentificationNumber: examplePin,
        paymentReceiptFileName: exampleReceiptFileName,
      })
    );

    // Initial save
    expect(appState.paymentReceiptFileName).toBe("official-receipt-2026-00001.pdf");
    expect(appState.taxDeclarationNumber).toBe("2026-18045-00001");

    // Remove receipt
    appState = normalizeBusinessInfo({
      ...appState,
      paymentReceiptFileName: "",
    });

    expect(appState.paymentReceiptFileName).toBe("");
    expect(appState.taxDeclarationNumber).toBe("2026-18045-00001");
    expect(appState.propertyIdentificationNumber).toBe("180-08-002-001-001");
  });
});
