/**
 * Preserved BPLO status-transition cases formerly counted as WB-BPLO-02..06.
 * Redundant with WB-STATUS-* for thesis white-box; kept for regression if needed.
 * Run: npm run test:unit-extended
 */
import { describe, expect, it } from "vitest";
import { canTransitionStatus } from "@/lib/application-status";

describe("BPLO status transitions (preserved; covered by WB-STATUS)", () => {
  it("WB-BPLO-02 MARK_UNDER_REVIEW: SUBMITTED → UNDER_REVIEW", () => {
    expect(canTransitionStatus("SUBMITTED", "UNDER_REVIEW")).toBe(true);
  });

  it("WB-BPLO-03 RETURN_FOR_CORRECTION targets RETURNED_FOR_CORRECTION", () => {
    expect(canTransitionStatus("SUBMITTED", "RETURNED_FOR_CORRECTION")).toBe(true);
    expect(canTransitionStatus("UNDER_REVIEW", "RETURNED_FOR_CORRECTION")).toBe(true);
  });

  it("WB-BPLO-04 REJECT targets REJECTED", () => {
    expect(canTransitionStatus("SUBMITTED", "REJECTED")).toBe(true);
    expect(canTransitionStatus("UNDER_REVIEW", "REJECTED")).toBe(true);
  });

  it("WB-BPLO-05 approve-for-DH writes DEPARTMENT_HEAD_REVIEW (not ASSESSED)", () => {
    expect(canTransitionStatus("UNDER_REVIEW", "DEPARTMENT_HEAD_REVIEW")).toBe(true);
    expect(canTransitionStatus("UNDER_REVIEW", "ASSESSED")).toBe(true);
  });

  it("WB-BPLO-06 cannot under-review from DRAFT per status map", () => {
    expect(canTransitionStatus("DRAFT", "UNDER_REVIEW")).toBe(false);
  });
});
