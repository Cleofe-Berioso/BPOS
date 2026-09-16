import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATUS_TRANSITIONS,
  assertStatusTransition,
  canTransitionStatus,
} from "@/lib/application-status";
import type { ApplicationStatus } from "@prisma/client";
import { EDITABLE_APPLICATION_STATUSES, isEditableStatus } from "@/lib/application-mappers";
import { canPerformWorkflowAction } from "@/lib/rbac";

/**
 * Workflow / process-contract inventory (WB-E2E-*).
 *
 * Preserved outside the thesis white-box suite (96-case unit/logic count).
 * Run: npm run test:workflow
 *
 * Derived from actual status writers in:
 * applications.ts, bplo-applications.ts, department-head-api.ts,
 * bplo-assessment.ts, bplo-payment-verification.ts, bplo-permit-issuance.ts,
 * jit-inspections.ts, request-reassessment route.
 */

type ProcessEdge = {
  id: string;
  process: string;
  actor: string;
  writer: string;
  from: ApplicationStatus | null;
  to: ApplicationStatus;
  usesAssert: boolean;
  sameStatusHistory?: boolean;
};

/** Status-changing writers (from codebase analysis). */
const STATUS_WRITERS: ProcessEdge[] = [
  {
    id: "WB-E2E-01",
    process: "Applicant Save Draft",
    actor: "APPLICANT",
    writer: "applications.saveApplicantApplication(DRAFT)",
    from: null,
    to: "DRAFT",
    usesAssert: false,
  },
  {
    id: "WB-E2E-02",
    process: "Applicant Submit Application",
    actor: "APPLICANT",
    writer: "applications.saveApplicantApplication(SUBMIT)",
    from: "DRAFT",
    to: "SUBMITTED",
    usesAssert: false,
  },
  {
    id: "WB-E2E-03",
    process: "Applicant Resubmit Returned Application",
    actor: "APPLICANT",
    writer: "applications.saveApplicantApplication(SUBMIT)",
    from: "RETURNED_FOR_CORRECTION",
    to: "SUBMITTED",
    usesAssert: false,
  },
  {
    id: "WB-E2E-04",
    process: "BPLO Mark Under Review",
    actor: "BPLO",
    writer: "bplo-applications.applyBploReviewAction(MARK_UNDER_REVIEW)",
    from: "SUBMITTED",
    to: "UNDER_REVIEW",
    usesAssert: true,
  },
  {
    id: "WB-E2E-05",
    process: "BPLO Return for Correction",
    actor: "BPLO",
    writer: "bplo-applications.applyBploReviewAction(RETURN_FOR_CORRECTION)",
    from: "UNDER_REVIEW",
    to: "RETURNED_FOR_CORRECTION",
    usesAssert: true,
  },
  {
    id: "WB-E2E-06",
    process: "BPLO Reject Application",
    actor: "BPLO",
    writer: "bplo-applications.applyBploReviewAction(REJECT_APPLICATION)",
    from: "UNDER_REVIEW",
    to: "REJECTED",
    usesAssert: true,
  },
  {
    id: "WB-E2E-07",
    process: "BPLO Send to Department Head Review",
    actor: "BPLO",
    writer: "bplo-applications.applyBploReviewAction(APPROVE_FOR_ASSESSMENT)",
    from: "UNDER_REVIEW",
    to: "DEPARTMENT_HEAD_REVIEW",
    usesAssert: true,
  },
  {
    id: "WB-E2E-08",
    process: "DH Approve Application",
    actor: "DEPARTMENT_HEAD",
    writer: "department-head-api.applyDepartmentHeadAction(APPROVE)",
    from: "DEPARTMENT_HEAD_REVIEW",
    to: "DEPARTMENT_HEAD_APPROVED",
    usesAssert: true,
  },
  {
    id: "WB-E2E-09",
    process: "DH Return Application",
    actor: "DEPARTMENT_HEAD",
    writer: "department-head-api.applyDepartmentHeadAction(RETURN)",
    from: "DEPARTMENT_HEAD_REVIEW",
    to: "RETURNED_FOR_CORRECTION",
    usesAssert: true,
  },
  {
    id: "WB-E2E-10",
    process: "DH Reject Application",
    actor: "DEPARTMENT_HEAD",
    writer: "department-head-api.applyDepartmentHeadAction(REJECT)",
    from: "DEPARTMENT_HEAD_REVIEW",
    to: "REJECTED",
    usesAssert: true,
  },
  {
    id: "WB-E2E-11",
    process: "BPLO Save Assessment Draft (advance)",
    actor: "BPLO",
    writer: "bplo-assessment.persistAssessment(DRAFT)",
    from: "DEPARTMENT_HEAD_APPROVED",
    to: "ASSESSED",
    usesAssert: true,
  },
  {
    id: "WB-E2E-12",
    process: "BPLO Generate TOP",
    actor: "BPLO",
    writer: "bplo-assessment.persistAssessment(GENERATED)",
    from: "ASSESSED",
    to: "APPROVED_FOR_PAYMENT",
    usesAssert: true,
  },
  {
    id: "WB-E2E-13",
    process: "Applicant Request Reassessment",
    actor: "APPLICANT",
    writer: "api/.../request-reassessment POST",
    from: "APPROVED_FOR_PAYMENT",
    to: "ASSESSED",
    usesAssert: true,
  },
  {
    id: "WB-E2E-14",
    process: "BPLO Verify Payment",
    actor: "BPLO",
    writer: "bplo-payment-verification.approvePaymentReference",
    from: "APPROVED_FOR_PAYMENT",
    to: "PAID",
    usesAssert: true,
  },
  {
    id: "WB-E2E-15",
    process: "BPLO Prepare Permit",
    actor: "BPLO",
    writer: "bplo-permit-issuance.preparePermitIssuance",
    from: "PAID",
    to: "FOR_RELEASE",
    usesAssert: true,
  },
  {
    id: "WB-E2E-16",
    process: "BPLO Release Permit",
    actor: "BPLO",
    writer: "bplo-permit-issuance.releasePermitIssuance",
    from: "FOR_RELEASE",
    to: "RELEASED",
    usesAssert: true,
  },
  {
    id: "WB-E2E-17",
    process: "DH Verify Inspection Non-Compliant",
    actor: "DEPARTMENT_HEAD",
    writer: "department-head-api.applyDepartmentHeadInspectionVerification(NC)",
    from: "RELEASED",
    to: "REVOCATION_REVIEW",
    usesAssert: true,
  },
  {
    id: "WB-E2E-18",
    process: "DH Approve Revocation",
    actor: "DEPARTMENT_HEAD",
    writer: "department-head-api.applyDepartmentHeadRevocationDecision(APPROVE)",
    from: "REVOCATION_REVIEW",
    to: "REVOKED",
    usesAssert: true,
  },
  {
    id: "WB-E2E-19",
    process: "DH Deny Revocation",
    actor: "DEPARTMENT_HEAD",
    writer: "department-head-api.applyDepartmentHeadRevocationDecision(DENY)",
    from: "REVOCATION_REVIEW",
    to: "RELEASED",
    usesAssert: true,
  },
];

/** Same-status side processes (app status unchanged). */
const SIDE_PROCESSES = [
  {
    id: "WB-E2E-20",
    process: "Applicant Submit Payment OR",
    actor: "APPLICANT",
    writer: "applications.submitApplicantPaymentReference",
    appStatus: "APPROVED_FOR_PAYMENT" as ApplicationStatus,
    mutates: "PaymentReference→PENDING",
  },
  {
    id: "WB-E2E-21",
    process: "BPLO Payment Return for Correction",
    actor: "BPLO",
    writer: "bplo-payment-verification.returnPaymentReferenceForCorrection",
    appStatus: "APPROVED_FOR_PAYMENT" as ApplicationStatus,
    mutates: "PaymentReference→REJECTED",
  },
  {
    id: "WB-E2E-22",
    process: "JIT Inspect a Business",
    actor: "JIT",
    writer: "jit-inspections.createJitInspection",
    appStatus: "RELEASED" as ApplicationStatus,
    mutates: "Inspection→DH_VERIFICATION_PENDING",
  },
  {
    id: "WB-E2E-23",
    process: "DH Verify Inspection Compliant",
    actor: "DEPARTMENT_HEAD",
    writer: "department-head-api.applyDepartmentHeadInspectionVerification(COMPLIANT)",
    appStatus: "RELEASED" as ApplicationStatus,
    mutates: "Inspection→VERIFIED_COMPLIANT",
  },
];

describe("WB-E2E — coded end-to-end process contracts (from writers)", () => {
  it("WB-E2E-00 inventory lists every status-changing writer edge", () => {
    expect(STATUS_WRITERS.length).toBe(19);
    const ids = new Set(STATUS_WRITERS.map((p) => p.id));
    expect(ids.size).toBe(STATUS_WRITERS.length);
  });

  for (const edge of STATUS_WRITERS) {
    it(`${edge.id} ${edge.process}: ${edge.from ?? "CREATE"} → ${edge.to}`, () => {
      if (edge.from === null) {
        // Creation paths are outside the transition map keys
        expect(["DRAFT", "SUBMITTED"]).toContain(edge.to);
        return;
      }
      expect(
        canTransitionStatus(edge.from, edge.to),
        `${edge.writer} requires map edge ${edge.from}→${edge.to}`
      ).toBe(true);
      expect(() => assertStatusTransition(edge.from!, edge.to)).not.toThrow();
    });
  }

  it("WB-E2E-24 primary licensing chain is fully map-supported", () => {
    const chain: Array<[ApplicationStatus, ApplicationStatus]> = [
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "UNDER_REVIEW"],
      ["UNDER_REVIEW", "DEPARTMENT_HEAD_REVIEW"],
      ["DEPARTMENT_HEAD_REVIEW", "DEPARTMENT_HEAD_APPROVED"],
      ["DEPARTMENT_HEAD_APPROVED", "ASSESSED"],
      ["ASSESSED", "APPROVED_FOR_PAYMENT"],
      ["APPROVED_FOR_PAYMENT", "PAID"],
      ["PAID", "FOR_RELEASE"],
      ["FOR_RELEASE", "RELEASED"],
    ];
    for (const [from, to] of chain) {
      expect(canTransitionStatus(from, to), `${from}→${to}`).toBe(true);
    }
  });

  it("WB-E2E-25 correction loops are map-supported", () => {
    expect(canTransitionStatus("SUBMITTED", "RETURNED_FOR_CORRECTION")).toBe(true);
    expect(canTransitionStatus("UNDER_REVIEW", "RETURNED_FOR_CORRECTION")).toBe(true);
    expect(canTransitionStatus("DEPARTMENT_HEAD_REVIEW", "RETURNED_FOR_CORRECTION")).toBe(true);
    expect(canTransitionStatus("RETURNED_FOR_CORRECTION", "SUBMITTED")).toBe(true);
    expect(canTransitionStatus("APPROVED_FOR_PAYMENT", "ASSESSED")).toBe(true);
  });

  it("WB-E2E-26 post-release revocation chain is map-supported", () => {
    expect(canTransitionStatus("RELEASED", "REVOCATION_REVIEW")).toBe(true);
    expect(canTransitionStatus("REVOCATION_REVIEW", "REVOKED")).toBe(true);
    expect(canTransitionStatus("REVOCATION_REVIEW", "RELEASED")).toBe(true);
  });

  it("WB-E2E-27 payment return does NOT use RETURNED_FOR_CORRECTION on application", () => {
    // Writer: returnPaymentReferenceForCorrection keeps APPROVED_FOR_PAYMENT
    expect(canTransitionStatus("APPROVED_FOR_PAYMENT", "RETURNED_FOR_CORRECTION")).toBe(false);
    const paymentReturn = SIDE_PROCESSES.find((p) => p.id === "WB-E2E-21");
    expect(paymentReturn?.appStatus).toBe("APPROVED_FOR_PAYMENT");
  });

  it("WB-E2E-28 side processes keep application status unchanged", () => {
    for (const side of SIDE_PROCESSES) {
      expect(SIDE_PROCESSES.map((p) => p.id)).toContain(side.id);
      // Same-status: no transition required; staying put is valid by not calling assert
      expect(APPLICATION_STATUS_TRANSITIONS[side.appStatus]).toBeDefined();
    }
    expect(SIDE_PROCESSES).toHaveLength(4);
  });

  it("WB-E2E-29 unused map edge: UNDER_REVIEW→ASSESSED has no writer", () => {
    expect(canTransitionStatus("UNDER_REVIEW", "ASSESSED")).toBe(true);
    const writerUsesAssessFromUnderReview = STATUS_WRITERS.some(
      (w) => w.from === "UNDER_REVIEW" && w.to === "ASSESSED"
    );
    expect(writerUsesAssessFromUnderReview).toBe(false);
    const writerUsesDhFromUnderReview = STATUS_WRITERS.some(
      (w) => w.from === "UNDER_REVIEW" && w.to === "DEPARTMENT_HEAD_REVIEW"
    );
    expect(writerUsesDhFromUnderReview).toBe(true);
  });

  it("WB-E2E-30 every non-create writer edge is map-legal (no out-of-map writers)", () => {
    for (const edge of STATUS_WRITERS) {
      if (edge.from === null) continue;
      expect(canTransitionStatus(edge.from, edge.to)).toBe(true);
    }
  });

  it("WB-E2E-31 applicant editable statuses match submit/draft writers", () => {
    expect(EDITABLE_APPLICATION_STATUSES).toEqual(["DRAFT", "RETURNED_FOR_CORRECTION"]);
    expect(isEditableStatus("DRAFT")).toBe(true);
    expect(isEditableStatus("RETURNED_FOR_CORRECTION")).toBe(true);
    expect(isEditableStatus("SUBMITTED")).toBe(false);
    expect(isEditableStatus("UNDER_REVIEW")).toBe(false);
  });

  it("WB-E2E-32 workflow actors match coded process ownership", () => {
    expect(canPerformWorkflowAction("BPLO", "ASSESS_FEES")).toBe(true);
    expect(canPerformWorkflowAction("BPLO", "VERIFY_PAYMENTS")).toBe(true);
    expect(canPerformWorkflowAction("DEPARTMENT_HEAD", "APPROVE_APPLICATION")).toBe(true);
    expect(canPerformWorkflowAction("DEPARTMENT_HEAD", "APPROVE_REVOCATION")).toBe(true);
    expect(canPerformWorkflowAction("JIT", "INSPECT_BUSINESS")).toBe(true);
    expect(canPerformWorkflowAction("SUPER_ADMIN", "ASSESS_FEES")).toBe(false);
    expect(canPerformWorkflowAction("SUPER_ADMIN", "APPROVE_REVOCATION")).toBe(false);
  });

  it("WB-E2E-33 TOP generate may chain DH_APPROVED→ASSESSED→APPROVED_FOR_PAYMENT", () => {
    expect(canTransitionStatus("DEPARTMENT_HEAD_APPROVED", "ASSESSED")).toBe(true);
    expect(canTransitionStatus("ASSESSED", "APPROVED_FOR_PAYMENT")).toBe(true);
  });

  it("WB-E2E-34 BPLO return also allowed from SUBMITTED", () => {
    expect(canTransitionStatus("SUBMITTED", "RETURNED_FOR_CORRECTION")).toBe(true);
    expect(canTransitionStatus("SUBMITTED", "REJECTED")).toBe(true);
  });

  it("WB-E2E-35 terminal processes end at REJECTED or REVOKED", () => {
    expect(APPLICATION_STATUS_TRANSITIONS.REJECTED).toEqual([]);
    expect(APPLICATION_STATUS_TRANSITIONS.REVOKED).toEqual([]);
    const terminalWriters = STATUS_WRITERS.filter((w) => w.to === "REJECTED" || w.to === "REVOKED");
    expect(terminalWriters.length).toBeGreaterThanOrEqual(3);
  });
});
