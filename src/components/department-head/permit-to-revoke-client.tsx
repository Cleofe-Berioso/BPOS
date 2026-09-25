"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { actionButtonStyles } from "@/components/ui/action-button";
import { LoadingState } from "@/components/ui/loading-state";
import {
  dhFormControlClass,
  dhPanelClass,
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
import { DEFAULT_PAGE_SIZE, type PaginationPageSize } from "@/lib/pagination";

type PermitToRevokeRow = {
  inspectionId: string;
  businessRecordId: string;
  applicationId: string;
  applicationNumber: string;
  permitOrCertificateNumber: string | null;
  businessName: string;
  tradeName: string | null;
  businessType: string;
  ownerName: string;
  applicantName: string;
  businessAddress: string;
  lineOfBusiness: string;
  inspectionDate: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  inspectorName: string;
  inspectorComment: string | null;
  evidenceFileName: string | null;
  evidenceMimeType: string | null;
  hasEvidence: boolean;
  inspectionStatus: string;
  applicationStatus: string;
};

type DecisionAction = "approve" | "deny";

function formatDateTime(value: string): string {
  if (!value || value === "-") return "-";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}


export function PermitToRevokeClient() {
  const [rows, setRows] = useState<PermitToRevokeRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<DecisionAction | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const selected = useMemo(
    () => rows.find((row) => row.inspectionId === selectedId) ?? null,
    [rows, selectedId]
  );

  const selectedEvidenceUrl = selected ? `/api/department-head/permit-to-revoke/${selected.inspectionId}/evidence` : "";
  const selectedEvidenceFileName = selected?.evidenceFileName ?? "";
  const selectedEvidenceIsImage = Boolean(selected?.evidenceMimeType?.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(selectedEvidenceFileName));
  const selectedEvidenceIsPdf = Boolean(selected?.evidenceMimeType === "application/pdf" || /\.pdf$/i.test(selectedEvidenceFileName));

  const loadQueue = useCallback(async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(nextPageSize),
    });
    const response = await fetch(`/api/department-head/permit-to-revoke?${params.toString()}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      rows?: PermitToRevokeRow[];
      records?: PermitToRevokeRow[];
      totalCount?: number;
      page?: number;
      pageSize?: PaginationPageSize;
      totalPages?: number;
      error?: string;
    };

    if (!response.ok) {
      setMessage({ type: "error", text: data.error ?? "Unable to load revocation review queue." });
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

  useEffect(() => {
    setEvidenceOpen(false);
  }, [selectedId]);

  async function runDecision(action: DecisionAction) {
    if (!selected) return;

    if (!remarks.trim()) {
      setMessage({ type: "error", text: "Remarks are required for approve or deny decision." });
      return;
    }

    setPendingAction(action);
    setMessage(null);

    let response: Response;
    try {
      response = await fetch(
        `/api/department-head/permit-to-revoke/${selected.inspectionId}/${action === "approve" ? "approve-revocation" : "deny-revocation"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remarks }),
        }
      );
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to update revocation status.",
      });
      setPendingAction(null);
      return;
    }

    const rawBody = await response.text();
    let data: {
      result?: { applicationNumber: string; applicationStatus: string };
      error?: string;
    } = {};

    if (rawBody) {
      try {
        data = JSON.parse(rawBody) as typeof data;
      } catch {
        data = { error: rawBody };
      }
    }

    if (!response.ok) {
      // Show the exact error reason returned by the API so the DH knows what to fix
      const reason = data.error ?? response.statusText ?? "Unable to process revocation decision.";
      setMessage({ type: "error", text: reason });
      setPendingAction(null);
      return;
    }

    const appNumber = data.result?.applicationNumber ?? "Application";
    const newStatus = data.result?.applicationStatus ?? "updated status";
    const successText =
      action === "approve"
        ? `Revocation approved successfully. ${appNumber} has been moved to ${newStatus}.`
        : `Revocation denied successfully. ${appNumber} has been restored to ${newStatus}.`;

    setMessage({ type: "success", text: successText });
    setRemarks("");
    setPendingAction(null);
    await loadQueue(page, pageSize);
  }

  return (
    <div className="ui-split-workspace">
      <SectionCard
        fill
        title="Flagged Cases"
        description="Ready for revocation decision"
        contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
      >
        {loading ? (
          <LoadingState message="Loading revocation queue…" compact />
        ) : rows.length === 0 ? (
          <div className={dhPanelClass}>
            No inspections are waiting for revocation decision.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const active = selectedId === row.inspectionId;
              return (
                <button
                  key={row.inspectionId}
                  type="button"
                  onClick={() => setSelectedId(row.inspectionId)}
                  className={`${dhSelectableCardClass} ${active ? "border-[var(--warning)] bg-[var(--warning-soft)]" : dhSelectableCardIdleClass}`}
                >
                  <p className="font-mono ui-caption">{row.applicationNumber}</p>
                  <p className={dhSummaryValueClass}>{row.tradeName ? `${row.businessName} / ${row.tradeName}` : row.businessName}</p>
                  <p className="mt-1 ui-caption">Inspector: {row.inspectorName}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--warning)]">{row.inspectionStatus}</p>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-3">
          <PaginationControls
            basePath="/department-head/permit-to-revoke"
            queryParams={{}}
            mode="client"
            isLoading={loading}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            recordLabel="flagged cases"
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
        title="Flagged Case Decision"
        description={selected ? `${selected.applicationNumber} • ${selected.businessName}` : "Select a flagged case."}
        contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
      >
        {!selected ? (
          <EmptyState title="No selected inspection" description="Choose an inspection from the queue." />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Business Name / Trade Name</p>
                <p className={dhSummaryValueClass}>{selected.tradeName ? `${selected.businessName} / ${selected.tradeName}` : selected.businessName}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Business Type</p>
                <p className={dhSummaryValueClass}>{selected.businessType}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Owner / Applicant</p>
                <p className={dhSummaryValueClass}>{selected.ownerName}</p>
                <p className="ui-caption">Applicant: {selected.applicantName}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Application / Permit</p>
                <p className={dhSummaryValueClass}>{selected.applicationNumber}</p>
                <p className="ui-caption">Permit: {selected.permitOrCertificateNumber ?? "N/A"}</p>
              </div>

              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>Business Address</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.businessAddress}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Line of Business</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.lineOfBusiness}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>JIT Inspection Date</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{formatDateTime(selected.inspectionDate)}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Date Verified</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.verifiedAt ? formatDateTime(selected.verifiedAt) : "Not available"}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Verified By</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.verifiedBy ?? "Not available"}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>JIT Inspector Portal</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.inspectorName}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Current Status</p>
                <p className={dhSummaryValueClass}>{selected.inspectionStatus}</p>
              </div>
              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>JIT Comment</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.inspectorComment ?? "No comment provided."}</p>
              </div>
            </div>

            <SectionCard title="Photo Evidence" description="Uploaded JIT evidence for this revocation review.">
              {!selected.hasEvidence ? (
                <div className="text-sm text-[var(--ink-muted)]">No evidence uploaded.</div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--ink-muted)]">{selected.evidenceFileName ?? "Evidence"}</p>
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

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="revocation-remarks">
                Department Head Remarks (required)
              </label>
              <textarea
                id="revocation-remarks"
                className={dhFormControlClass}
                rows={3}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Enter decision remarks"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runDecision("approve")}
                disabled={pendingAction !== null}
                className={actionButtonStyles("danger", "sm")}
              >
                {pendingAction === "approve" ? "Processing..." : "Approve Revocation"}
              </button>
              <button
                type="button"
                onClick={() => void runDecision("deny")}
                disabled={pendingAction !== null}
                className={actionButtonStyles("secondary", "sm")}
              >
                {pendingAction === "deny" ? "Processing..." : "Deny Revocation"}
              </button>
            </div>

            {message ? (
              <InfoBanner
                title={message.type === "success" ? "Decision completed" : "Approval failed"}
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
