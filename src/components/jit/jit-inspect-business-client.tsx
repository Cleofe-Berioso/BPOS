"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Search, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  jitFormControlClass,
  jitSelectableCardActiveClass,
  jitSelectableCardClass,
  jitSelectableCardIdleClass,
  jitSummaryLabelClass,
  jitSummaryTileClass,
  jitSummaryValueClass,
} from "@/components/jit/jit-ui-styles";
import { actionButtonStyles } from "@/components/ui/action-button";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InfoBanner } from "@/components/ui/info-banner";
import { SectionCard } from "@/components/ui/section-card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { JitDeclaredInputsPanels } from "@/components/jit/jit-declared-inputs-panels";
import {
  createEmptyChecklistDraft,
  isChecklistComplete,
  JitPostAuditChecklistForm,
  type ChecklistDraftState,
} from "@/components/jit/jit-post-audit-checklist-form";
import type { JitDeclaredInputsPayload } from "@/lib/jit-declared-inputs";
import { JIT_POST_AUDIT_CHECKLIST_ITEMS } from "@/lib/jit-post-audit-checklist";
import type { PaginationPageSize } from "@/lib/pagination";
import type { MapBusinessCategory } from "@/lib/business-map-categories";
import { EB_MAGALONA_BARANGAYS } from "@/lib/business-rules";

interface InspectableBusinessRow {
  locationId: string;
  businessRecordId: string;
  applicationId: string;
  applicantName: string;
  tradeName: string | null;
  businessName: string;
  businessType: string | null;
  ownerName: string;
  businessCategory: MapBusinessCategory;
  businessCategoryLabel: string;
  businessCategoryColor: string;
  applicationNumber: string;
  applicationType: "NEW" | "RENEWAL";
  submittedAt: string | null;
  permitOrCertificateNumber: string | null;
  permitValidUntil: string | null;
  lineOfBusiness: string | null;
  applicationStatus: string;
  bploRemarks: string | null;
  documents: Array<{
    id: string;
    documentName: string;
    fileName: string;
    uploadedAt: string;
  }>;
  latitude: number;
  longitude: number;
  address: string | null;
  barangay: string | null;
  status: "PENDING" | "VERIFIED" | "NEEDS_CORRECTION";
  remarks: string | null;
  updatedAt: string;
  latestInspection: {
    complianceStatus: "PENDING_REVIEW" | "COMPLIANT" | "NON_COMPLIANT";
    status:
      | "COMPLIANT"
      | "NON_COMPLIANT"
      | "DH_VERIFICATION_PENDING"
      | "VERIFIED_COMPLIANT"
      | "VERIFIED_NON_COMPLIANT"
      | "REVOCATION_REVIEW"
      | "REVOCATION_DENIED"
      | "REVOKED";
    createdAt: string;
  } | null;
}

function formatInspectionStatus(status: string | undefined | null): string {
  if (!status) return "No Inspection";
  switch (status) {
    case "DH_VERIFICATION_PENDING": return "Pending Verification";
    case "VERIFIED_COMPLIANT": return "Verified Compliant";
    case "VERIFIED_NON_COMPLIANT": return "Verified Non-Compliant";
    case "REVOCATION_REVIEW": return "Revocation Review";
    case "REVOCATION_DENIED": return "Revocation Denied";
    case "REVOKED": return "Revoked";
    case "COMPLIANT": return "Compliant";
    case "NON_COMPLIANT": return "Non-Compliant";
    default: return status;
  }
}

function inspectionStatusTone(status: string | undefined | null): string {
  if (!status) return "text-[var(--ink-muted)]";
  switch (status) {
    case "VERIFIED_COMPLIANT":
    case "COMPLIANT":
      return "text-[var(--success)]";
    case "VERIFIED_NON_COMPLIANT":
    case "NON_COMPLIANT":
    case "REVOCATION_REVIEW":
    case "REVOKED":
      return "text-[var(--danger)]";
    default:
      return "text-[var(--warning)]";
  }
}

export function JitInspectBusinessClient() {
  const [rows, setRows] = useState<InspectableBusinessRow[]>([]);
  const [selectedBusinessRecordId, setSelectedBusinessRecordId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [barangayFilter, setBarangayFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [declaredInputs, setDeclaredInputs] = useState<JitDeclaredInputsPayload | null>(null);
  const [declaredInputsLoading, setDeclaredInputsLoading] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState<ChecklistDraftState>(createEmptyChecklistDraft);
  const previousBusinessRecordIdRef = useRef<string | null>(null);

  const resetInspectionDraftState = useCallback(() => {
    setChecklistDraft(createEmptyChecklistDraft());
    setComment("");
    setEvidenceFile(null);
    setFormError(null);
    setDeclaredInputs(null);
    setDeclaredInputsLoading(false);
    setIsSubmitting(false);
  }, []);

  const selectedRow = useMemo(
    () => rows.find((row) => row.businessRecordId === selectedBusinessRecordId) ?? null,
    [rows, selectedBusinessRecordId]
  );

  const summaryCounts = useMemo(() => {
    const inspectedCount = rows.filter((row) => row.latestInspection !== null).length;
    const pendingInspectionCount = rows.filter((row) => row.latestInspection === null).length;
    const referredCount = rows.filter((row) => {
      const latestStatus = row.latestInspection?.status;
      return latestStatus === "NON_COMPLIANT" || latestStatus === "REVOCATION_REVIEW" || latestStatus === "REVOKED";
    }).length;

    return {
      totalBusinesses: totalCount,
      pendingInspection: pendingInspectionCount,
      inspected: inspectedCount,
      referred: referredCount,
    };
  }, [rows, totalCount]);

  async function loadRows(next?: {
    search?: string;
    barangay?: string;
    page?: number;
    pageSize?: PaginationPageSize;
  }) {
    const nextSearch = next?.search ?? searchApplied;
    const nextBarangay = next?.barangay ?? barangayFilter;
    const nextPage = next?.page ?? page;
    const nextPageSize = next?.pageSize ?? pageSize;

    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(nextPageSize),
    });
    if (nextSearch) params.set("search", nextSearch);
    if (nextBarangay) params.set("barangay", nextBarangay);

    const response = await fetch(`/api/jit/inspect-a-business?${params.toString()}`, { cache: "no-store" });
    const data = (await response.json()) as {
      records?: InspectableBusinessRow[];
      totalCount?: number;
      page?: number;
      pageSize?: PaginationPageSize;
      totalPages?: number;
      error?: string;
    };

    if (!response.ok) {
      setStatusMessage({ kind: "error", text: data.error ?? "Unable to load inspectable businesses" });
      setRows([]);
      setTotalCount(0);
      setTotalPages(1);
      setIsLoading(false);
      return;
    }

    const nextRows = data.records ?? [];
    setRows(nextRows);
    setTotalCount(data.totalCount ?? 0);
    setPage(data.page ?? nextPage);
    setPageSize(data.pageSize ?? nextPageSize);
    setTotalPages(data.totalPages ?? 1);

    const nextSelected = nextRows.find((row) => row.businessRecordId === selectedBusinessRecordId);
    if (nextSelected) {
      setSelectedBusinessRecordId(nextSelected.businessRecordId);
    } else if (nextRows[0]) {
      setSelectedBusinessRecordId(nextRows[0].businessRecordId);
    } else {
      setSelectedBusinessRecordId(null);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchApplied(searchText.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchApplied, barangayFilter, page, pageSize]);

  useEffect(() => {
    if (rows.length === 0) {
      return;
    }

    if (!rows.some((row) => row.businessRecordId === selectedBusinessRecordId)) {
      setSelectedBusinessRecordId(rows[0].businessRecordId);
    }
  }, [rows, selectedBusinessRecordId]);

  useEffect(() => {
    const previousId = previousBusinessRecordIdRef.current;
    if (previousId === selectedBusinessRecordId) {
      return;
    }

    if (previousId !== null) {
      resetInspectionDraftState();
    }

    previousBusinessRecordIdRef.current = selectedBusinessRecordId;
  }, [selectedBusinessRecordId, resetInspectionDraftState]);

  useEffect(() => {
    if (!selectedBusinessRecordId) {
      setDeclaredInputs(null);
      return;
    }

    let active = true;

    async function loadDeclaredInputs() {
      setDeclaredInputsLoading(true);
      const response = await fetch(
        `/api/jit/inspect-a-business/${selectedBusinessRecordId}/declared-inputs`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as {
        declaredInputs?: JitDeclaredInputsPayload;
        error?: string;
      };

      if (!active) return;

      if (!response.ok) {
        setDeclaredInputs(null);
        setDeclaredInputsLoading(false);
        return;
      }

      setDeclaredInputs(data.declaredInputs ?? null);
      setDeclaredInputsLoading(false);
    }

    void loadDeclaredInputs();

    return () => {
      active = false;
    };
  }, [selectedBusinessRecordId]);

  function validateForm(): string | null {
    if (!selectedRow) {
      return "Select a business first.";
    }

    if (!isChecklistComplete(checklistDraft)) {
      return "Complete all 8 post-audit checklist responses before submitting.";
    }

    if (!comment.trim()) {
      return "General inspection remarks are required.";
    }

    return null;
  }

  async function handleSubmit() {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!selectedRow) return;

    setIsSubmitting(true);
    setFormError(null);
    setStatusMessage(null);

    const payload = new FormData();
    payload.set("comment", comment);
    if (evidenceFile) {
      payload.set("evidencePhoto", evidenceFile);
    }

    const checklistPayload = JIT_POST_AUDIT_CHECKLIST_ITEMS.map((item) => ({
      departmentKey: item.departmentKey,
      response: checklistDraft[item.departmentKey].response,
      remarks: checklistDraft[item.departmentKey].remarks.trim() || undefined,
    }));
    payload.set("checklist", JSON.stringify(checklistPayload));

    for (const item of JIT_POST_AUDIT_CHECKLIST_ITEMS) {
      const evidence = checklistDraft[item.departmentKey].evidenceFile;
      if (evidence) {
        payload.set(`checklistEvidence_${item.departmentKey}`, evidence);
      }
    }

    const response = await fetch(`/api/jit/inspect-a-business/${selectedRow.businessRecordId}`, {
      method: "POST",
      body: payload,
    });

    const data = (await response.json()) as {
      inspection?: { status: string };
      error?: string;
    };

    if (!response.ok) {
      setFormError(data.error ?? "Unable to submit inspection.");
      setIsSubmitting(false);
      return;
    }

    resetInspectionDraftState();
    setStatusMessage({
      kind: "success",
      text: "Inspection submitted. BPLO will review and determine compliance status.",
    });

    await loadRows();
    setIsSubmitting(false);
  }

  return (
    <div className="ui-page-stack">
      {statusMessage ? (
        <InfoBanner
          title={statusMessage.kind === "success" ? "Inspection update" : "Inspection issue"}
          description={statusMessage.text}
          variant={statusMessage.kind === "success" ? "success" : "danger"}
        />
      ) : null}

      <SectionCard
        title="Inspectable Released Businesses"
        description="Search by business name, owner, or permit number. Filter by barangay."
        action={
          <Link href="/jit/dashboard" className={actionButtonStyles("secondary", "sm")}>
            Back to Dashboard
          </Link>
        }
      >
        {/* Compact stats strip + search / barangay filter */}
        <div className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
              <input
                id="jit-inspection-search"
                aria-label="Search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Business, trade name, owner/applicant, permit number"
                className={`${jitFormControlClass} py-2.5 pl-9 pr-3`}
              />
            </div>
            <div className="w-full xl:w-64">
              <label htmlFor="jit-inspection-barangay" className="sr-only">
                Filter by barangay
              </label>
              <select
                id="jit-inspection-barangay"
                aria-label="Filter by barangay"
                value={barangayFilter}
                onChange={(event) => {
                  setBarangayFilter(event.target.value);
                  setPage(1);
                }}
                className={`${jitFormControlClass} py-2.5`}
              >
                <option value="">All barangays</option>
                {EB_MAGALONA_BARANGAYS.map((barangay) => (
                  <option key={barangay} value={barangay}>
                    {barangay}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-1.5 font-semibold text-[var(--foreground)]">
                <FileText className="h-3.5 w-3.5" />
                {summaryCounts.totalBusinesses} Total
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-1.5 font-semibold text-[var(--ink-muted)]">
                {summaryCounts.pendingInspection} Pending
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-1.5 font-semibold text-[var(--success)]">
                <ShieldCheck className="h-3.5 w-3.5" />
                {summaryCounts.inspected} Inspected
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-1.5 font-semibold text-[var(--danger)]">
                <AlertTriangle className="h-3.5 w-3.5" />
                {summaryCounts.referred} Referred
              </span>
            </div>
          </div>
        </div>

        {/* Compact business cards */}
        <div className="mt-4 grid gap-3">
          {rows.length > 0 ? (
            rows.map((row) => {
              const isSelected = selectedRow?.businessRecordId === row.businessRecordId;
              const inspStatus = row.latestInspection?.status ?? null;

              return (
                <article
                  key={row.businessRecordId}
                  className={`${jitSelectableCardClass} p-3 ${isSelected ? jitSelectableCardActiveClass : jitSelectableCardIdleClass}`}
                >
                  {/* Row 1: Business Name | Permit No. | Business Type | Inspection Status */}
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className={jitSummaryLabelClass}>Business / Trade Name</p>
                      <p className={`${jitSummaryValueClass} truncate`}>
                        {row.tradeName ? `${row.tradeName} / ${row.businessName}` : row.businessName}
                      </p>
                    </div>
                    <div>
                      <p className={jitSummaryLabelClass}>Permit No.</p>
                      <p className={`${jitSummaryValueClass} truncate`}>{row.permitOrCertificateNumber ?? "N/A"}</p>
                    </div>
                    <div>
                      <p className={jitSummaryLabelClass}>Business Type</p>
                      <p className={`${jitSummaryValueClass} truncate`}>{row.businessType ?? "N/A"}</p>
                    </div>
                    <div>
                      <p className={jitSummaryLabelClass}>Inspection Status</p>
                      <p className={`text-sm font-semibold ${inspectionStatusTone(inspStatus)} truncate`}>
                        {formatInspectionStatus(inspStatus)}
                      </p>
                    </div>
                  </div>

                  {/* Row 2: Owner | Address | Line of Business | Action */}
                  <div className="mt-2 grid items-end gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className={jitSummaryLabelClass}>Owner / Applicant</p>
                      <p className={`${jitSummaryValueClass} truncate`}>{row.ownerName} / {row.applicantName}</p>
                    </div>
                    <div>
                      <p className={jitSummaryLabelClass}>Business Address</p>
                      <p className={`${jitSummaryValueClass} truncate`}>
                        {row.barangay ? `Brgy. ${row.barangay}` : null}
                        {row.barangay && row.address ? " · " : null}
                        {row.address ?? (row.barangay ? null : "N/A")}
                      </p>
                    </div>
                    <div>
                      <p className={jitSummaryLabelClass}>Line of Business</p>
                      <p className={`${jitSummaryValueClass} truncate`}>{row.lineOfBusiness ?? "N/A"}</p>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setSelectedBusinessRecordId(row.businessRecordId)}
                        className={actionButtonStyles(isSelected ? "readOnly" : "primary", "sm")}
                      >
                        {isSelected ? "Selected" : "Inspect"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <EmptyState
              title="No businesses match the filters"
              description="Try a different search term or barangay."
            />
          )}
        </div>

        <PaginationControls
          basePath="/jit/inspect-a-business"
          queryParams={{
            search: searchApplied || undefined,
            barangay: barangayFilter || undefined,
          }}
          mode="client"
          isLoading={isLoading}
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
      </SectionCard>

      {isLoading ? (
        <LoadingState message="Loading inspection details…" compact />
      ) : totalCount === 0 ? (
        <EmptyState
          title={
            searchApplied || barangayFilter
              ? "No businesses match the filters"
              : "No released businesses available"
          }
          description={
            searchApplied || barangayFilter
              ? "Try a different search term or barangay."
              : "Inspection queue will populate once permits are released with active business records."
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No businesses on this page" description="Try another page or adjust your filters." />
      ) : selectedRow ? (
        <>
          <JitDeclaredInputsPanels declaredInputs={declaredInputs} isLoading={declaredInputsLoading} />

          <JitPostAuditChecklistForm
            draft={checklistDraft}
            onChange={setChecklistDraft}
            disabled={isSubmitting}
          />

          <SectionCard
            title="Inspection Submission"
            description="Submit checklist answers, remarks, and evidence. BPLO will determine the official compliance status."
          >
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className={jitSummaryTileClass}>
                  <p className={jitSummaryLabelClass}>Application Number</p>
                  <p className={jitSummaryValueClass}>{selectedRow.applicationNumber}</p>
                </div>
                <div className={jitSummaryTileClass}>
                  <p className={jitSummaryLabelClass}>Permit Number</p>
                  <p className={jitSummaryValueClass}>{selectedRow.permitOrCertificateNumber ?? "N/A"}</p>
                </div>
                <div className={jitSummaryTileClass}>
                  <p className={jitSummaryLabelClass}>Latest Inspection Status</p>
                  <p className={`text-sm font-semibold ${inspectionStatusTone(selectedRow.latestInspection?.status)}`}>
                    {formatInspectionStatus(selectedRow.latestInspection?.status)}
                  </p>
                </div>
              </div>

              <FormField
                label="General Inspection Remarks"
                required
                error={formError?.includes("remarks") ? formError : undefined}
                hint="Required. Summarize inspection observations."
              >
                <textarea
                  aria-label="General Inspection Remarks"
                  rows={3}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  className={jitFormControlClass}
                  placeholder="Describe inspection findings and observations"
                />
              </FormField>

              <FormField
                label="Inspection Photo Evidence"
                error={formError?.includes("Photo evidence") ? formError : undefined}
                hint="Optional. JPG, PNG, WEBP, or PDF."
              >
                <input
                  type="file"
                  aria-label="Inspection Photo Evidence"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                  className={jitFormControlClass}
                />
              </FormField>

              {formError && !formError.includes("remarks") && !formError.includes("Photo evidence") ? (
                <p className="text-sm font-medium text-[var(--danger)]">{formError}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleSubmit();
                  }}
                  disabled={isSubmitting}
                  className={actionButtonStyles("primary", "md")}
                >
                  {isSubmitting ? "Submitting..." : "Submit Inspection"}
                </button>
                {selectedRow ? (
                  <Link href="/jit/business-map" className={actionButtonStyles("secondary", "md")}>
                    View Business Map
                  </Link>
                ) : null}
              </div>
            </div>
          </SectionCard>
        </>
      ) : (
        <SectionCard title="Inspection Panel" description="Select a business to begin post-audit validation.">
          <EmptyState title="Select a business" description="Pick one business card to start inspection." />
        </SectionCard>
      )}
    </div>
  );
}
