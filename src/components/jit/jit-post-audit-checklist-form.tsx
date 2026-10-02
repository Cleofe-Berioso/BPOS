"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  jitChecklistCardClass,
  jitFormControlClass,
  jitSummaryLabelClass,
} from "@/components/jit/jit-ui-styles";
import { SectionCard } from "@/components/ui/section-card";
import {
  JIT_CHECKLIST_RESPONSE_OPTIONS,
  JIT_POST_AUDIT_CHECKLIST_ITEMS,
  type JitChecklistDepartmentKey,
  type JitChecklistResponseValue,
} from "@/lib/jit-post-audit-checklist";

export interface ChecklistDraftItem {
  response: JitChecklistResponseValue | "";
  remarks: string;
  evidenceFile: File | null;
}

export type ChecklistDraftState = Record<JitChecklistDepartmentKey, ChecklistDraftItem>;

export function createEmptyChecklistDraft(): ChecklistDraftState {
  return JIT_POST_AUDIT_CHECKLIST_ITEMS.reduce<ChecklistDraftState>((acc, item) => {
    acc[item.departmentKey] = { response: "", remarks: "", evidenceFile: null };
    return acc;
  }, {} as ChecklistDraftState);
}

export function isChecklistComplete(draft: ChecklistDraftState): boolean {
  return JIT_POST_AUDIT_CHECKLIST_ITEMS.every((item) => {
    const entry = draft[item.departmentKey];
    if (!entry || !entry.response) return false;
    if (entry.response === "NO") {
      return Boolean(entry.remarks.trim()) && Boolean(entry.evidenceFile);
    }
    return true;
  });
}

export function validateChecklistDraft(draft: ChecklistDraftState): string | null {
  for (const item of JIT_POST_AUDIT_CHECKLIST_ITEMS) {
    const entry = draft[item.departmentKey];
    if (!entry || !entry.response) {
      return `Please answer Yes or No for ${item.departmentLabel}.`;
    }
    if (entry.response === "NO") {
      const missingFindings = !entry.remarks.trim();
      const missingEvidence = !entry.evidenceFile;
      if (missingFindings && missingEvidence) {
        return `Findings and Evidence are required for ${item.departmentLabel} when No is selected.`;
      }
      if (missingFindings) {
        return `Findings are required for ${item.departmentLabel} when No is selected.`;
      }
      if (missingEvidence) {
        return `Evidence is required for ${item.departmentLabel} when No is selected.`;
      }
    }
  }
  return null;
}

export function JitPostAuditChecklistForm({
  draft,
  onChange,
  disabled,
}: {
  draft: ChecklistDraftState;
  onChange: (next: ChecklistDraftState) => void;
  disabled?: boolean;
}) {
  const [expandedItems, setExpandedItems] = useState<Set<JitChecklistDepartmentKey>>(new Set());

  function updateItem(departmentKey: JitChecklistDepartmentKey, patch: Partial<ChecklistDraftItem>) {
    onChange({
      ...draft,
      [departmentKey]: {
        ...draft[departmentKey],
        ...patch,
      },
    });
  }

  function toggleExpand(departmentKey: JitChecklistDepartmentKey) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(departmentKey)) {
        next.delete(departmentKey);
      } else {
        next.add(departmentKey);
      }
      return next;
    });
  }

  return (
    <SectionCard
      title="Post-Audit Checklist"
      description="Answer Yes or No for each department. When No is selected, Findings and Evidence are required."
    >
      <div className="space-y-2">
        {JIT_POST_AUDIT_CHECKLIST_ITEMS.map((item) => {
          const entry = draft[item.departmentKey];
          const isNo = entry.response === "NO";
          const isExpanded = expandedItems.has(item.departmentKey) || isNo;
          const hasRemarksOrEvidence = Boolean(entry.remarks.trim() || entry.evidenceFile);

          return (
            <article key={item.departmentKey} className={jitChecklistCardClass}>
              {/* Compact header: department + question + response radios */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className={`${jitSummaryLabelClass} text-[var(--primary)]`}>
                    {item.departmentLabel}
                  </p>
                  <p className="mt-1 text-sm text-[var(--foreground)]">{item.question}</p>
                </div>

                {/* Yes / No touch-friendly segmented pill buttons */}
                <div className="grid w-full grid-cols-2 gap-2 pt-1 sm:ml-4 sm:flex sm:w-auto sm:shrink-0 sm:items-center sm:pt-1">
                  {JIT_CHECKLIST_RESPONSE_OPTIONS.map((option) => {
                    const isChecked = entry.response === option.value;
                    const isYes = option.value === "YES";
                    return (
                      <label
                        key={option.value}
                        className={`inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-all sm:min-h-[34px] sm:min-w-[64px] sm:py-1.5 ${
                          isChecked
                            ? isYes
                              ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)] font-semibold shadow-xs"
                              : "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)] font-semibold shadow-xs"
                            : "border-[var(--border-color)] bg-[var(--surface)] text-[var(--ink-muted)] hover:border-[var(--primary)]/40 hover:bg-[var(--muted-surface)]"
                        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
                      >
                        <input
                          type="radio"
                          name={`checklist-${item.departmentKey}`}
                          disabled={disabled}
                          checked={isChecked}
                          onChange={() => {
                            updateItem(item.departmentKey, {
                              response: option.value,
                            });
                            if (option.value === "NO") {
                              setExpandedItems((prev) => new Set(prev).add(item.departmentKey));
                            }
                          }}
                          className="sr-only"
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Expandable / Required findings & evidence section */}
              <div className="mt-2">
                {isNo ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-[var(--danger)]">
                      Required: Findings & Evidence
                    </span>
                    {entry.remarks.trim() && entry.evidenceFile ? (
                      <span className="rounded-md bg-[var(--success-soft)] px-2 py-0.5 font-medium text-[var(--success)]">
                        ✓ Provided
                      </span>
                    ) : (
                      <span className="rounded-md bg-[var(--danger-soft)] px-2 py-0.5 font-medium text-[var(--danger)]">
                        Incomplete
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.departmentKey)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 py-1 text-xs font-medium text-[var(--primary)] hover:underline active:opacity-75"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    {hasRemarksOrEvidence
                      ? "Findings / evidence added"
                      : "Add findings or evidence (optional)"}
                  </button>
                )}

                {isExpanded && (
                  <div className="mt-2 grid gap-3 lg:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`checklist-remarks-${item.departmentKey}`}
                        className="mb-1 block text-xs font-medium text-[var(--foreground)]"
                      >
                        Findings{" "}
                        {isNo ? (
                          <span className="text-[var(--danger)] font-bold">* (Required)</span>
                        ) : (
                          <span className="text-xs font-normal text-[var(--ink-muted)]">(optional)</span>
                        )}
                      </label>
                      <textarea
                        id={`checklist-remarks-${item.departmentKey}`}
                        disabled={disabled}
                        rows={2}
                        value={entry.remarks}
                        onChange={(event) =>
                          updateItem(item.departmentKey, { remarks: event.target.value })
                        }
                        className={`${jitFormControlClass} ${
                          isNo && !entry.remarks.trim()
                            ? "border-[var(--danger)] focus:border-[var(--danger)]"
                            : ""
                        }`}
                        placeholder={
                          isNo
                            ? "Required: describe non-compliance findings and observations"
                            : "Optional findings or remarks"
                        }
                        required={isNo}
                      />
                      {isNo && !entry.remarks.trim() ? (
                        <p className="mt-1 text-[11px] font-medium text-[var(--danger)]">
                          Findings are required when No is selected.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label
                        htmlFor={`checklist-evidence-${item.departmentKey}`}
                        className="mb-1 block text-xs font-medium text-[var(--foreground)]"
                      >
                        Evidence{" "}
                        {isNo ? (
                          <span className="text-[var(--danger)] font-bold">* (Required)</span>
                        ) : (
                          <span className="text-xs font-normal text-[var(--ink-muted)]">(optional)</span>
                        )}
                      </label>
                      <input
                        id={`checklist-evidence-${item.departmentKey}`}
                        type="file"
                        disabled={disabled}
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) =>
                          updateItem(item.departmentKey, {
                            evidenceFile: event.target.files?.[0] ?? null,
                          })
                        }
                        className={`${jitFormControlClass} ${
                          isNo && !entry.evidenceFile
                            ? "border-[var(--danger)] focus:border-[var(--danger)]"
                            : ""
                        }`}
                        required={isNo}
                      />
                      {isNo && !entry.evidenceFile ? (
                        <p className="mt-1 text-[11px] font-medium text-[var(--danger)]">
                          Photo or PDF evidence is required when No is selected.
                        </p>
                      ) : entry.evidenceFile ? (
                        <p className="mt-1 text-[11px] font-medium text-[var(--success)] break-all">
                          Selected: {entry.evidenceFile.name}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                          Accepted: JPG, PNG, WEBP, PDF
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
