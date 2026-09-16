import { describe, it, expect } from "vitest";
import { buildAutomaticRenewalCharges } from "../../bplo-assessment";

/**
 * Preserved unit coverage for Super Admin penalty overrides / waivers.
 * Not part of the thesis white-box suite (96-case count).
 * Run: npm run test:unit-extended
 */
describe("bplo-assessment penalty overrides (preserved)", () => {
  it("UT-ASSESS-EXT-01 uses Super Admin penalty percents and honors extension waivers", () => {
    const base = 1000;
    const withCustom = buildAutomaticRenewalCharges(base, 13, {
      penalties: { renewalSurchargePercent: 10, monthlyInterestPercent: 1 },
    });
    expect(withCustom.surcharge).toBe(100);
    expect(withCustom.interest).toBe(130);

    const waived = buildAutomaticRenewalCharges(base, 13, {
      penalties: { renewalSurchargePercent: 25, monthlyInterestPercent: 2 },
      activeExtension: { waiveSurcharge: true, waiveInterest: true },
    });
    expect(waived.surcharge).toBe(0);
    expect(waived.interest).toBe(0);
  });
});
