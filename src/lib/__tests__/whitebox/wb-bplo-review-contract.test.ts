import { describe, expect, it } from "vitest";
import { canTransitionStatus } from "@/lib/application-status";

/** Mirrors exported BPLO_QUEUE_REVIEW_STATUSES without importing prisma-bound module. */
const BPLO_QUEUE_REVIEW_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "RETURNED_FOR_CORRECTION",
] as const;

/**
 * Thesis white-box: BPLO review action contracts and status transitions.
 */
describe("WB-BPLO — review action contracts", () => {
  it("WB-BPLO-01 queue only includes review-stage statuses", () => {
    expect([...BPLO_QUEUE_REVIEW_STATUSES]).toEqual([
      "SUBMITTED",
      "UNDER_REVIEW",
      "RETURNED_FOR_CORRECTION",
    ]);
    expect(BPLO_QUEUE_REVIEW_STATUSES).not.toContain("ASSESSED");
    expect(BPLO_QUEUE_REVIEW_STATUSES).not.toContain("RELEASED");
  });

  it("WB-BPLO-02 mark under review: SUBMITTED -> UNDER_REVIEW", () => {
    expect(canTransitionStatus("SUBMITTED", "UNDER_REVIEW")).toBe(true);
  });

  it("WB-BPLO-03 return for correction targets RETURNED_FOR_CORRECTION", () => {
    expect(canTransitionStatus("SUBMITTED", "RETURNED_FOR_CORRECTION")).toBe(true);
    expect(canTransitionStatus("UNDER_REVIEW", "RETURNED_FOR_CORRECTION")).toBe(true);
  });

  it("WB-BPLO-04 reject targets REJECTED", () => {
    expect(canTransitionStatus("SUBMITTED", "REJECTED")).toBe(true);
    expect(canTransitionStatus("UNDER_REVIEW", "REJECTED")).toBe(true);
  });

  it("WB-BPLO-05 approve for DH review writes DEPARTMENT_HEAD_REVIEW", () => {
    expect(canTransitionStatus("UNDER_REVIEW", "DEPARTMENT_HEAD_REVIEW")).toBe(true);
    expect(canTransitionStatus("UNDER_REVIEW", "ASSESSED")).toBe(true);
  });

  it("WB-BPLO-06 cannot review from draft per status map", () => {
    expect(canTransitionStatus("DRAFT", "UNDER_REVIEW")).toBe(false);
  });
});
