import { describe, it, expect } from "vitest";
import {
  buildAutomaticRenewalCharges,
  buildAutomaticLiquorTobaccoSurcharge,
  resolveApplicantPaymentFrequency,
  toReleasePaymentAmount,
} from "../bplo-assessment";

/** Thesis white-box assessment helpers (UT-ASSESS-01..05). Penalty overrides live in unit-extended/. */
describe("bplo-assessment helpers", () => {
  it("UT-ASSESS-01 builds renewal charges (surcharge + interest) correctly", () => {
    const base = 1000;
    const { surcharge, interest } = buildAutomaticRenewalCharges(base, 13, {});
    expect(surcharge).toBe(250);
    expect(interest).toBe(260);
  });

  it("UT-ASSESS-02 computes liquor/tobacco surcharge at 25%", () => {
    const addOn = buildAutomaticLiquorTobaccoSurcharge("NEW", 2000, true, {});
    expect(addOn).toBe(500);
  });

  it("UT-ASSESS-03 closure applications skip liquor/tobacco surcharge", () => {
    expect(buildAutomaticLiquorTobaccoSurcharge("CLOSURE", 2000, true, {})).toBe(0);
  });

  it("UT-ASSESS-04 resolves applicant payment frequency only from applicant data", () => {
    expect(resolveApplicantPaymentFrequency({ paymentFrequency: "ANNUAL" })).toBe("ANNUAL");
    expect(resolveApplicantPaymentFrequency({ paymentFrequency: "BI_ANNUAL" })).toBe("BI_ANNUAL");
    expect(resolveApplicantPaymentFrequency({ paymentFrequency: "QUARTERLY" })).toBe("QUARTERLY");
    expect(resolveApplicantPaymentFrequency({})).toBeNull();
    expect(resolveApplicantPaymentFrequency({ paymentFrequency: "INVALID" })).toBeNull();
  });

  it("UT-ASSESS-05 toReleasePaymentAmount ignores BPLO logic and returns full annual amount", () => {
    expect(toReleasePaymentAmount(1200, "QUARTERLY" as any)).toBe(1200);
  });
});
