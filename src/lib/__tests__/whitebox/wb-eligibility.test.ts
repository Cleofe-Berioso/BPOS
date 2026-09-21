import { describe, expect, it } from "vitest";
import { getBusinessRenewalBlockReason } from "@/lib/renewal-eligibility";
import {
  getClosureBusinessReason,
  isComplianceForcedClosureBusiness,
  evaluateClosureEligibility,
} from "@/lib/closure-eligibility";
import { baseBusinessInfo } from "./fixtures";

function renewalSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "br1",
    registrationNumber: "REG-1",
    businessName: "WB Biz",
    businessStatus: "ACTIVE" as const,
    closedAt: null,
    hasRevokedPermit: false,
    location: { status: "VERIFIED" },
    applications: [{ status: "RELEASED" }],
    inspections: [] as Array<{
      inspectionId: string;
      nonComplianceType: string | null;
      violationSeverity: string | null;
      isSettled: boolean;
      forcedClosure: boolean;
      complianceCaseStatus: string;
      createdAt: Date;
    }>,
    businessInfo: baseBusinessInfo(),
    ...overrides,
  };
}

describe("WB-ELIG — renewal & closure eligibility helpers", () => {
  it("WB-ELIG-01 ACTIVE + verified location + released history is renewal-eligible", () => {
    const result = getBusinessRenewalBlockReason(renewalSnapshot());
    expect(result.eligible).toBe(true);
    expect(result.reasonCode).toBeNull();
  });

  it("WB-ELIG-02 CLOSED business cannot renew", () => {
    const result = getBusinessRenewalBlockReason(
      renewalSnapshot({ businessStatus: "CLOSED" })
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCode).toBe("BUSINESS_CLOSED");
  });

  it("WB-ELIG-03 flagged unsettled compliance blocks renewal", () => {
    const result = getBusinessRenewalBlockReason(
      renewalSnapshot({
        inspections: [
          {
            inspectionId: "insp1",
            nonComplianceType: "GOVERNMENT_AGENCY_RELATED",
            violationSeverity: "MAJOR",
            isSettled: false,
            forcedClosure: false,
            complianceCaseStatus: "FLAGGED_UNSETTLED",
            createdAt: new Date(),
          },
        ],
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCode).toBe("UNRESOLVED_GOVERNMENT_COMPLIANCE");
  });

  it("WB-ELIG-03a settled minor/major government case allows renewal", () => {
    const result = getBusinessRenewalBlockReason(
      renewalSnapshot({
        inspections: [
          {
            inspectionId: "insp1a",
            nonComplianceType: "GOVERNMENT_AGENCY_RELATED",
            violationSeverity: "MINOR",
            isSettled: true,
            forcedClosure: false,
            complianceCaseStatus: "SETTLED",
            createdAt: new Date(),
          },
        ],
      })
    );
    expect(result.eligible).toBe(true);
    expect(result.reasonCode).toBeNull();
  });

  it("WB-ELIG-03b expired unsettled compliance uses EXPIRED reason", () => {
    const result = getBusinessRenewalBlockReason(
      renewalSnapshot({
        inspections: [
          {
            inspectionId: "insp1b",
            nonComplianceType: "GOVERNMENT_AGENCY_RELATED",
            violationSeverity: "MAJOR",
            isSettled: false,
            forcedClosure: false,
            complianceCaseStatus: "EXPIRED_UNSETTLED",
            createdAt: new Date(),
          },
        ],
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCode).toBe("EXPIRED_UNSETTLED_COMPLIANCE");
  });

  it("WB-ELIG-04 missing verified location and eligible history fails renewal rule", () => {
    const result = getBusinessRenewalBlockReason(
      renewalSnapshot({
        location: { status: "PENDING" },
        applications: [],
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCode).toBe("EXISTING_RENEWAL_RULE_FAILED");
  });

  it("WB-ELIG-05 forced-closure pending is detected for closure path", () => {
    const snap = {
      businessStatus: "ACTIVE" as const,
      location: { status: "VERIFIED" },
      applications: [{ status: "RELEASED" }],
      inspections: [
        {
          inspectionId: "insp2",
          nonComplianceType: "GOVERNMENT_AGENCY_RELATED",
          complianceCaseStatus: "FORCED_CLOSURE_PENDING",
          forcedClosure: true,
          createdAt: new Date(),
        },
      ],
    };
    expect(isComplianceForcedClosureBusiness(snap)).toBe(true);
    expect(getClosureBusinessReason(snap)).toBeTruthy();
  });

  it("WB-ELIG-06 severe revoked permit can still apply for business closure", () => {
    const result = evaluateClosureEligibility({
      businessStatus: "INACTIVE",
      location: { status: "VERIFIED" },
      applications: [{ status: "REVOKED" }],
      inspections: [
        {
          inspectionId: "insp3",
          nonComplianceType: "GOVERNMENT_AGENCY_RELATED",
          complianceCaseStatus: "FORCED_CLOSURE_PENDING",
          forcedClosure: true,
          createdAt: new Date(),
        },
      ],
    });
    expect(result.eligible).toBe(true);
    expect(result.isComplianceForcedClosure).toBe(true);
  });

  it("WB-ELIG-07 revoked permit without forced-closure flag remains closable", () => {
    const result = evaluateClosureEligibility({
      businessStatus: "INACTIVE",
      location: { status: "VERIFIED" },
      applications: [{ status: "REVOKED" }],
      inspections: [],
    });
    expect(result.eligible).toBe(true);
    expect(result.reasonCode).toBe("REVOKED_PERMIT_CLOSURE");
  });
});