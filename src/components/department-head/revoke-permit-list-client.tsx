"use client";

import { useEffect, useMemo, useState } from "react";
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
import { PaginationControls } from "@/components/ui/pagination-controls";
import type { PaginationPageSize } from "@/lib/pagination";

type RevokedPermitRow = {
  inspectionId: string;
  businessRecordId: string;
  applicationId: string;
  applicationNumber: string;
  permitOrCertificateNumber: string | null;
  businessName: string;
  ownerName: string;
  applicantName: string;
  businessAddress: string;
  lineOfBusiness: string;
  jitInspectionDate: string;
  jitInspectorName: string;
  jitComment: string | null;
  revocationRemarks: string | null;
  revocationDecisionDate: string;
  decidedByName: string;
  evidenceFileName: string | null;
  evidenceMimeType: string | null;
  hasEvidence: boolean;
  inspectionStatus: string;
  applicationStatus: string;
  businessStatus: string;
  revocationSettledAt: string | null;
  revocationSettledBy: string | null;
  revocationSettlementRemarks: string | null;
  isSettled: boolean;
};

function formatDateTime(value: string): string {
  if (!value || value === "-") return "-";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function RevokePermitListClient() {
  const [rows, setRows] = useState<RevokedPermitRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "error"; text: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const selected = useMemo(
    () => rows.find((row) => row.inspectionId === selectedId) ?? null,
    [rows, selectedId]
  );

  async function loadRows(next?: { page?: number; pageSize?: PaginationPageSize }) {
    const nextPage = next?.page ?? page;
    const nextPageSize = next?.pageSize ?? pageSize;

    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(nextPageSize),
      });
      const response = await fetch(`/api/department-head/revoke-permit-list?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        records?: RevokedPermitRow[];
        rows?: RevokedPermitRow[];
        totalCount?: number;
        page?: number;
        pageSize?: PaginationPageSize;
        totalPages?: number;
        error?: string;
      };

      if (!response.ok) {
        setMessage({ type: "error", text: data.error ?? "Unable to load revoked permit list." });
        setRows([]);
        setSelectedId(null);
        setTotalCount(0);
        setTotalPages(1);
        setLoading(false);
        return;
      }

      const nextRows = data.records ?? data.rows ?? [];
      setRows(nextRows);
      setTotalCount(data.totalCount ?? nextRows.length);
      setPage(data.page ?? nextPage);
      setPageSize(data.pageSize ?? nextPageSize);
      setTotalPages(data.totalPages ?? 1);
      setSelectedId((current) => {
        if (current && nextRows.some((row) => row.inspectionId === current)) return current;
        return nextRows[0]?.inspectionId ?? null;
      });
      setMessage(null);
    } catch {
      setMessage({ type: "error", text: "Unable to load revoked permit list." });
      setRows([]);
      setSelectedId(null);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  return (
    <div className="ui-split-workspace">
      <SectionCard
        fill
        title="Restricted Businesses"
        description="Approved revocations"
        contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
      >
        {loading ? (
          <LoadingState message="Loading restricted businesses…" compact />
        ) : rows.length === 0 ? (
          <div className={dhPanelClass}>No restricted businesses found.</div>
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
                  <p className="font-mono ui-caption">{row.applicationNumber}</p>
                  <p className={dhSummaryValueClass}>{row.businessName}</p>
                  <p className="mt-1 ui-caption">Decision: {formatDateTime(row.revocationDecisionDate)}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--danger)]">
                      {row.inspectionStatus}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        row.isSettled
                          ? "bg-[var(--success-soft)] text-[var(--success)]"
                          : "bg-[var(--warning-soft)] text-[var(--warning)]"
                      }`}
                    >
                      {row.isSettled ? "Settled" : "Unsettled"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-3">
          <PaginationControls
            basePath="/department-head/revoke-permit-list"
            queryParams={{}}
            mode="client"
            isLoading={loading}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            recordLabel="businesses"
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
        title="Restriction Details"
        description={selected ? `${selected.applicationNumber} • ${selected.businessName}` : "Select a restricted business."}
        contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
      >
        {!selected ? (
          <EmptyState title="No selected record" description="Choose a restricted business from the list." />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                <p className="mt-1 text-sm text-[var(--foreground)]">{formatDateTime(selected.jitInspectionDate)}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>JIT Inspector Portal</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.jitInspectorName}</p>
              </div>
              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>JIT Comment</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.jitComment ?? "No comment provided."}</p>
              </div>
              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>Department Head Revocation Remarks</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">
                  {selected.revocationRemarks ?? "No remarks recorded."}
                </p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Revocation Decision Date</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">
                  {formatDateTime(selected.revocationDecisionDate)}
                </p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Decided By</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.decidedByName}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Current Status</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">Application: {selected.applicationStatus}</p>
                <p className="ui-caption">Business: {selected.businessStatus}</p>
                <p className="ui-caption">Settlement: {selected.isSettled ? "Settled" : "Unsettled"}</p>
              </div>
              {selected.isSettled ? (
                <div className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-3 md:col-span-2 xl:col-span-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--success)]">Settlement Details</p>
                  <p className="mt-1 text-sm text-[var(--success)]">
                    Settled at: {selected.revocationSettledAt ? formatDateTime(selected.revocationSettledAt) : "-"}
                  </p>
                  <p className="text-xs text-[var(--success)]">
                    Settled by: {selected.revocationSettledBy ?? "Unknown"}
                  </p>
                  <p className="mt-2 text-sm text-[var(--success)]">
                    {selected.revocationSettlementRemarks ?? "No settlement remarks recorded."}
                  </p>
                </div>
              ) : null}
            </div>

            <SectionCard title="Evidence" description="Read-only evidence attached during JIT inspection.">
              {!selected.hasEvidence ? (
                <div className="text-sm text-[var(--ink-muted)]">No evidence file attached.</div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--ink-muted)]">{selected.evidenceFileName ?? "Evidence"}</p>
                  {selected.evidenceMimeType?.startsWith("image/") ? (
                    <img
                      src={`/api/department-head/permit-to-revoke/${selected.inspectionId}/evidence`}
                      alt="Revoked permit inspection evidence"
                      className="max-h-72 w-full rounded-[var(--radius-card)] border border-[var(--border-color)] object-contain"
                    />
                  ) : null}
                  <a
                    href={`/api/department-head/permit-to-revoke/${selected.inspectionId}/evidence`}
                    target="_blank"
                    rel="noreferrer"
                    className={actionButtonStyles("secondary", "sm")}
                  >
                    Open Evidence File
                  </a>
                </div>
              )}
            </SectionCard>


          </div>
        )}

        {message ? (
          <div className="mt-4">
            <InfoBanner title="Load failed" description={message.text} variant="danger" />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
