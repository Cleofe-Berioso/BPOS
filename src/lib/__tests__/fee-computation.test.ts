import { describe, it, expect } from "vitest";
import {
  classifyAssetBracket,
  classifyWorkerBracket,
  computeMayorsPermitFee,
  sumFeeComponents,
} from "../fee-computation";

/** Thesis white-box fee math (UT-FEE-01..05). Special LOB schedules live in unit-extended/. */
describe("fee-computation", () => {
  it("UT-FEE-01 classifies asset and worker brackets correctly", () => {
    expect(classifyAssetBracket("50000")).toBe("BELOW_100K");
    expect(classifyAssetBracket("150000")).toBe("FROM_100K_TO_250K");
    expect(classifyAssetBracket("300000")).toBe("FROM_250K_TO_500K");
    expect(classifyAssetBracket("600000")).toBe("FROM_500K_TO_2M");
    expect(classifyAssetBracket("20000000")).toBe("FROM_5M_TO_20M");

    expect(classifyWorkerBracket("0")).toBe("NONE");
    expect(classifyWorkerBracket("3")).toBe("FROM_1_TO_5");
    expect(classifyWorkerBracket("8")).toBe("FROM_6_TO_10");
    expect(classifyWorkerBracket("30")).toBe("FROM_11_TO_50");
    expect(classifyWorkerBracket("150")).toBe("FROM_100_TO_199");
    expect(classifyWorkerBracket("199")).toBe("FROM_100_TO_199");
    expect(classifyWorkerBracket("200")).toBe("FROM_200_OR_MORE");
  });

  it("UT-FEE-02 computes mayor's permit fee and includes surcharge/interest for late renewals", () => {
    const input = {
      applicationType: "RENEWAL" as const,
      lineOfBusiness: "small retail",
      assetSize: "600000",
      totalEmployees: "12",
      isLateRenewal: true,
      lateMonths: 2,
    };

    const computed = computeMayorsPermitFee(input);
    expect(computed.mayorsPermitFee).toBeGreaterThanOrEqual(0);

    const base = computed.selectedMayorPermitFee;
    const expectedSurcharge = Math.round(base * 0.25);
    const expectedInterest = Math.round(base * 0.02 * 2);

    expect(computed.surcharge).toBe(expectedSurcharge);
    expect(computed.interest).toBe(expectedInterest);
  });

  it("UT-FEE-03 chooses the higher fee between asset and worker classifications", () => {
    const computed = computeMayorsPermitFee({
      applicationType: "NEW",
      lineOfBusiness: "Manufacturers / Importers / Producers",
      assetSize: "7000000",
      totalEmployees: "45",
    });

    expect(computed.assetBasedFee).toBe(4000);
    expect(computed.workerBasedFee).toBe(1800);
    expect(computed.selectedMayorPermitFee).toBe(4000);
    expect(computed.selectedClassification).toContain("Medium");
  });

  it("UT-FEE-04 bypasses size and worker classification for fixed-fee categories", () => {
    const computed = computeMayorsPermitFee({
      applicationType: "NEW",
      lineOfBusiness: "Private Ports / Wharves",
      assetSize: "1",
      totalEmployees: "1",
    });

    expect(computed.selectedMayorPermitFee).toBe(50000);
    expect(computed.specialRuleApplied).toContain("Fixed fee");
  });

  it("UT-FEE-05 sums fee components correctly", () => {
    const total = sumFeeComponents({
      mayorsPermitFee: 1000,
      regulatoryFees: 300,
      additionalCharges: 0,
      penalties: 0,
      surcharge: 250,
      interest: 40,
      closureCertificateFee: 0,
      arrears: 0,
      otherCharges: 10,
    });
    expect(total).toBe(1600);
  });
});
