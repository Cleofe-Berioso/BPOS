"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoBanner } from "@/components/ui/info-banner";
import { SectionCard } from "@/components/ui/section-card";
import { actionButtonStyles } from "@/components/ui/action-button";
import { LoadingState } from "@/components/ui/loading-state";
import {
  dhPanelClass,
  dhSelectableCardActiveClass,
  dhSelectableCardClass,
  dhSelectableCardIdleClass,
  dhSummaryLabelClass,
  dhSummaryTileClass,
  dhSummaryValueClass,
} from "@/components/department-head/department-head-ui-styles";


type CompliantListRow = {
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
  jitComment: string | null;
  inspectionDate: string;
  verifiedAt: string;
  verifiedBy: string;
  evidenceFileName: string | null;
  evidenceMimeType: string | null;
  hasEvidence: boolean;
  inspectionStatus: string;
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function CompliantListClient() {
  const [rows, setRows] = useState<CompliantListRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const selected = useMemo(() => rows.find((row) => row.inspectionId === selectedId) ?? null, [rows, selectedId]);

  async function loadRows() {
    setLoading(true);
    const response = await fetch("/api/department-head/compliant-list", { cache: "no-store" });
    const data = (await response.json()) as { rows?: CompliantListRow[]; error?: string };

    if (!response.ok) {
      setMessage(data.error ?? "Unable to load compliant list.");
      setRows([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }

    const nextRows = data.rows ?? [];
    setRows(nextRows);
    setSelectedId((current) => {
      if (current && nextRows.some((row) => row.inspectionId === current)) return current;
      return nextRows[0]?.inspectionId ?? null;
    });
    setLoading(false);
  }

  useEffect(() => {
    void loadRows();
  }, []);

  return (
    <div className="ui-split-workspace">
      <SectionCard
        fill
        title="Compliant Inspections"
        description="VERIFIED_COMPLIANT only"
        contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
      >
        {loading ? (
          <LoadingState message="Loading compliant list…" compact />
        ) : rows.length === 0 ? (
          <EmptyState title="No compliant inspections yet" description="Verified compliant inspections will appear here after Department Head verification." />
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
                  <p className="mt-1 ui-caption">Status: {row.inspectionStatus}</p>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        fill
        title="Compliant Details"
        description={selected ? `${selected.applicationNumber} • ${selected.businessName}` : "Select a compliant inspection."}
        contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
      >
        {message ? (
          <InfoBanner title="Load issue" description={message} variant="danger" />
        ) : null}

        {!selected ? (
          <EmptyState title="No selected inspection" description="Choose one inspection from the list." />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                <p className={dhSummaryLabelClass}>JIT Comment / Remarks</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{selected.jitComment ?? "No comment provided."}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Date Inspected</p>
                <p className={dhSummaryValueClass}>{formatDateTime(selected.inspectionDate)}</p>
              </div>
              <div className={dhSummaryTileClass}>
                <p className={dhSummaryLabelClass}>Date Verified</p>
                <p className={dhSummaryValueClass}>{formatDateTime(selected.verifiedAt)}</p>
              </div>
              <div className={`${dhSummaryTileClass} md:col-span-2 xl:col-span-3`}>
                <p className={dhSummaryLabelClass}>Verified By</p>
                <p className={dhSummaryValueClass}>{selected.verifiedBy}</p>
              </div>
            </div>

            <SectionCard title="Uploaded Evidence / Photo" description="Read-only evidence attached to the compliant inspection.">
              {!selected.hasEvidence ? (
                <div className="text-sm text-[var(--ink-muted)]">No evidence file attached.</div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-[var(--foreground)]">{selected.evidenceFileName ?? "Evidence file"}</p>
                  {selected.evidenceMimeType?.startsWith("image/") ? (
                    <img
                      src={`/api/department-head/inspection-verification/${selected.inspectionId}/evidence`}
                      alt="Compliant inspection evidence"
                      className="max-h-72 w-full rounded-[var(--radius-card)] border border-[var(--border-color)] object-contain"
                    />
                  ) : null}
                  <a
                    href={`/api/department-head/inspection-verification/${selected.inspectionId}/evidence`}
                    target="_blank"
                    rel="noreferrer"
                    className={actionButtonStyles("secondary", "sm")}
                  >
                    Open Evidence File
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </div>
              )}
            </SectionCard>

            <div className={`${dhPanelClass} border-dashed px-4 py-3`}>
              Status: <span className="font-semibold">VERIFIED_COMPLIANT</span>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}