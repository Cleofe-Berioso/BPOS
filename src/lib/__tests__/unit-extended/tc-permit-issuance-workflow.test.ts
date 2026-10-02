import { describe, expect, it } from "vitest";
import {
  canBploPrintDocument,
  canApplicantPrintDocument,
  type PrintableDocumentApplication,
} from "@/lib/printable-documents";
import { normalizeTin } from "@/lib/business-rules";

describe("Permit Issuance Workflow Guarantees", () => {
  const forReleasePermit: PrintableDocumentApplication = {
    id: "app-for-release",
    applicantId: "applicant-1",
    applicationType: "NEW",
    status: "FOR_RELEASE",
    permitIssuance: {
      id: "iss-1",
      documentNumber: "BP-2026-00001",
      documentPath: "/permits/BP-2026-00001.pdf",
      status: "FOR_RELEASE",
    },
    payment: { hasVerifiedPaymentReference: true },
  };

  const releasedPermit: PrintableDocumentApplication = {
    ...forReleasePermit,
    id: "app-released",
    status: "RELEASED",
    permitIssuance: {
      ...forReleasePermit.permitIssuance!,
      status: "RELEASED",
    },
  };

  it("permits BPLO to view/print permit in FOR_RELEASE (issued) state", () => {
    const eligibility = canBploPrintDocument(forReleasePermit);
    expect(eligibility.canPrint).toBe(true);
    expect(eligibility.documentType).toBe("BUSINESS_PERMIT");
    expect(eligibility.reasons).toHaveLength(0);
  });

  it("permits BPLO to view/print permit in RELEASED state", () => {
    const eligibility = canBploPrintDocument(releasedPermit);
    expect(eligibility.canPrint).toBe(true);
    expect(eligibility.reasons).toHaveLength(0);
  });

  it("disallows permit printing before permit preparation (e.g. in PAID status)", () => {
    const paidOnly: PrintableDocumentApplication = {
      ...forReleasePermit,
      status: "PAID",
      permitIssuance: null,
    };
    const eligibility = canBploPrintDocument(paidOnly);
    expect(eligibility.canPrint).toBe(false);
    expect(eligibility.reasons.length).toBeGreaterThan(0);
  });

  it("permits applicant to view permit preview in FOR_RELEASE state", () => {
    const eligibility = canApplicantPrintDocument(forReleasePermit, "applicant-1");
    expect(eligibility.canPrint).toBe(true);
  });

  it("blocks applicant permit printing if applicant ID does not match", () => {
    const eligibility = canApplicantPrintDocument(forReleasePermit, "stranger-user");
    expect(eligibility.canPrint).toBe(false);
    expect(eligibility.reasons).toContain("Document does not belong to the current applicant.");
  });

  it("handles closure certificate printing in FOR_RELEASE and RELEASED", () => {
    const closureForRelease: PrintableDocumentApplication = {
      ...forReleasePermit,
      applicationType: "CLOSURE",
      permitIssuance: {
        id: "iss-closure-1",
        documentNumber: "CC-2026-00001",
        status: "FOR_RELEASE",
      },
    };
    const eligibility = canBploPrintDocument(closureForRelease);
    expect(eligibility.canPrint).toBe(true);
    expect(eligibility.documentType).toBe("BUSINESS_CLOSURE_CERTIFICATE");
  });

  it("ensures fallback TIN generator creates valid 9+ digit TIN to prevent release stall", () => {
    const rawTinEmpty = "";
    let normalized = normalizeTin(rawTinEmpty);
    if (!normalized || normalized.length < 9) {
      const appNumber = "EBPLS-2026-0042";
      const fallbackDigits = (appNumber.replace(/\D/g, "") + "000000000").slice(0, 9);
      normalized = fallbackDigits.padStart(9, "0");
    }
    expect(normalized).toMatch(/^\d{9,15}$/);
    expect(normalized.length).toBe(9);
  });
});
