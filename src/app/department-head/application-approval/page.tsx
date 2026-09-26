"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { SectionCard } from "@/components/ui/section-card";
import { InfoBanner } from "@/components/ui/info-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { actionButtonStyles } from "@/components/ui/action-button";
import { DocumentDownloadButton } from "@/components/ui/document-download-button";
import { LoadingState } from "@/components/ui/loading-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  dhDetailSectionTitleClass,
  dhDocumentListItemClass,
  dhFormControlClass,
  dhPanelClass,
  dhSelectableCardActiveClass,
  dhSelectableCardClass,
  dhSelectableCardIdleClass,
  dhSummaryLabelClass,
  dhSummaryTileClass,
  dhSummaryValueClass,
  dhSurfacePanelClass,
} from "@/components/department-head/department-head-ui-styles";
import {
  DOCUMENT_VALIDATION_UI_STATUSES,
  type DocumentValidationUiStatus,
  evaluateRequiredDocumentsValidation,
  mapDocumentValidationStatusToDb,
  mapDocumentValidationStatusToUi,
  remarksRequiredForValidationStatus,
  validationStatusBadgeClass,
} from "@/lib/document-validation";
import type { BusinessInfo } from "@/lib/applicant-types";
import { DEFAULT_PAGE_SIZE, type PaginationPageSize } from "@/lib/pagination";

type ApprovalRow = {
  id: string;
  applicationNumber: string;
  applicationType: "NEW" | "RENEWAL" | "CLOSURE";
  closureType?: string | null;
  closureTypeOtherReason?: string | null;
  ownerName: string;
  businessName: string;
  businessType: string;
  lineOfBusiness: string;
  businessAddress: string;
  submittedDate: string;
  updatedDate: string;
  currentStatus: string;
  bploRemarks: string | null;
  formData: Record<string, unknown>;
  history: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorRole: string;
    remarks: string | null;
    createdAt: string;
  }>;
  documents: Array<{
    id: string;
    documentName: string;
    fileName: string;
    uploadedAt: string;
    validationStatus?: string;
    validationRemarks?: string | null;
  }>;
};

type ActionType = "approve" | "return" | "reject";

function formatDateTime(value: string): string {
  if (!value || value === "-") return "-";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function readText(formData: Record<string, unknown>, keys: string[], fallback = "-") {
  for (const key of keys) {
    const value = formData[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

function readFlag(formData: Record<string, unknown>, key: string) {
  const value = formData[key];
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return "-";
}


function DepartmentHeadDocumentValidationEditor({
  applicationId,
  document,
  onSaved,
}: {
  applicationId: string;
  document: ApprovalRow["documents"][number];
  onSaved: (updated: ApprovalRow["documents"][number]) => void;
}) {
  const initialStatus = mapDocumentValidationStatusToUi(document.validationStatus);
  const [status, setStatus] = useState<DocumentValidationUiStatus>(initialStatus);
  const [remarks, setRemarks] = useState(document.validationRemarks ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(mapDocumentValidationStatusToUi(document.validationStatus));
    setRemarks(document.validationRemarks ?? "");
  }, [document.validationStatus, document.validationRemarks]);

  const remarksRequired = remarksRequiredForValidationStatus(status);

  async function saveValidation() {
    if (remarksRequired && !remarks.trim()) {
      setError("Remarks are required for this validation status.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/department-head/application-approval/${applicationId}/documents/${document.id}/validation`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            status,
            remarks: remarks.trim() || undefined,
          }),
        }
      );

      const data = (await response.json()) as {
        error?: string;
        document?: ApprovalRow["documents"][number];
      };

      if (!response.ok || !data.document) {
        throw new Error(data.error ?? "Unable to save validation status.");
      }

      onSaved(data.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save validation status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--muted-surface)] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={`dh-val-status-${document.id}`}
          className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]"
        >
          Validation Status
        </label>
        <span className={`ui-badge ${validationStatusBadgeClass(status)}`}>
          {status}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`dh-val-status-${document.id}`}
          value={status}
          onChange={(e) => setStatus(e.target.value as DocumentValidationUiStatus)}
          className={`flex-1 ${dhFormControlClass}`}
        >
          {DOCUMENT_VALIDATION_UI_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveValidation()}
          className={actionButtonStyles("primary", "sm")}
        >
          {saving ? "Saving..." : "Save Status"}
        </button>
      </div>
      <div>
        <label
          htmlFor={`dh-val-remarks-${document.id}`}
          className="text-xs text-[var(--ink-muted)]"
        >
          Validation Remarks {remarksRequired ? "(required)" : "(optional)"}
        </label>
        <textarea
          id={`dh-val-remarks-${document.id}`}
          rows={1}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          className={`mt-1 ${dhFormControlClass}`}
          placeholder={remarksRequired ? "Explain why this document requires correction." : "Optional reviewer notes."}
        />
      </div>
      {error ? <p className="ui-inline-error text-xs">{error}</p> : null}
    </div>
  );
}

export default function DepartmentHeadApplicationApprovalPage() {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [remarks, setRemarks] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const documentValidation = useMemo(() => {
    if (!selected) {
      return { ready: true, blockers: [] as ReturnType<typeof evaluateRequiredDocumentsValidation>["blockers"] };
    }

    try {
      return evaluateRequiredDocumentsValidation({
        applicationType: selected.applicationType,
        formData: selected.formData as unknown as BusinessInfo,
        documents: selected.documents.map((doc) => ({
          documentName: doc.documentName,
          validationStatus: mapDocumentValidationStatusToDb(doc.validationStatus ?? "Pending Review"),
          validationRemarks: doc.validationRemarks ?? null,
        })),
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to evaluate document validation.";
      return {
        ready: false,
        blockers: [
          {
            documentName: "Document validation",
            validationStatus: "Pending Review" as const,
            validationRemarks: text,
            reason: "not_valid" as const,
          },
        ],
      };
    }
  }, [selected]);

  const approvalBlocked = !documentValidation.ready;
  const approvalBlockMessage = documentValidation.ready
    ? undefined
    : `Resolve required document validation first: ${documentValidation.blockers
        .map((blocker) =>
          blocker.reason === "missing"
            ? `${blocker.documentName} (missing upload)`
            : `${blocker.documentName} (${blocker.validationStatus})`
        )
        .join("; ")}`;

  const loadQueue = useCallback(async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(nextPageSize),
    });
    const response = await fetch(`/api/department-head/application-approval?${params.toString()}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      rows?: ApprovalRow[];
      records?: ApprovalRow[];
      totalCount?: number;
      page?: number;
      pageSize?: PaginationPageSize;
      totalPages?: number;
      error?: string;
    };

    if (!response.ok) {
      setMessage({ type: "error", text: data.error ?? "Unable to load Department Head review queue." });
      setRows([]);
      setSelectedId(null);
      setTotalCount(0);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    const nextRows = data.rows ?? data.records ?? [];
    const nextTotalCount = data.totalCount ?? nextRows.length;
    const nextTotalPages = data.totalPages ?? 1;
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
    setTotalPages(nextTotalPages);
    setSelectedId((current) => {
      if (current && nextRows.some((row) => row.id === current)) return current;
      return nextRows[0]?.id ?? null;
    });
    setLoading(false);
  }, [page, pageSize]);

  useEffect(() => {
    void loadQueue(page, pageSize);
  }, [page, pageSize, loadQueue]);

  async function runAction(action: ActionType) {
    if (!selected) return;

    if (action === "approve" && approvalBlocked) {
      setMessage({
        type: "error",
        text: approvalBlockMessage ?? "All required documents must be marked Valid before approval.",
      });
      return;
    }

    if ((action === "return" || action === "reject") && !remarks.trim()) {
      setMessage({ type: "error", text: "Remarks are required for return and reject actions." });
      return;
    }

    setPendingAction(action);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/department-head/application-approval/${selected.id}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          credentials: "same-origin",
          body: JSON.stringify({ remarks }),
        }
      );

      let data: {
        application?: { applicationNumber: string; status: string };
        error?: string;
      } = {};

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = (await response.json()) as typeof data;
      } else if (!response.ok) {
        throw new Error(`Action failed (HTTP ${response.status}).`);
      }

      if (!response.ok) {
        setMessage({ type: "error", text: data.error ?? "Action failed." });
        return;
      }

      setMessage({
        type: "success",
        text: `${data.application?.applicationNumber ?? "Application"} moved to ${data.application?.status ?? "new status"}.`,
      });
      setRemarks("");
      await loadQueue(page, pageSize);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Action failed.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  function handleDocumentSaved(updatedDoc: ApprovalRow["documents"][number]) {
    setRows((prevRows) =>
      prevRows.map((row) => {
        if (row.id !== selectedId) return row;
        return {
          ...row,
          documents: row.documents.map((doc) =>
            doc.id === updatedDoc.id ? { ...doc, ...updatedDoc } : doc
          ),
        };
      })
    );
  }

  return (
    <section className="ui-page-stack ui-page-stack--workspace">
      <PageHeader
        eyebrow="Department Head"
        title="Application Approvals"
        description="Review BPLO-approved applications before Fees & Assessment."
        badge={<RoleBadge roleType="VIEW_ONLY" label="Department Head" />}
      />

      <div className="ui-split-workspace">
        <SectionCard
          fill
          title="Queue"
          description={`${totalCount} pending`}
          action={
            <button
              type="button"
              onClick={() => void loadQueue(page, pageSize)}
              disabled={loading}
              className={actionButtonStyles("secondary", "sm")}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          }
          contentClassName="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4"
        >
          {loading ? (
            <LoadingState message="Loading application queue…" compact />
          ) : rows.length === 0 ? (
            <div className={dhPanelClass}>
              No applications pending approval. Items appear after BPLO sends them to Department Head Review.
            </div>
          ) : (
            <div className="space-y-1.5">
              {rows.map((row) => {
                const active = selectedId === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`${dhSelectableCardClass} ${active ? dhSelectableCardActiveClass : dhSelectableCardIdleClass}`}
                  >
                    <p className="font-mono ui-caption">{row.applicationNumber}</p>
                    <p className={dhSummaryValueClass}>{row.businessName}</p>
                    <p className="mt-0.5 ui-caption">{row.ownerName} • {row.applicationType}</p>
                    <div className="mt-1.5">
                      <StatusBadge status={row.currentStatus as any} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-2 border-t border-[var(--border-color)] pt-2">
            <PaginationControls
              basePath="/department-head/application-approval"
              queryParams={{}}
              mode="client"
              isLoading={loading}
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
              recordLabel="applications"
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
          title="Review"
          description={selected ? `${selected.applicationNumber} • ${selected.businessName}` : "Select an application from the queue."}
        >
          {!selected ? (
            <div className="ui-split-pane-body px-3 py-2.5 sm:px-3.5 lg:px-4">
              <div className={dhPanelClass}>No selected application.</div>
            </div>
          ) : (
            (() => {
              const formData = selected.formData ?? {};
              const ownerFirstName = readText(formData, ["ownerFirstName"], "");
              const ownerMiddleName = readText(formData, ["ownerMiddleName"], "");
              const ownerSurname = readText(formData, ["ownerSurname"], "");
              const ownerName = readText(formData, ["ownerName"], selected.ownerName);
              const latitude = typeof formData.businessLatitude === "number" ? formData.businessLatitude : null;
              const longitude = typeof formData.businessLongitude === "number" ? formData.businessLongitude : null;

              return (
                <>
                  <div className="ui-split-pane-body space-y-3 px-3 py-2.5 sm:px-3.5 lg:px-4">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className={dhSummaryTileClass}>
                        <p className={dhSummaryLabelClass}>Application Number</p>
                        <p className={dhSummaryValueClass}>{selected.applicationNumber}</p>
                      </div>
                      <div className={dhSummaryTileClass}>
                        <p className={dhSummaryLabelClass}>Type</p>
                        <p className={dhSummaryValueClass}>{selected.applicationType}</p>
                      </div>
                      <div className={dhSummaryTileClass}>
                        <p className={dhSummaryLabelClass}>Status</p>
                        <div className="mt-0.5">
                          <StatusBadge status={selected.currentStatus as any} />
                        </div>
                      </div>
                      <div className={dhSummaryTileClass}>
                        <p className={dhSummaryLabelClass}>Owner</p>
                        <p className={dhSummaryValueClass}>{selected.ownerName}</p>
                      </div>
                      <div className={dhSummaryTileClass}>
                        <p className={dhSummaryLabelClass}>Business Name</p>
                        <p className={dhSummaryValueClass}>{selected.businessName}</p>
                      </div>
                      <div className={dhSummaryTileClass}>
                        <p className={dhSummaryLabelClass}>Submitted</p>
                        <p className={dhSummaryValueClass}>{formatDateTime(selected.submittedDate)}</p>
                      </div>
                      <div className={dhSummaryTileClass}>
                        <p className={dhSummaryLabelClass}>Updated</p>
                        <p className={dhSummaryValueClass}>{formatDateTime(selected.updatedDate)}</p>
                      </div>
                      <div className={dhSummaryTileClass}>
                        <p className={dhSummaryLabelClass}>Business Type</p>
                        <p className={dhSummaryValueClass}>{selected.businessType}</p>
                      </div>
                      <div className={`${dhSummaryTileClass} sm:col-span-2`}>
                        <p className={dhSummaryLabelClass}>Line of Business</p>
                        <p className={dhSummaryValueClass}>{selected.lineOfBusiness}</p>
                      </div>
                      <div className={`${dhSummaryTileClass} sm:col-span-2`}>
                        <p className={dhSummaryLabelClass}>Business Address</p>
                        <p className={dhSummaryValueClass}>{selected.businessAddress}</p>
                      </div>
                    </div>

                    <div className="grid gap-2 lg:grid-cols-2">
                      <div className={dhSurfacePanelClass}>
                        <p className={dhDetailSectionTitleClass}>Owner</p>
                        <div className="space-y-1 text-sm text-[var(--ink-muted)]">
                          {ownerFirstName || ownerMiddleName || ownerSurname ? (
                            <>
                              <p><strong>First Name:</strong> {ownerFirstName || "-"}</p>
                              <p><strong>Middle Name:</strong> {ownerMiddleName || "-"}</p>
                              <p><strong>Surname:</strong> {ownerSurname || "-"}</p>
                            </>
                          ) : (
                            <p><strong>Owner / President:</strong> {ownerName}</p>
                          )}
                          <p><strong>Sex:</strong> {readText(formData, ["sex"])}</p>
                          <p><strong>Nationality:</strong> {readText(formData, ["nationality"])}</p>
                          <p><strong>Email:</strong> {readText(formData, ["email"])}</p>
                          <p><strong>Phone:</strong> {readText(formData, ["phone"])}</p>
                        </div>
                      </div>

                      <div className={dhSurfacePanelClass}>
                        <p className={dhDetailSectionTitleClass}>Business identity</p>
                        <div className="space-y-1 text-sm text-[var(--ink-muted)]">
                          <p><strong>Business Name:</strong> {readText(formData, ["businessName"], selected.businessName)}</p>
                          <p><strong>Trade Name:</strong> {readText(formData, ["tradeName"])}</p>
                          <p><strong>Business Type:</strong> {readText(formData, ["businessType"], selected.businessType)}</p>
                          <p><strong>Registration Number:</strong> {readText(formData, ["registrationNumber"])}</p>
                          <p><strong>TIN:</strong> {readText(formData, ["tin"])}</p>
                          <p><strong>Business Activity:</strong> {readText(formData, ["businessActivity"])}</p>
                          <p><strong>Main / Branch:</strong> {readText(formData, ["businessOperationType"])}</p>
                          <p><strong>Line of Business:</strong> {readText(formData, ["lineOfBusiness"], selected.lineOfBusiness)}</p>
                        </div>
                      </div>

                      <div className={dhSurfacePanelClass}>
                        <p className={dhDetailSectionTitleClass}>Address & location</p>
                        <div className="space-y-1 text-sm text-[var(--ink-muted)]">
                          <p><strong>Main Office Address:</strong> {readText(formData, ["mainOfficeAddress"])}</p>
                          <p><strong>Business Address:</strong> {readText(formData, ["businessAddress"], selected.businessAddress)}</p>
                          <p><strong>Barangay:</strong> {readText(formData, ["barangay"])}</p>
                          <p><strong>Street:</strong> {readText(formData, ["streetAddress"])}</p>
                          <p><strong>Coordinates:</strong> {latitude != null && longitude != null ? `${latitude}, ${longitude}` : "-"}</p>
                          <p><strong>Location:</strong> {latitude != null && longitude != null ? "Pinned" : "Not pinned"}</p>
                        </div>
                      </div>

                      <div className={dhSurfacePanelClass}>
                        <p className={dhDetailSectionTitleClass}>Operations</p>
                        <div className="space-y-1 text-sm text-[var(--ink-muted)]">
                          <p><strong>Business Area:</strong> {readText(formData, ["businessArea"])}</p>
                          <p><strong>Total Floor Area:</strong> {readText(formData, ["totalFloorArea"])}</p>
                          <p><strong>Asset Size:</strong> {readText(formData, ["assetSize"])}</p>
                          <p><strong>Property Ownership:</strong> {readText(formData, ["propertyOwnership"])}</p>
                          <p><strong>Tax Declaration Number:</strong> {readText(formData, ["taxDeclarationNumber"])}</p>
                          <p><strong>Property Identification Number:</strong> {readText(formData, ["propertyIdentificationNumber"])}</p>
                          <p><strong>OR Number:</strong> {readText(formData, ["orNumber", "officialReceiptNumber"])}</p>
                          <p><strong>Tax Incentives:</strong> {readText(formData, ["taxIncentives"])}</p>
                          <p><strong>Market:</strong> {readFlag(formData, "isMarket")} · <strong>Agriculture:</strong> {readFlag(formData, "isAgriculture")} · <strong>Liquor/Tobacco:</strong> {readFlag(formData, "isLiquorOrTobacco")}</p>
                        </div>
                      </div>

                      <div className={dhSurfacePanelClass}>
                        <p className={dhDetailSectionTitleClass}>Employees</p>
                        <div className="space-y-1 text-sm text-[var(--ink-muted)]">
                          <p><strong>Total:</strong> {readText(formData, ["totalEmployees"])}</p>
                          <p><strong>Male / Female:</strong> {readText(formData, ["maleEmployees"])} / {readText(formData, ["femaleEmployees"])}</p>
                          <p><strong>Within Municipality:</strong> {readText(formData, ["employeesWithinMunicipality"])}</p>
                          <p><strong>Delivery Vehicles:</strong> {readText(formData, ["deliveryVehicles"])}</p>
                        </div>
                      </div>

                      <div className={dhSurfacePanelClass}>
                        <p className={dhDetailSectionTitleClass}>Application notes</p>
                        <div className="space-y-1 text-sm text-[var(--ink-muted)]">
                          <p><strong>Type:</strong> {selected.applicationType}</p>
                          {selected.applicationType === "RENEWAL" ? (
                            <p><strong>Payment Preference:</strong> {readText(formData, ["paymentFrequency"])}</p>
                          ) : null}
                          {selected.applicationType === "NEW" ? (
                            <p><strong>Capital Investment:</strong> {readText(formData, ["capitalInvestment"])}</p>
                          ) : null}
                          {selected.applicationType === "RENEWAL" ? (
                            <p><strong>Gross Profit:</strong> {readText(formData, ["grossProfit"])}</p>
                          ) : null}
                          {selected.applicationType === "CLOSURE" ? (
                            <>
                              <p>
                                <strong>Closure Type:</strong>{" "}
                                {selected.closureType === "RETIREMENT"
                                  ? "Retirement"
                                  : selected.closureType === "NON_COMPLIANT_RELATED"
                                    ? "Non-compliant Related"
                                    : selected.closureType === "OTHERS"
                                      ? selected.closureTypeOtherReason?.trim()
                                        ? `Others — ${selected.closureTypeOtherReason.trim()}`
                                        : "Others"
                                      : "-"}
                              </p>
                              <p>
                                <strong>Line of Business:</strong>{" "}
                                {readText(formData, ["closureLineOfBusiness", "lineOfBusiness"])}
                              </p>
                              <p>
                                <strong>Business Activity:</strong>{" "}
                                {readText(formData, ["closureBusinessActivity", "businessActivity"])}
                              </p>
                              <p>
                                <strong>Last Date of Operation:</strong>{" "}
                                {readText(formData, ["closureLastDateOfOperation"])}
                              </p>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className={dhSummaryTileClass}>
                      <p className={dhSummaryLabelClass}>BPLO Remarks</p>
                      <p className="mt-0.5 text-sm text-[var(--foreground)]">{selected.bploRemarks ?? "No BPLO remarks provided."}</p>
                    </div>

                    <div className={dhSurfacePanelClass}>
                      <p className={dhDetailSectionTitleClass}>Documents</p>
                      {selected.documents.length === 0 ? (
                        <div className="text-sm text-[var(--ink-muted)]">No uploaded documents.</div>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {selected.documents.map((doc) => {
                            const validationStatus = mapDocumentValidationStatusToUi(doc.validationStatus);
                            return (
                              <li key={doc.id} className={dhDocumentListItemClass}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-[var(--foreground)]">{doc.documentName}: {doc.fileName}</p>
                                    <p className="ui-caption">Uploaded: {formatDateTime(doc.uploadedAt)}</p>
                                    <p className="mt-1">
                                      <span className={`ui-badge ${validationStatusBadgeClass(validationStatus)}`}>
                                        {validationStatus}
                                      </span>
                                    </p>
                                    {doc.validationRemarks ? (
                                      <p className="mt-1 ui-caption">
                                        <span className="font-semibold text-[var(--foreground)]">Validation remarks:</span> {doc.validationRemarks}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <a
                                      href={`/api/department-head/application-approval/${selected.id}/documents/${doc.id}/download`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`${actionButtonStyles("secondary", "sm")} inline-flex`}
                                    >
                                      Preview
                                    </a>
                                    <DocumentDownloadButton
                                      url={`/api/department-head/application-approval/${selected.id}/documents/${doc.id}/download?download=1`}
                                      fileName={doc.fileName || doc.documentName || "document"}
                                    />
                                  </div>
                                </div>
                                <DepartmentHeadDocumentValidationEditor
                                  applicationId={selected.id}
                                  document={doc}
                                  onSaved={handleDocumentSaved}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div className={dhSurfacePanelClass}>
                      <p className={dhDetailSectionTitleClass}>Timeline</p>
                      {selected.history.length === 0 ? (
                        <div className="text-sm text-[var(--ink-muted)]">No timeline entries yet.</div>
                      ) : (
                        <ul className="space-y-1.5 text-sm text-[var(--ink-muted)]">
                          {selected.history.map((item) => (
                            <li key={item.id} className={dhDocumentListItemClass}>
                              <p className="font-medium text-[var(--foreground)]">
                                {item.fromStatus ? `${item.fromStatus} to ` : ""}
                                {item.toStatus}
                              </p>
                              <p className="ui-caption">Actor: {item.actorRole} · {formatDateTime(item.createdAt)}</p>
                              <p className="mt-0.5 text-sm text-[var(--ink-muted)]">{item.remarks ?? "No remarks provided."}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="ui-split-pane-footer space-y-2 px-3 pb-2.5 sm:px-3.5 lg:px-4">
                    {approvalBlocked ? (
                      <InfoBanner
                        title="Approval blocked"
                        description={
                          approvalBlockMessage ??
                          "All required documents must be marked Valid before approval."
                        }
                        variant="danger"
                      />
                    ) : (
                      <InfoBanner
                        title="Ready for approval"
                        description="All required documents are Valid."
                        variant="success"
                      />
                    )}

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="approval-remarks">
                        Remarks (required for Return and Reject)
                      </label>
                      <textarea
                        id="approval-remarks"
                        className={dhFormControlClass}
                        rows={2}
                        value={remarks}
                        onChange={(event) => setRemarks(event.target.value)}
                        placeholder="Required for Return for Correction and Reject actions"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void runAction("approve")}
                        disabled={pendingAction !== null || approvalBlocked}
                        className={actionButtonStyles("primary", "sm")}
                      >
                        {pendingAction === "approve" ? "Processing..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction("return")}
                        disabled={pendingAction !== null}
                        className={actionButtonStyles("warning", "sm")}
                      >
                        {pendingAction === "return" ? "Processing..." : "Return for Correction"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction("reject")}
                        disabled={pendingAction !== null}
                        className={actionButtonStyles("danger", "sm")}
                      >
                        {pendingAction === "reject" ? "Processing..." : "Reject"}
                      </button>
                    </div>

                    {message ? (
                      <InfoBanner
                        title={message.type === "success" ? "Action completed" : "Action blocked"}
                        description={message.text}
                        variant={message.type === "success" ? "success" : "danger"}
                      />
                    ) : null}
                  </div>
                </>
              );
            })()
          )}
        </SectionCard>
      </div>
    </section>
  );
}
