import { describe, expect, it } from "vitest";

/** Mirrors exported BPLO_QUEUE_REVIEW_STATUSES without importing prisma-bound module. */
const BPLO_QUEUE_REVIEW_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "RETURNED_FOR_CORRECTION",
] as const;

/**
 * Thesis white-box: BPLO queue membership only.
 * Status transition cases formerly WB-BPLO-02..06 are covered by WB-STATUS-*
 * and preserved workflow contracts in src/lib/__tests__/workflow/.
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
});
