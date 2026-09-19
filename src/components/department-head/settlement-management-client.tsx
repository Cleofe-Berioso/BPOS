"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { actionButtonStyles } from "@/components/ui/action-button";
import { LoadingState } from "@/components/ui/loading-state";
import {
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
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { DEFAULT_PAGE_SIZE, type PaginationPageSize } from "@/lib/pagination";

type SettlementRow = {
  inspectionId: string;
  businessRecordId: string;
  applicationId: string | null;
  applicationNumber: string | null;
  permitOrCertificateNumber: string | null;
  businessName: string;
  tradeName: string | null;
  ownerName: string;
  applicantName: string;
  businessAddress: string;
  lineOfBusiness: string;
  nonComplianceType: string | null;
  violationSeverity: string | null;
  complianceCaseStatus: string;
  inspectionRemarks: string | null;
  verificationRemarks: string | null;
  verifiedAt: string | null;
  deadlineAt: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value || value === "-") return "-";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function SettlementManagementClient() {
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "error"; text: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [remarksInput, setRemarksInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const selected = useMemo(() => rows.find((row) => row.inspectionId === selectedId) ?? null, [rows, selectedId]);

  const loadRows = useCallback(async (nextPage = page, nextPageSize = pageSize) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(nextPageSize),
      });
      const response = await fetch(`/api/department-head/settlement-management?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as {
        rows?: SettlementRow[];
        totalCount?: number;
        page?: number;
        pageSize?: PaginationPageSize;
        totalPages?: number;
        error?: string;
      };

      if (!response.ok) {
        setMessage({ type: "error", text: data.error ?? "Unable to load settlement cases." });
        setRows([]);
        setSelectedId(null);
        setTotalCount(0);
        setTotalPages(1);
        return;
      }

      const nextRows = data.rows ?? [];
      const nextTotalCount = data.totalCount ?? nextRows.length;
      const resolvedPage = data.page ?? nextPage;

      if (nextRows.length === 0 && resolvedPage > 1 && nextTotalCount > 0) {
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
      setMessage(null);
    } catch {
      setMessage({ type: "error", text: "Unable to load settlement cases." });
      setRows([]);
      setSelectedId(null);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void loadRows(page, pageSize);
  }, [page, pageSize, loadRows]);

  return (
    <div className="ui-split-workspace">
      <SectionCard
        fill
        title="Eligible Cases"
        description="Ready for settlement"
        contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
      >
        {loading ? (
          <LoadingState message="Loading eligible cases…" compact />
        ) : rows.length === 0 ? (
          <div className={dhPanelClass}>No eligible settlement cases found.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const active = selectedId === row.inspectionId;
              return (
                <button
                  key={row.inspectionId}
                  type="button"
                  onClick={() => setSelectedId(row.inspectionId)}
                  className={`${dhSelectableCardClass} ${active ? "border-[var(--danger)] bg-[var(--danger-soft)]" : dhSelectableCardIdleClass}`}
                >
                  <p className="font-mono ui-caption">{row.applicationNumber ?? row.inspectionId}</p>
                  <p className={dhSummaryValueClass}>{row.businessName}</p>
                  <p className="mt-1 ui-caption">{row.applicantName}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--warning)]">Flagged / Unsettled</span>
                    <span className="ui-caption">{row.violationSeverity ? row.violationSeverity : "-"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-3">
          <PaginationControls
            basePath="/department-head/settlement-management"
            queryParams={{}}
            mode="client"
            isLoading={loading}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            recordLabel="settlement cases"
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
        title="Case Details"
        description={selected ? `${selected.applicationNumber ?? selected.inspectionId} • ${selected.businessName}` : "Select a case from the list."}
        contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
      >
        {!selected ? (
          <EmptyState title="No selected case" description="Choose an eligible case from the list." />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Business Name</p>
                <p className={dhSummaryValueClass}>{selected.businessName}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Owner / Applicant</p>
                <p className={dhSummaryValueClass}>{selected.ownerName}</p>
                <p className="ui-caption">Applicant: {selected.applicantName}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Application / Permit</p>
                <p className={dhSummaryValueClass}>{selected.applicationNumber ?? "N/A"}</p>
                <p className="ui-caption">Permit: {selected.permitOrCertificateNumber ?? "N/A"}</p>
              </div>
              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>Business Address</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.businessAddress}</p>
              </div>

              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Severity</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.violationSeverity === "MINOR" ? "Minor" : selected.violationSeverity === "MAJOR" ? "Major" : "-"}</p>
              </div>

              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Case Status</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">Flagged / Unsettled</p>
              </div>

              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>Inspection Remarks</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.inspectionRemarks ?? "No comment provided."}</p>
              </div>

              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>Department Head Verification Remarks</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.verificationRemarks ?? "No remarks recorded."}</p>
              </div>

              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Verified Date</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{formatDateTime(selected.verifiedAt)}</p>
              </div>

              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Deadline</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{formatDateTime(selected.deadlineAt)}</p>
              </div>
            </div>

            <SectionCard title="Actions" description="Settle eligible cases here.">
              <p className="text-sm text-[var(--ink-muted)]">
                Only Minor or Major government-agency-related cases can be settled. Settling restores the permit for renewal.
                Severe revoked permits are not settled here — applicants may still file a business closure.
              </p>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className={actionButtonStyles("danger", "md")}
                  onClick={() => {
                    setRemarksInput("");
                    setIsModalOpen(true);
                  }}
                >
                  Mark as Settled
                </button>
              </div>

              <ConfirmModal
                open={isModalOpen}
                title="Mark as Settled"
                message="Provide settlement remarks (required)."
                confirmLabel="Confirm"
                cancelLabel="Cancel"
                variant="danger"
                loading={isSubmitting}
                onClose={() => setIsModalOpen(false)}
                onConfirm={async () => {
                  const remarks = remarksInput.trim();
                  if (!remarks) {
                    setMessage({ type: "error", text: "Settlement remarks are required." });
                    return;
                  }
                  if (!selected) return;
                  try {
                    setIsSubmitting(true);
                    const res = await fetch(`/api/department-head/settlement-management/${selected.inspectionId}/settle`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ settlementRemarks: remarks }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setMessage({ type: "error", text: data.error ?? "Unable to mark as settled." });
                      return;
                    }
                    setIsModalOpen(false);
                    await loadRows();
                    setMessage(null);
                  } catch (err) {
                    setMessage({ type: "error", text: "Unable to mark as settled." });
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                <textarea
                  aria-label="Settlement remarks"
                  value={remarksInput}
                  onChange={(e) => setRemarksInput(e.target.value)}
                  className="w-full rounded-md border p-2 text-sm"
                  rows={5}
                  placeholder="Enter settlement remarks"
                />
              </ConfirmModal>
            </SectionCard>
          </div>
        )}

        {message ? (
          <div className="mt-4">
            <InfoBanner title="Action failed" description={message.text} variant="danger" />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
