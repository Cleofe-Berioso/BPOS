import { describe, it, expect } from "vitest";
import { computeMayorsPermitFee } from "../../fee-computation";

/**
 * Preserved unit coverage for special LOB fee schedules.
 * Not part of the thesis white-box suite (96-case count).
 * Run: npm run test:unit-extended
 */
describe("fee-computation special LOB schedules (preserved)", () => {
  it("UT-FEE-EXT-01 applies bank schedule for plain Banks LOB (default rural/thrift/savings)", () => {
    const computed = computeMayorsPermitFee({
      applicationType: "NEW",
      lineOfBusiness: "Banks",
      assetSize: "1000000",
      totalEmployees: "20",
    });
    expect(computed.selectedMayorPermitFee).toBe(4000);
    expect(computed.detectedCategory).toContain("Banks");
  });

  it("UT-FEE-EXT-02 maps Lessors of Real Estate to land lessor schedule", () => {
    const computed = computeMayorsPermitFee({
      applicationType: "NEW",
      lineOfBusiness: "Lessors of Real Estate",
      assetSize: "600000",
      totalEmployees: "0",
    });
    expect(computed.detectedCategory.toLowerCase()).toContain("lessor");
    expect(computed.selectedMayorPermitFee).toBe(1500);
  });

  it("UT-FEE-EXT-03 maps Lessors of Real Estate - Land exactly", () => {
    const computed = computeMayorsPermitFee({
      applicationType: "NEW",
      lineOfBusiness: "Lessors of Real Estate - Land",
      assetSize: "600000",
      totalEmployees: "0",
    });
    expect(computed.selectedMayorPermitFee).toBe(1500);
  });
});
