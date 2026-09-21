export type JitChecklistDepartmentKey =
  | "BPLO"
  | "ZONING_PLANNING"
  | "ENGINEERING"
  | "FIRE_SAFETY"
  | "HEALTH_SANITARY"
  | "ENVIRONMENT"
  | "TREASURER_ASSESSMENT"
  | "DECLARATION_VERIFICATION";

export type JitChecklistResponseValue = "YES" | "NO";

/** Legacy checklist response values preserved for historical record display */
export type JitChecklistResponseValueLegacy = "COMPLIANT" | "NON_COMPLIANT" | "NOT_APPLICABLE";

/** Union of current and legacy response values (used by display formatters) */
export type JitChecklistResponseValueAny = JitChecklistResponseValue | JitChecklistResponseValueLegacy;

export interface JitChecklistTemplateItem {
  departmentKey: JitChecklistDepartmentKey;
  departmentLabel: string;
  question: string;
  relatedClearanceLabels?: string[];
}

export const JIT_POST_AUDIT_CHECKLIST_ITEMS: JitChecklistTemplateItem[] = [
  {
    departmentKey: "BPLO",
    departmentLabel: "BPLO / Business Permit Office",
    question:
      "Does the actual business operation match the approved business permit details, and is the declared business information true and accurate?",
  },
  {
    departmentKey: "ZONING_PLANNING",
    departmentLabel: "Zoning / Planning Department",
    question:
      "Does the establishment have the required zoning or locational clearance, and is the actual business activity aligned with the declared approved clearance?",
    relatedClearanceLabels: ["Zoning Clearance", "Location Plan / Sketch"],
  },
  {
    departmentKey: "ENGINEERING",
    departmentLabel: "Engineering / Building Office",
    question:
      "Does the establishment comply with the approved building, occupancy, or structural clearance issued for its declared use?",
    relatedClearanceLabels: ["Engineering Clearance", "Engineering Office Clearance"],
  },
  {
    departmentKey: "FIRE_SAFETY",
    departmentLabel: "Fire Safety / BFP",
    question:
      "Does the establishment maintain compliance with the issued fire safety clearance and approved fire safety requirements?",
    relatedClearanceLabels: ["BFP Clearance", "Fire Safety Clearance"],
  },
  {
    departmentKey: "HEALTH_SANITARY",
    departmentLabel: "Health / Sanitary Office",
    question:
      "Does the establishment maintain compliance with the issued sanitary or health clearance and approved sanitation requirements?",
    relatedClearanceLabels: ["Sanitary Clearance", "Sanitary Office Clearance"],
  },
  {
    departmentKey: "ENVIRONMENT",
    departmentLabel: "Environment / MENRO",
    question:
      "Does the establishment comply with the environmental clearance or approved waste management requirements applicable to its operation?",
    relatedClearanceLabels: ["Environment Clearance", "Environment Office Clearance"],
  },
  {
    departmentKey: "TREASURER_ASSESSMENT",
    departmentLabel: "Treasurer / Assessment",
    question:
      "Are the business taxes, fees, and financial obligations consistent with the approved permit, declared operation, and current business activity?",
    relatedClearanceLabels: [
      "Real Property Tax / RPT Clearance",
      "RPT Clearance",
      "Assessor's Office Clearance",
      "Water Bill Clearance",
    ],
  },
  {
    departmentKey: "DECLARATION_VERIFICATION",
    departmentLabel: "Declaration Verification",
    question:
      "Is the declared information true, accurate, and consistent with the actual establishment and approved clearances?",
  },
];

export const JIT_CHECKLIST_RESPONSE_OPTIONS: Array<{ value: JitChecklistResponseValue; label: string }> = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
];

export interface ChecklistItemInput {
  departmentKey: JitChecklistDepartmentKey;
  response: JitChecklistResponseValue;
  remarks?: string;
  evidence?: {
    fileName: string;
    storagePath: string;
    bucket?: string;
    mimeType: string;
    sizeBytes: number;
  };
}

export function isValidChecklistDepartmentKey(value: string): value is JitChecklistDepartmentKey {
  return JIT_POST_AUDIT_CHECKLIST_ITEMS.some((item) => item.departmentKey === value);
}

export function isValidChecklistResponse(value: string): value is JitChecklistResponseValue {
  return value === "YES" || value === "NO";
}

export function parseChecklistPayload(raw: unknown): ChecklistItemInput[] {
  if (!Array.isArray(raw)) {
    throw new Error("checklist must be an array");
  }

  if (raw.length !== JIT_POST_AUDIT_CHECKLIST_ITEMS.length) {
    throw new Error(`checklist must include all ${JIT_POST_AUDIT_CHECKLIST_ITEMS.length} department responses`);
  }

  const seen = new Set<JitChecklistDepartmentKey>();
  const parsed: ChecklistItemInput[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each checklist entry must be an object");
    }

    const departmentKey = (entry as { departmentKey?: string }).departmentKey;
    const response = (entry as { response?: string }).response;
    const remarks = (entry as { remarks?: string }).remarks;

    if (!departmentKey || !isValidChecklistDepartmentKey(departmentKey)) {
      throw new Error("Invalid checklist departmentKey");
    }

    if (seen.has(departmentKey)) {
      throw new Error(`Duplicate checklist response for ${departmentKey}`);
    }
    seen.add(departmentKey);

    if (!response || !isValidChecklistResponse(response)) {
      throw new Error(`Invalid checklist response for ${departmentKey}`);
    }

    parsed.push({
      departmentKey,
      response,
      remarks: typeof remarks === "string" && remarks.trim().length > 0 ? remarks.trim() : undefined,
    });
  }

  for (const template of JIT_POST_AUDIT_CHECKLIST_ITEMS) {
    if (!seen.has(template.departmentKey)) {
      throw new Error(`Missing checklist response for ${template.departmentKey}`);
    }
  }

  return parsed;
}

export function getChecklistQuestionForDepartment(departmentKey: JitChecklistDepartmentKey): string {
  return JIT_POST_AUDIT_CHECKLIST_ITEMS.find((item) => item.departmentKey === departmentKey)?.question ?? "";
}

export interface ChecklistItemReadOnlyApiRow {
  id: string;
  inspectionChecklistItemId: string;
  departmentKey: string;
  departmentLabel: string;
  question: string;
  response: string;
  responseLabel: string;
  remarks: string | null;
  evidenceFileName: string | null;
  evidenceMimeType: string | null;
  hasEvidence: boolean;
}

export function formatChecklistItemsForReadOnlyApi(
  checklistItems: Array<{
    id?: string;
    inspectionChecklistItemId?: string;
    departmentKey: string;
    question: string;
    response: string;
    remarks: string | null;
    evidenceFileName: string | null;
    evidenceMimeType?: string | null;
    evidenceStoragePath?: string | null;
  }>
): ChecklistItemReadOnlyApiRow[] {
  return checklistItems.map((item) => {
    const template = JIT_POST_AUDIT_CHECKLIST_ITEMS.find((entry) => entry.departmentKey === item.departmentKey);
    const itemId = item.inspectionChecklistItemId ?? item.id ?? "";

    const responseLabel = (() => {
      switch (item.response) {
        case "YES": return "Yes";
        case "NO": return "No";
        // Legacy responses — preserved for historical display
        case "COMPLIANT": return "Yes";
        case "NON_COMPLIANT": return "No";
        case "NOT_APPLICABLE": return "Not Applicable — Legacy Response";
        default: return item.response;
      }
    })();

    return {
      id: itemId,
      inspectionChecklistItemId: itemId,
      departmentKey: item.departmentKey,
      departmentLabel: template?.departmentLabel ?? item.departmentKey,
      question: item.question,
      response: item.response,
      responseLabel,
      remarks: item.remarks,
      evidenceFileName: item.evidenceFileName,
      evidenceMimeType: item.evidenceMimeType ?? null,
      hasEvidence: Boolean(item.evidenceStoragePath ?? item.evidenceFileName),
    };
  });
}
