import { describe, expect, it } from "vitest";
import {
  determineComplianceCaseStatus,
  shouldApplyForcedClosure,
  NON_COMPLIANCE_TYPES,
  VIOLATION_SEVERITIES,
  COMPLIANCE_CASE_STATUSES,
} from "@/lib/jit-compliance-constants";
import {
  JIT_POST_AUDIT_CHECKLIST_ITEMS,
  isValidChecklistDepartmentKey,
  isValidChecklistResponse,
  parseChecklistPayload,
  getChecklistQuestionForDepartment,
  formatChecklistItemsForReadOnlyApi,
} from "@/lib/jit-post-audit-checklist";
import {
  createEmptyChecklistDraft,
  isChecklistComplete,
  validateChecklistDraft,
  type ChecklistDraftState,
} from "@/components/jit/jit-post-audit-checklist-form";
import { getJitMapMarkerStatus, getJitMapMarkerColor } from "@/lib/jit-inspections";

function fullChecklist(response: "YES" | "NO" = "YES") {
  return JIT_POST_AUDIT_CHECKLIST_ITEMS.map((item) => ({
    departmentKey: item.departmentKey,
    response,
  }));
}

describe("WB-JIT — compliance, checklist, map markers", () => {
  it("WB-JIT-01 determineComplianceCaseStatus forced closure only for agency+severe", () => {
    expect(determineComplianceCaseStatus("GOVERNMENT_AGENCY_RELATED", "SEVERE")).toBe(
      "FORCED_CLOSURE_PENDING"
    );
    expect(determineComplianceCaseStatus("GOVERNMENT_AGENCY_RELATED", "MINOR")).toBe("FLAGGED_UNSETTLED");
    expect(determineComplianceCaseStatus("RENEWAL_RELATED", "SEVERE")).toBe("FLAGGED_UNSETTLED");
    expect(shouldApplyForcedClosure("GOVERNMENT_AGENCY_RELATED", "SEVERE")).toBe(true);
    expect(shouldApplyForcedClosure("RENEWAL_RELATED", "SEVERE")).toBe(false);
  });

  it("WB-JIT-02 compliance catalogs have expected keys", () => {
    expect(NON_COMPLIANCE_TYPES.GOVERNMENT_AGENCY_RELATED.value).toBe("GOVERNMENT_AGENCY_RELATED");
    expect(VIOLATION_SEVERITIES.SEVERE.value).toBe("SEVERE");
    expect(COMPLIANCE_CASE_STATUSES.FORCED_CLOSURE_PENDING.value).toBe("FORCED_CLOSURE_PENDING");
  });

  it("WB-JIT-03 checklist validators and parseChecklistPayload", () => {
    expect(JIT_POST_AUDIT_CHECKLIST_ITEMS).toHaveLength(8);
    expect(isValidChecklistDepartmentKey("BPLO")).toBe(true);
    expect(isValidChecklistDepartmentKey("X")).toBe(false);
    expect(isValidChecklistResponse("YES")).toBe(true);
    expect(isValidChecklistResponse("COMPLIANT")).toBe(false);

    const parsed = parseChecklistPayload(fullChecklist("NO"));
    expect(parsed).toHaveLength(8);
    expect(() => parseChecklistPayload([])).toThrow(/must include all/);
    expect(() =>
      parseChecklistPayload([
        ...fullChecklist().slice(0, 7),
        { departmentKey: "BPLO", response: "YES" },
      ])
    ).toThrow(/Duplicate/);
  });

  it("WB-JIT-04 checklist question and read-only formatter", () => {
    expect(getChecklistQuestionForDepartment("BPLO").length).toBeGreaterThan(10);
    const rows = formatChecklistItemsForReadOnlyApi([
      {
        id: "1",
        departmentKey: "BPLO",
        question: "Q?",
        response: "YES",
        remarks: null,
        evidenceFileName: "a.pdf",
        evidenceStoragePath: "/a.pdf",
        evidenceMimeType: "application/pdf",
      },
      {
        id: "2",
        departmentKey: "FIRE_SAFETY",
        question: "Fire?",
        response: "COMPLIANT",
        remarks: null,
        evidenceFileName: null,
      },
    ]);
    expect(rows[0].responseLabel).toBe("Yes");
    expect(rows[0].hasEvidence).toBe(true);
    expect(rows[1].responseLabel).toBe("Yes");
  });

  it("WB-JIT-05 map marker status and colors", () => {
    expect(getJitMapMarkerStatus(null)).toBe("UNINSPECTED");
    expect(getJitMapMarkerStatus("DH_VERIFICATION_PENDING")).toBe("PENDING_INSPECTION");
    expect(getJitMapMarkerStatus("VERIFIED_COMPLIANT")).toBe("COMPLIANT");
    expect(getJitMapMarkerStatus("COMPLIANT")).toBe("COMPLIANT");
    expect(getJitMapMarkerStatus("REVOKED")).toBe("REVOKED");
    expect(getJitMapMarkerStatus("VERIFIED_NON_COMPLIANT")).toBe("PENDING_INSPECTION");
    expect(
      getJitMapMarkerStatus("VERIFIED_NON_COMPLIANT", {
        isSettled: true,
        complianceCaseStatus: "SETTLED",
      })
    ).toBe("COMPLIANT");
    expect(
      getJitMapMarkerStatus("REVOKED", {
        revocationSettledAt: new Date().toISOString(),
      })
    ).toBe("COMPLIANT");

    // Revocation and restriction list detection
    expect(
      getJitMapMarkerStatus("REVOCATION_REVIEW", {
        revocationDecision: "APPROVED",
      })
    ).toBe("REVOKED");
    expect(
      getJitMapMarkerStatus(null, {
        applicationStatus: "REVOKED",
      })
    ).toBe("REVOKED");
    expect(
      getJitMapMarkerStatus(null, {
        isRestricted: true,
      })
    ).toBe("REVOKED");
    expect(
      getJitMapMarkerStatus("VERIFIED_NON_COMPLIANT", {
        complianceCaseStatus: "FORCED_CLOSURE_PENDING",
      })
    ).toBe("REVOKED");
    expect(
      getJitMapMarkerStatus("NON_COMPLIANT", {
        complianceCaseStatus: "EXPIRED_UNSETTLED",
      })
    ).toBe("REVOKED");

    expect(getJitMapMarkerColor("UNINSPECTED")).toBe("#9ca3af");
    expect(getJitMapMarkerColor("PENDING_INSPECTION")).toBe("#fbbf24");
    expect(getJitMapMarkerColor("COMPLIANT")).toBe("#10b981");
    expect(getJitMapMarkerColor("REVOKED")).toBe("#ef4444");
  });

  it("WB-JIT-06 checklist validation: findings and evidence required when No is selected", () => {
    const draft = createEmptyChecklistDraft();
    expect(isChecklistComplete(draft)).toBe(false);
    expect(validateChecklistDraft(draft)).toMatch(/Please answer Yes or No/);

    // When all items are YES, remarks and evidence are optional
    for (const item of JIT_POST_AUDIT_CHECKLIST_ITEMS) {
      draft[item.departmentKey] = { response: "YES", remarks: "", evidenceFile: null };
    }
    expect(isChecklistComplete(draft)).toBe(true);
    expect(validateChecklistDraft(draft)).toBeNull();

    // When an item is marked NO, findings and evidence become required
    const targetDept = JIT_POST_AUDIT_CHECKLIST_ITEMS[0];
    draft[targetDept.departmentKey] = { response: "NO", remarks: "", evidenceFile: null };
    expect(isChecklistComplete(draft)).toBe(false);
    expect(validateChecklistDraft(draft)).toContain(
      `Findings and Evidence are required for ${targetDept.departmentLabel} when No is selected.`
    );

    // Provide only findings (missing evidence)
    draft[targetDept.departmentKey].remarks = "Violation detected on site.";
    expect(isChecklistComplete(draft)).toBe(false);
    expect(validateChecklistDraft(draft)).toContain(
      `Evidence is required for ${targetDept.departmentLabel} when No is selected.`
    );

    // Provide only evidence (missing findings)
    const mockFile = new File(["dummy content"], "evidence.jpg", { type: "image/jpeg" });
    draft[targetDept.departmentKey].remarks = "   ";
    draft[targetDept.departmentKey].evidenceFile = mockFile;
    expect(isChecklistComplete(draft)).toBe(false);
    expect(validateChecklistDraft(draft)).toContain(
      `Findings are required for ${targetDept.departmentLabel} when No is selected.`
    );

    // Provide both findings and evidence
    draft[targetDept.departmentKey].remarks = "Actual non-compliance documented.";
    draft[targetDept.departmentKey].evidenceFile = mockFile;
    expect(isChecklistComplete(draft)).toBe(true);
    expect(validateChecklistDraft(draft)).toBeNull();
  });
});
