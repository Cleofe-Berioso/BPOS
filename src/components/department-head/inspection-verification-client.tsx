"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { actionButtonStyles } from "@/components/ui/action-button";
import { LoadingState } from "@/components/ui/loading-state";
import {
  dhDocumentListItemClass,
  dhFormControlClass,
  dhPanelClass,
  dhSelectableCardActiveClass,
  dhSelectableCardClass,
  dhSelectableCardIdleClass,
  dhSummaryLabelClass,
  dhSummaryTileClass,
  dhSummaryValueClass,
} from "@/components/department-head/department-head-ui-styles";

import { EmptyState } from "@/components/ui/empty-state";
import { InfoBanner } from "@/components/ui/info-banner";
import { SectionCard } from "@/components/ui/section-card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import type { ChecklistItemReadOnlyApiRow } from "@/lib/jit-post-audit-checklist";
import { DEFAULT_PAGE_SIZE, type PaginationPageSize } from "@/lib/pagination";

type InspectionVerificationRow = {
  inspectionId: string;
  businessRecordId: string;
  applicationId: string;
  applicationNumber: string;
  permitOrCertificateNumber: string | null;
  businessName: string;
  tradeName: string | null;
  ownerName: string;
  applicantName: string;
  businessAddress: string;
  businessType: string;
  lineOfBusiness: string;
  inspectionDate: string;
  inspectorName: string;
  inspectionStatus: string;
  complianceStatus: "PENDING_REVIEW" | "COMPLIANT" | "NON_COMPLIANT";
  inspectorComment: string | null;
  evidenceFileName: string | null;
  evidenceMimeType: string | null;
  hasEvidence: boolean;
  applicationStatus: string;
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

const NON_COMPLIANCE_TYPE_OPTIONS = [
  { value: "GOVERNMENT_AGENCY_RELATED", label: "Government Agency Related" },
  { value: "RENEWAL_RELATED", label: "Renewal Related" },
];

const VIOLATION_SEVERITY_OPTIONS = [
  { value: "MINOR", label: "Minor" },
  { value: "MAJOR", label: "Major" },
  { value: "SEVERE", label: "Severe" },
];

const HELPER_TEXT = {
  GOVERNMENT_AGENCY_RELATED: "Minor or major cases may be flagged for settlement. Severe cases may require forced closure processing.",
  RENEWAL_RELATED: "Renewal may continue later, but renewal-related penalties or fees may apply during assessment.",
};

function InspectionChecklistReadOnlyPanel({
  inspectionId,
  items,
  loading,
  error,
}: {
  inspectionId: string;
  items: ChecklistItemReadOnlyApiRow[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <SectionCard title="JIT Post-Audit Checklist" description="Submitted department checklist responses from the JIT inspection.">
        <LoadingState message="Loading post-audit checklist…" compact />
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="JIT Post-Audit Checklist" description="Submitted department checklist responses from the JIT inspection.">
        <InfoBanner title="Checklist unavailable" description={error} variant="danger" />
      </SectionCard>
    );
  }

  if (items.length === 0) {
    return (
      <SectionCard title="JIT Post-Audit Checklist" description="Submitted department checklist responses from the JIT inspection.">
        <div className="text-sm text-[var(--ink-muted)]">No post-audit checklist was submitted for this inspection.</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="JIT Post-Audit Checklist"
      description="Read-only view of all 8 department responses submitted by JIT."
    >
      <div className="space-y-3">
        {items.map((item) => {
          const evidenceUrl = `/api/department-head/inspection-verification/${inspectionId}/checklist/${item.id}/evidence`;

          return (
            <article key={item.id} className={dhDocumentListItemClass}>
              <p className="text-sm font-semibold text-[var(--primary)]">{item.departmentLabel}</p>
              <p className="mt-2 text-sm text-[var(--foreground)]">{item.question}</p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className={dhSummaryTileClass}>
                  <p className={dhSummaryLabelClass}>Response</p>
                  <p className={dhSummaryValueClass}>{item.responseLabel}</p>
                </div>
                <div className={dhSummaryTileClass}>
                  <p className={dhSummaryLabelClass}>Remarks</p>
                  <p className="mt-1 text-sm text-[var(--foreground)]">{item.remarks?.trim() || "None"}</p>
                </div>
              </div>

              {item.hasEvidence ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <p className="w-full text-sm font-medium text-[var(--foreground)]">
                    {item.evidenceFileName ?? "Checklist evidence"}
                  </p>
                  <a
                    href={evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={actionButtonStyles("secondary", "sm")}
                  >
                    View Evidence
                  </a>
                </div>
              ) : (
                <p className="mt-3 ui-caption">No optional evidence uploaded for this item.</p>
              )}
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}

export function DepartmentHeadInspectionVerificationClient() {
  const [rows, setRows] = useState<InspectionVerificationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [nonComplianceType, setNonComplianceType] = useState("");
  const [violationSeverity, setViolationSeverity] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItemReadOnlyApiRow[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [complianceDecision, setComplianceDecision] = useState<"COMPLIANT" | "NON_COMPLIANT" | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const selected = useMemo(
    () => rows.find((row) => row.inspectionId === selectedId) ?? null,
    [rows, selectedId]
  );

  const isPendingReview = selected?.complianceStatus === "PENDING_REVIEW";
  const effectiveCompliance = isPendingReview ? complianceDecision : selected?.complianceStatus;
  const isNonCompliant = effectiveCompliance === "NON_COMPLIANT";

  const loadQueue = useCallback(async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(nextPageSize),
    });
    const response = await fetch(
      `/api/department-head/inspection-verification?${params.toString()}`,
      { cache: "no-store" }
    );
    const data = (await response.json()) as {
      rows?: InspectionVerificationRow[];
      records?: InspectionVerificationRow[];
      totalCount?: number;
      page?: number;
      pageSize?: PaginationPageSize;
      totalPages?: number;
      error?: string;
    };

    if (!response.ok) {
      setMessage({ type: "error", text: data.error ?? "Unable to load inspection verification queue." });
      setRows([]);
      setSelectedId(null);
      setTotalCount(0);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    const nextRows = data.rows ?? data.records ?? [];
    const nextTotalCount = data.totalCount ?? nextRows.length;
    const resolvedPage = data.page ?? nextPage;

    if (nextRows.length === 0 && resolvedPage > 1 && nextTotalCount > 0) {
      setLoading(false);
      setPage(resolvedPage - 1);
      return;
    }

    setRows(nextRows);
    setTotalCount(nextTotalCount);
    setPage(resolvedPage);
    setPageSize(data.pageSize ?? nextPageSize);
    setTotalPages(data.totalPages ?? 1);
    setSelectedId((current) => {
      if (current && nextRows.some((row) => row.inspectionId === current)) return current;
      return nextRows[0]?.inspectionId ?? null;
    });
    setLoading(false);
  }, [page, pageSize]);

  useEffect(() => {
    void loadQueue(page, pageSize);
  }, [page, pageSize, loadQueue]);

  // Reset classification fields when selection changes
  useEffect(() => {
    setNonComplianceType("");
    setViolationSeverity("");
    setRemarks("");
    setComplianceDecision("");
    setMessage(null);
    setEvidenceOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setChecklistItems([]);
      setChecklistLoading(false);
      setChecklistError(null);
      return;
    }

    let active = true;

    async function loadChecklist() {
      setChecklistLoading(true);
      setChecklistError(null);

      const response = await fetch(
        `/api/department-head/inspection-verification/${selectedId}/checklist`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as {
        items?: ChecklistItemReadOnlyApiRow[];
        error?: string;
      };

      if (!active) return;

      if (!response.ok) {
        setChecklistItems([]);
        setChecklistError(data.error ?? "Unable to load post-audit checklist.");
        setChecklistLoading(false);
        return;
      }

      setChecklistItems(data.items ?? []);
      setChecklistLoading(false);
    }

    void loadChecklist();

    return () => {
      active = false;
    };
  }, [selectedId]);

  const selectedEvidenceUrl = selected ? `/api/department-head/inspection-verification/${selected.inspectionId}/evidence` : "";
  const selectedEvidenceFileName = selected?.evidenceFileName ?? "";
  const selectedEvidenceIsImage = Boolean(selected?.evidenceMimeType?.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(selectedEvidenceFileName));
  const selectedEvidenceIsPdf = Boolean(selected?.evidenceMimeType === "application/pdf" || /\.pdf$/i.test(selectedEvidenceFileName));

  async function handleVerify() {
    if (!selected) return;

    if (!remarks.trim()) {
      setMessage({ type: "error", text: "Verification remarks are required." });
      return;
    }

    // Validate classification fields for NON_COMPLIANT
    if (isPendingReview && !complianceDecision) {
      setMessage({ type: "error", text: "Compliance decision is required for Pending Review inspections." });
      return;
    }

    if (isNonCompliant) {
      if (!nonComplianceType) {
        setMessage({ type: "error", text: "Non-compliance type is required for non-compliant inspections." });
        return;
      }
      if (!violationSeverity) {
        setMessage({ type: "error", text: "Violation severity is required for non-compliant inspections." });
        return;
      }
    }

    if (!window.confirm(`Verify inspection for ${selected.businessName} as ${effectiveCompliance}?`)) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const response = await fetch(`/api/department-head/inspection-verification/${selected.inspectionId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remarks,
        nonComplianceType: isNonCompliant ? nonComplianceType : undefined,
        violationSeverity: isNonCompliant ? violationSeverity : undefined,
        complianceDecision: isPendingReview ? complianceDecision : undefined,
      }),
    });

    const data = (await response.json()) as {
      result?: { inspectionStatus: string; applicationStatus: string };
      error?: string;
    };

    if (!response.ok) {
      setMessage({ type: "error", text: data.error ?? "Verification failed." });
      setSubmitting(false);
      return;
    }

    setMessage({
      type: "success",
      text:
        selected.complianceStatus === "COMPLIANT"
          ? "COMPLIANT inspection verified. It is now ready for compliant processing."
          : "NON_COMPLIANT inspection verified. It is now routed to Flagged Cases.",
    });
    setRemarks("");
    setNonComplianceType("");
    setViolationSeverity("");
    setComplianceDecision("");
    setSubmitting(false);
    await loadQueue(page, pageSize);
  }

  return (
    <div className="ui-split-workspace">
      <SectionCard
        fill
        title="Verification Queue"
        description="DH_VERIFICATION_PENDING only"
        contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
      >
        {loading ? (
          <LoadingState message="Loading verification queue…" compact />
        ) : rows.length === 0 ? (
          <EmptyState title="No inspections awaiting verification" description="JIT inspections will appear here after submission." />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const active = selectedId === row.inspectionId;
              return (
                <button
                  key={row.inspectionId}
                  type="button"
                  onClick={() => setSelectedId(row.inspectionId)}
                  className={`${dhSelectableCardClass} ${active ? dhSelectableCardActiveClass : dhSelectableCardIdleClass}`}
                >
                  <p className="font-mono ui-caption">{row.applicationNumber}</p>
                  <p className={dhSummaryValueClass}>{row.tradeName ? `${row.businessName} / ${row.tradeName}` : row.businessName}</p>
                  <p className="mt-1 ui-caption">Result: {row.complianceStatus === "PENDING_REVIEW" ? "Pending Review" : row.complianceStatus}</p>
                  <p className="mt-1 ui-caption">Inspector: {row.inspectorName}</p>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-3">
          <PaginationControls
            basePath="/department-head/inspection-verification"
            queryParams={{}}
            mode="client"
            isLoading={loading}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            recordLabel="inspections"
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
          />
        </div>
      </SectionCard>

      <SectionCard
        fill
        title="Inspection Review"
        description={selected ? `${selected.applicationNumber} • ${selected.businessName}` : "Select an inspection to verify."}
        contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
      >
        {!selected ? (
          <EmptyState title="No selected inspection" description="Choose one inspection from the queue." />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Business Name / Trade Name</p>
                <p className={dhSummaryValueClass}>{selected.tradeName ? `${selected.businessName} / ${selected.tradeName}` : selected.businessName}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Permit No.</p>
                <p className={dhSummaryValueClass}>{selected.permitOrCertificateNumber ?? "N/A"}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Business Type</p>
                <p className={dhSummaryValueClass}>{selected.businessType}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Line of Business</p>
                <p className={dhSummaryValueClass}>{selected.lineOfBusiness}</p>
              </div>
              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>Owner / Applicant Name</p>
                <p className={dhSummaryValueClass}>{selected.ownerName} / {selected.applicantName}</p>
              </div>
              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>Business Address</p>
                <p className={dhSummaryValueClass}>{selected.businessAddress}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>JIT Result</p>
                <p className={dhSummaryValueClass}>{selected.complianceStatus === "PENDING_REVIEW" ? "Pending Review" : selected.complianceStatus}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Inspection Date</p>
                <p className={dhSummaryValueClass}>{formatDateTime(selected.inspectionDate)}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>JIT Inspector Portal</p>
                <p className={dhSummaryValueClass}>{selected.inspectorName}</p>
              </div>
              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>JIT Comment / Remarks</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.inspectorComment ?? "No comment provided."}</p>
              </div>
            </div>

            <InspectionChecklistReadOnlyPanel
              inspectionId={selected.inspectionId}
              items={checklistItems}
              loading={checklistLoading}
              error={checklistError}
            />

            <SectionCard title="Uploaded Evidence / Photo" description="Evidence attached to the JIT inspection.">
              {!selected.hasEvidence ? (
                <div className="text-sm text-[var(--ink-muted)]">No evidence uploaded.</div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-[var(--foreground)]">{selected.evidenceFileName ?? "Evidence file"}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEvidenceOpen(true)}
                      className={actionButtonStyles("secondary", "sm")}
                    >
                      View Evidence
                    </button>
                    <a
                      href={selectedEvidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={actionButtonStyles("secondary", "sm")}
                    >
                      Open in New Tab
                    </a>
                  </div>
                </div>
              )}
            </SectionCard>

            {selected?.hasEvidence && evidenceOpen ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
                <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">Evidence Preview</p>
                      <p className="ui-caption">{selected.evidenceFileName ?? "Uploaded evidence"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEvidenceOpen(false)}
                      className={actionButtonStyles("secondary", "sm")}
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-[calc(90vh-72px)] overflow-auto bg-[var(--muted-surface)] p-4">
                    {selectedEvidenceIsImage ? (
                      <img
                        src={selectedEvidenceUrl}
                        alt="Inspection evidence"
                        className="mx-auto max-h-[75vh] w-full max-w-full rounded-[var(--radius-card)] border border-[var(--border-color)] object-contain bg-[var(--surface)]"
                      />
                    ) : selectedEvidenceIsPdf ? (
                      <iframe
                        src={selectedEvidenceUrl}
                        title="Inspection evidence preview"
                        sandbox="allow-same-origin"
                        className="h-[75vh] w-full rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--surface)]"
                      />
                    ) : (
                      <div className={`${dhPanelClass} bg-[var(--surface)]`}>
                        Preview unavailable for this file type.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {isPendingReview && (
              <div className="space-y-2 rounded-xl border border-[var(--primary)] bg-[var(--info-soft)] p-4">
                <p className="text-sm font-medium text-[var(--foreground)]">Compliance Decision (Required)</p>
                <p className="ui-caption">JIT submitted this inspection without a compliance determination. Select the appropriate compliance status.</p>
                <select
                  id="compliance-decision"
                  value={complianceDecision}
                  onChange={(event) => {
                    setComplianceDecision(event.target.value as "COMPLIANT" | "NON_COMPLIANT" | "");
                    if (event.target.value !== "NON_COMPLIANT") {
                      setNonComplianceType("");
                      setViolationSeverity("");
                    }
                  }}
                  className={dhFormControlClass}
                >
                  <option value="">-- Select compliance status --</option>
                  <option value="COMPLIANT">Compliant</option>
                  <option value="NON_COMPLIANT">Non-Compliant</option>
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="verification-remarks">
                Verification Remarks
              </label>
              <textarea
                id="verification-remarks"
                className={dhFormControlClass}
                rows={3}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Enter verification remarks"
              />
            </div>

            {isNonCompliant && (
              <div className="space-y-4 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] p-4">
                <p className="text-sm font-medium text-[var(--foreground)]">Non-Compliance Classification</p>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="non-compliance-type">
                    Non-Compliance Type <span className="text-[var(--danger)]">*</span>
                  </label>
                  <select
                    id="non-compliance-type"
                    value={nonComplianceType}
                    onChange={(event) => {
                      setNonComplianceType(event.target.value);
                      setViolationSeverity("");
                    }}
                    className={dhFormControlClass}
                  >
                    <option value="">-- Select a type --</option>
                    {NON_COMPLIANCE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {nonComplianceType && (
                    <p className="ui-caption italic">{HELPER_TEXT[nonComplianceType as keyof typeof HELPER_TEXT]}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="violation-severity">
                    Violation Severity <span className="text-[var(--danger)]">*</span>
                  </label>
                  <select
                    id="violation-severity"
                    value={violationSeverity}
                    onChange={(event) => setViolationSeverity(event.target.value)}
                    disabled={!nonComplianceType}
                    className={dhFormControlClass}
                  >
                    <option value="">-- Select severity --</option>
                    {VIOLATION_SEVERITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={submitting}
                className={actionButtonStyles("primary", "sm")}
              >
                {submitting ? "Verifying…" : "Verify Inspection"}
              </button>
            </div>

            {message ? (
              <InfoBanner
                title={message.type === "success" ? "Verification completed" : "Verification blocked"}
                description={message.text}
                variant={message.type === "success" ? "success" : "danger"}
              />
            ) : null}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
