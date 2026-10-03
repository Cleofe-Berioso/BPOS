import { describe, expect, it } from "vitest";
import {
  getPaymentReferencesFromFormData,
  getLatestPaymentReference,
  upsertPaymentReferencesInFormData,
} from "@/lib/payment-reference";
import {
  getPrintableDocumentType,
  canBploPrintDocument,
  canApplicantPrintDocument,
  type PrintableDocumentApplication,
} from "@/lib/printable-documents";
import { isWithinEbMagalona, EB_MAGALONA_CENTER, EB_MAGALONA_BOUNDS } from "@/lib/eb-magalona";
import { inferMapBusinessCategory, MAP_CATEGORY_META } from "@/lib/business-map-categories";
import {
  isEbMagalonaCity,
  normalizeEbMagalonaCityName,
  isEbMagalonaProvince,
  isPhilippinesCountry,
  getProvinceOptions,
  getCityMunicipalityOptions,
  buildMainOfficeAddress,
  buildEbMagalonaBusinessAddress,
} from "@/lib/address-options";

const printableBase: PrintableDocumentApplication = {
  id: "app-1",
  applicantId: "user-1",
  applicationType: "NEW",
  status: "RELEASED",
  permitIssuance: { id: "iss-1", documentNumber: "P-1", documentPath: "/p", status: "RELEASED" },
  payment: { hasVerifiedPaymentReference: true },
};

describe("WB-PAY-PRINT — payment refs, print gates, geo, address", () => {
  it("WB-PAY-01 payment reference parse/sort/legacy/upsert", () => {
    const form = {
      paymentReferences: [
        {
          transactionNumber: "TXN-2",
          amountPaid: 200,
          submittedAt: "2026-02-01T00:00:00.000Z",
          status: "PENDING",
        },
        {
          transactionNumber: "TXN-1",
          amountPaid: 100,
          submittedAt: "2026-01-01T00:00:00.000Z",
          status: "PENDING",
        },
        { transactionNumber: "", amountPaid: 50 },
      ],
    };
    const refs = getPaymentReferencesFromFormData(form, "app-1", "APPROVED_FOR_PAYMENT");
    expect(refs).toHaveLength(2);
    expect(refs[0].transactionNumber).toBe("TXN-1");
    expect(getLatestPaymentReference(form, "app-1", "APPROVED_FOR_PAYMENT")?.transactionNumber).toBe(
      "TXN-2"
    );

    const legacy = getPaymentReferencesFromFormData(
      { paymentReference: { transactionNumber: "LEGACY", amountPaid: 50 } },
      "app-2",
      "PAID"
    );
    expect(legacy).toHaveLength(1);
    expect(legacy[0].status).toBe("VERIFIED");

    const upserted = upsertPaymentReferencesInFormData({}, refs);
    expect(Array.isArray(upserted.paymentReferences)).toBe(true);
    expect((upserted.paymentReference as { transactionNumber: string }).transactionNumber).toBe("TXN-2");
  });

  it("WB-PRINT-01 printable type and BPLO/applicant gates", () => {
    expect(getPrintableDocumentType("CLOSURE")).toBe("BUSINESS_CLOSURE_CERTIFICATE");
    expect(getPrintableDocumentType("NEW")).toBe("BUSINESS_PERMIT");

    expect(canBploPrintDocument(printableBase).canPrint).toBe(true);
    expect(canBploPrintDocument({ ...printableBase, status: "PAID" }).canPrint).toBe(false);
    expect(
      canBploPrintDocument({
        ...printableBase,
        status: "FOR_RELEASE",
        payment: { hasVerifiedPaymentReference: false },
      }).reasons.length
    ).toBeGreaterThan(0);
    expect(
      canBploPrintDocument({
        ...printableBase,
        status: "RELEASED",
        payment: { hasVerifiedPaymentReference: false },
      }).canPrint
    ).toBe(true);

    expect(canApplicantPrintDocument(printableBase, "user-1").canPrint).toBe(true);
    expect(canApplicantPrintDocument(printableBase, "other").canPrint).toBe(false);
  });

  it("WB-GEO-01 EB Magalona bounds and map categories", () => {
    expect(isWithinEbMagalona(EB_MAGALONA_CENTER.latitude, EB_MAGALONA_CENTER.longitude)).toBe(true);
    expect(
      isWithinEbMagalona(EB_MAGALONA_BOUNDS.southWest.latitude - 0.01, EB_MAGALONA_BOUNDS.southWest.longitude)
    ).toBe(false);
    expect(inferMapBusinessCategory({ businessType: "Sole Proprietorship" })).toBe("SOLE_PROPRIETORSHIP");
    expect(inferMapBusinessCategory({ businessType: "Partnership" })).toBe("PARTNERSHIP");
    expect(inferMapBusinessCategory({ businessType: "ABC Inc." })).toBe("CORPORATION");
    expect(inferMapBusinessCategory({ businessType: "One Person Corporation" })).toBe("ONE_PERSON_CORPORATION");
    expect(inferMapBusinessCategory({ businessType: "OPC" })).toBe("ONE_PERSON_CORPORATION");
    expect(inferMapBusinessCategory({ businessType: "", lineOfBusiness: "Coop Store" })).toBe("COOPERATIVE");
    expect(inferMapBusinessCategory({ businessType: "Unknown" })).toBe("SOLE_PROPRIETORSHIP");
    expect(Object.keys(MAP_CATEGORY_META)).toHaveLength(5);
    expect(MAP_CATEGORY_META.ONE_PERSON_CORPORATION.label).toBe("One Person Corporation");
    expect(MAP_CATEGORY_META.ONE_PERSON_CORPORATION.color).toBe("#ea580c");
  });

  it("WB-ADDR-01 Magalona address helpers and builders", () => {
    expect(isEbMagalonaCity("E.B. Magalona")).toBe(true);
    expect(normalizeEbMagalonaCityName("Enrique B. Magalona")).toMatch(/Magalona/);
    expect(isEbMagalonaProvince("Negros Occidental")).toBe(true);
    expect(isPhilippinesCountry("Philippines")).toBe(true);
    expect(isPhilippinesCountry(undefined, "PH")).toBe(true);
    expect(getProvinceOptions("Philippines")).toContain("Negros Occidental");
    expect(getCityMunicipalityOptions("Philippines", "Negros Occidental").length).toBeGreaterThan(0);

    const full = buildMainOfficeAddress({
      streetAddress: "Rizal St",
      barangay: "Poblacion",
      cityMunicipality: "EB Magalona",
      province: "Negros Occidental",
      country: "Philippines",
    });
    expect(full).toContain("Rizal St");
    expect(full).toContain("Poblacion");
    expect(
      buildMainOfficeAddress({
        streetAddress: "Rizal St",
        barangay: "Poblacion",
        cityMunicipality: "",
        province: "Negros Occidental",
        country: "Philippines",
      })
    ).toBe("");

    const biz = buildEbMagalonaBusinessAddress({ streetAddress: "Mabini", barangay: "Consing" });
    expect(biz.toLowerCase()).toContain("magalona");
  });
});
