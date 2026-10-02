import { describe, expect, it } from "vitest";
import { validateBatchFeeItems } from "@/lib/superadmin-settings-policies";

describe("WB-FEE-BATCH — Default Size Mode fee batch validation", () => {
  const sampleRequiredClassifications = [
    "Micro (no workers)",
    "Micro (1–5)",
    "Cottage (6–10)",
    "Small (11–50)",
    "Medium (51–99)",
    "Large (100–150)",
    "Large (200+)",
  ];

  it("WB-FEE-01: Rejects empty or invalid batch arrays", () => {
    const resEmpty = validateBatchFeeItems([]);
    expect(resEmpty.ok).toBe(false);
    if (resEmpty.ok === false) {
      expect(resEmpty.error).toMatch(/At least one size classification fee is required/i);
    }

    const resNull = validateBatchFeeItems(null);
    expect(resNull.ok).toBe(false);

    const resNonArray = validateBatchFeeItems("not an array");
    expect(resNonArray.ok).toBe(false);
  });

  it("WB-FEE-02: Rejects items with missing or empty classification", () => {
    const res = validateBatchFeeItems([
      { classification: "", amount: 500 },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Size classification is required/i);
    }
  });

  it("WB-FEE-03: Rejects duplicate classifications in the same batch", () => {
    const res = validateBatchFeeItems([
      { classification: "Micro", amount: 500 },
      { classification: "Micro", amount: 600 },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Duplicate classification "Micro"/i);
    }
  });

  it("WB-FEE-04: Rejects missing fee amounts", () => {
    const resUndefined = validateBatchFeeItems([
      { classification: "Micro", amount: undefined },
    ]);
    expect(resUndefined.ok).toBe(false);
    if (resUndefined.ok === false) {
      expect(resUndefined.error).toMatch(/Fee is required for size classification "Micro"/i);
    }

    const resEmptyStr = validateBatchFeeItems([
      { classification: "Micro", amount: "" },
    ]);
    expect(resEmptyStr.ok).toBe(false);
    if (resEmptyStr.ok === false) {
      expect(resEmptyStr.error).toMatch(/Fee is required for size classification "Micro"/i);
    }
  });

  it("WB-FEE-05: Rejects negative fee amounts", () => {
    const resNegative = validateBatchFeeItems([
      { classification: "Micro", amount: -50 },
    ]);
    expect(resNegative.ok).toBe(false);
    if (resNegative.ok === false) {
      expect(resNegative.error).toMatch(/Invalid fee for "Micro". Fee amount must be a non-negative number/i);
    }
  });

  it("WB-FEE-06: Enforces that all required size classifications are present in Default Size Mode", () => {
    // Missing "Large (200+)"
    const incompleteItems = sampleRequiredClassifications.slice(0, 6).map((c) => ({
      classification: c,
      amount: 1000,
    }));

    const res = validateBatchFeeItems(incompleteItems, sampleRequiredClassifications);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Fee is required for size classification "Large \(200\+\)"/i);
    }
  });

  it("WB-FEE-07: Successfully validates and parses all size classifications in batch", () => {
    const completeItems = sampleRequiredClassifications.map((c, index) => ({
      classification: c,
      amount: (index + 1) * 500,
    }));

    const res = validateBatchFeeItems(completeItems, sampleRequiredClassifications);
    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.value).toHaveLength(sampleRequiredClassifications.length);
      expect(res.value[0]).toEqual({
        classification: "Micro (no workers)",
        amount: 500,
      });
      expect(res.value[6]).toEqual({
        classification: "Large (200+)",
        amount: 3500,
      });
    }
  });
});
