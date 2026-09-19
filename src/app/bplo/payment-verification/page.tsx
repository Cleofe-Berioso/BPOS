"use client";

import { useEffect, useState } from "react";
import { actionButtonStyles } from "@/components/ui/action-button";
import { DetailHeader } from "@/components/ui/detail-header";
import { FormField } from "@/components/ui/form-field";
import { InfoBanner } from "@/components/ui/info-banner";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveDataTable } from "@/components/ui/responsive-data-table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { RoleBadge } from "@/components/ui/role-badge";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/ui/loading-state";
import {
  bploEmptyStateClass,
  bploFormControlClass,
  bploHighlightPanelClass,
  bploMobileRecordCardClass,
  bploPanelClass,
  bploSummaryLabelClass,
  bploSummaryTileClass,
  bploSummaryValueClass,
  bploSurfacePanelClass,
  bploTableClass,
  paymentStatusBadgeClass,
} from "@/components/bplo/bplo-ui-styles";
import { SectionCard } from "@/components/ui/section-card";
import type { PaginationPageSize } from "@/lib/pagination";

type PaymentStatus = "PENDING" | "VERIFIED" | "REJECTED";

interface PaymentVerificationRow {
  paymentReferenceId: string;
  applicationId: string;
  applicationNumber: string;
  businessName: string;
  applicantName: string;
  applicantEmail: string;
  applicationType: "NEW" | "RENEWAL" | "CLOSURE";
  topNumber: string | null;
  annualAssessedAmount: number;
  releasePaymentAmount: number;
  totalAmountDue: number;
  amountPaid: number;
  paymentDate: string;
  transactionNumber: string;
  submittedAt: string;
  paymentStatus: PaymentStatus;
  applicationStatus: string;
  reviewerRemarks: string | null;
  reviewedAt: string | null;
  proofFileName: string;
}

interface PaymentVerificationDetail {
  row: PaymentVerificationRow;
  applicant: { id: string; name: string; email: string };
  business: {
    businessName: string;
    businessType: string;
    lineOfBusiness: string;
    assetSize: string;
    totalEmployees: string;
  };
  top: {
    assessmentNumber: string | null;
    paymentFrequency: "ANNUAL" | "BI_ANNUAL" | "QUARTERLY" | null;
    annualAssessedAmount: number;
    releasePaymentAmount: number;
    amountPaid: number;
    remainingBalance: number;
    paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    mayorsPermitFee: number;
    regulatoryFees: number;
    additionalCharges: number;
    penalties: number;
    surcharge: number;
    interest: number;
    closurePaymentDues: number;
    closureCertificateFee: number;
    arrears: number;
    otherCharges: number;
    totalAmount: number;
    remarks: string | null;
  };
}

type ProofPreviewKind = "image" | "pdf" | "unknown";

interface ProofModalState {
  open: boolean;
  paymentReferenceId: string | null;
  title: string;
  proofFileName: string;
  proofMimeType: string | null;
  orNumber: string;
  previewKind: ProofPreviewKind;
  previewUrl: string | null;
  error: string | null;
}

type TabKey = "PENDING" | "VERIFIED" | "REJECTED";

// Hoist Intl formatter to avoid recreating on every render
const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function money(value: number): string {
  return `₱ ${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return dateFormatter.format(new Date(value));
}

function SummaryTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className={bploSummaryTileClass}>
      <p className={bploSummaryLabelClass}>{label}</p>
      <p className={bploSummaryValueClass}>{value}</p>
      {helper ? <p className="mt-1 ui-caption">{helper}</p> : null}
    </div>
  );
}

function passFailLabel(status: PaymentStatus): "Pass" | "Returned" | "Pending" {
  if (status === "VERIFIED") return "Pass";
  if (status === "REJECTED") return "Returned";
  return "Pending";
}

export default function BploPaymentVerificationPage() {
  const [rows, setRows] = useState<PaymentVerificationRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [tabCounts, setTabCounts] = useState<Record<TabKey, number>>({
    PENDING: 0,
    VERIFIED: 0,
    REJECTED: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("PENDING");
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PaymentVerificationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [proofModal, setProofModal] = useState<ProofModalState>({
    open: false,
    paymentReferenceId: null,
    title: "Payment Proof",
    proofFileName: "",
    proofMimeType: null,
    orNumber: "",
    previewKind: "unknown",
    previewUrl: null,
    error: null,
  });

  useEffect(() => {
    return () => {
      if (proofModal.previewUrl) {
        URL.revokeObjectURL(proofModal.previewUrl);
      }
    };
  }, [proofModal.previewUrl]);

  function closeProofModal() {
    setProofModal((current) => ({
      ...current,
      open: false,
      previewUrl: null,
      error: null,
    }));
  }

  async function openProofModal(row: PaymentVerificationRow) {
    if (proofModal.previewUrl) {
      URL.revokeObjectURL(proofModal.previewUrl);
    }

    setProofModal({
      open: true,
      paymentReferenceId: row.paymentReferenceId,
      title: "Payment Proof",
      proofFileName: row.proofFileName,
      proofMimeType: null,
      orNumber: row.transactionNumber,
      previewKind: "unknown",
      previewUrl: null,
      error: null,
    });

    try {
      const response = await fetch(`/api/bplo/payment-verification/${row.paymentReferenceId}/proof`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setProofModal((current) => ({
          ...current,
          error: data.error ?? "Unable to preview this file. Please download it instead.",
        }));
        return;
      }

      const mimeType = response.headers.get("content-type") ?? row.proofFileName.split(".").pop()?.toLowerCase() ?? "";
      const previewKind: ProofPreviewKind =
        mimeType.includes("pdf") || row.proofFileName.toLowerCase().endsWith(".pdf")
          ? "pdf"
          : mimeType.startsWith("image/")
            ? "image"
            : "unknown";

      const blob = await response.blob();
      const previewUrl = URL.createObjectURL(blob);

      setProofModal((current) => ({
        ...current,
        proofMimeType: mimeType,
        previewKind,
        previewUrl,
        error: previewKind === "unknown" ? "Unable to preview this file. Please download it instead." : null,
      }));
    } catch {
      setProofModal((current) => ({
        ...current,
        error: "Unable to preview this file. Please download it instead.",
      }));
    }
  }

  function proofDownloadHref() {
    if (!proofModal.paymentReferenceId) return "#";
    return `/api/bplo/payment-verification/${proofModal.paymentReferenceId}/proof`;
  }

  async function loadLists(tab: TabKey = activeTab, nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    const params = new URLSearchParams({
      tab,
      page: String(nextPage),
      pageSize: String(nextPageSize),
    });
    const response = await fetch(`/api/bplo/payment-verification?${params.toString()}`, { cache: "no-store" });
    const data = (await response.json()) as {
      records?: PaymentVerificationRow[];
      totalCount?: number;
      page?: number;
      pageSize?: PaginationPageSize;
      totalPages?: number;
      error?: string;
    };
    if (!response.ok) {
      setStatusMessage({ kind: "error", text: data.error ?? "Unable to load payments." });
      setLoading(false);
      return;
    }
    setRows(data.records ?? []);
    setTotalCount(data.totalCount ?? 0);
    setPage(data.page ?? nextPage);
    setPageSize(data.pageSize ?? nextPageSize);
    setTotalPages(data.totalPages ?? 1);
    setTabCounts((current) => ({ ...current, [tab]: data.totalCount ?? 0 }));
    setLoading(false);
  }

  async function loadDetail(paymentReferenceId: string) {
    setSelectedRefId(paymentReferenceId);
    setDetailLoading(true);
    setStatusMessage(null);

    const response = await fetch(`/api/bplo/payment-verification/${paymentReferenceId}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as { detail?: PaymentVerificationDetail; error?: string };

    if (!response.ok || !data.detail) {
      setDetail(null);
      setStatusMessage({ kind: "error", text: data.error ?? "Unable to load payment detail." });
      setDetailLoading(false);
      return;
    }

    setDetail(data.detail);
    setRemarks(data.detail.row.reviewerRemarks ?? "");
    setDetailLoading(false);
  }

  useEffect(() => {
    void loadLists(activeTab, page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, pageSize]);

  const isUnderpaid =
    detail ? detail.row.amountPaid < detail.top.totalAmount : false;

  async function verifySelected() {
    if (!detail || detail.row.paymentStatus !== "PENDING") return;

    setActionBusy(true);
    setStatusMessage(null);
    const response = await fetch(
      `/api/bplo/payment-verification/${detail.row.paymentReferenceId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks: remarks.trim() || undefined }),
      }
    );
    const data = (await response.json()) as {
      error?: string;
      result?: { releasePaymentAmount?: number; amountPaid?: number; remainingBalance?: number };
    };
    if (!response.ok) {
      setStatusMessage({ kind: "error", text: data.error ?? "Unable to verify payment." });
      setActionBusy(false);
      return;
    }

    const warning =
      typeof data.result?.releasePaymentAmount === "number" &&
      typeof data.result.amountPaid === "number"
        ? ` Verified payment ${money(data.result.amountPaid)} against required payment amount ${money(data.result.releasePaymentAmount)}.`
        : "";

    setStatusMessage({
      kind: "ok",
      text: `Payment verified successfully. Application moved to Paid.${warning}`,
    });

    await loadLists();
    if (selectedRefId) {
      await loadDetail(selectedRefId);
    }
    setActionBusy(false);
  }

  async function returnForCorrectionSelected() {
    if (!detail || detail.row.paymentStatus !== "PENDING") return;
    if (!remarks.trim()) {
      setStatusMessage({
        kind: "error",
        text: "Remarks are required when returning a payment for correction.",
      });
      return;
    }

    setActionBusy(true);
    setStatusMessage(null);
    const response = await fetch(
      `/api/bplo/payment-verification/${detail.row.paymentReferenceId}/return`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks: remarks.trim() }),
      }
    );
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatusMessage({
        kind: "error",
        text: data.error ?? "Unable to return payment for correction.",
      });
      setActionBusy(false);
      return;
    }

    setStatusMessage({
      kind: "ok",
      text: "Payment returned for correction. Application remains Approved for Payment so the applicant can resubmit a corrected OR and proof.",
    });

    await loadLists();
    if (selectedRefId) {
      await loadDetail(selectedRefId);
    }
    setActionBusy(false);
  }

  return (
    <section className="flex h-[calc(100dvh-var(--header-height,4rem))] flex-col gap-3 p-3 sm:p-4 overflow-hidden" aria-busy={loading || detailLoading}>
      <div className="shrink-0">
        <PageHeader
          eyebrow="BPLO"
          title="Payment Verification"
          description="Verify applicant-submitted payment references for applications in Approved for Payment status."
          badge={<RoleBadge roleType="BPLO" />}
        />
      </div>

      {/* Tabs + status banner — fixed, never scroll away */}
      <div className="shrink-0 space-y-2">
        <SectionCard
          title="Verification Buckets"
          description="Separate queues for pending, verified, and returned-for-correction payment references."
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab("PENDING");
                setPage(1);
              }}
              className={activeTab === "PENDING" ? actionButtonStyles("warning", "sm") : actionButtonStyles("secondary", "sm")}
            >
              Pending Verification ({tabCounts.PENDING})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("VERIFIED");
                setPage(1);
              }}
              className={activeTab === "VERIFIED" ? actionButtonStyles("primary", "sm") : actionButtonStyles("secondary", "sm")}
            >
              Verified Payments ({tabCounts.VERIFIED})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("REJECTED");
                setPage(1);
              }}
              className={activeTab === "REJECTED" ? actionButtonStyles("warning", "sm") : actionButtonStyles("secondary", "sm")}
            >
              Returned for Correction ({tabCounts.REJECTED})
            </button>
          </div>
        </SectionCard>

        {statusMessage ? (
          <InfoBanner
            title={statusMessage.kind === "error" ? "Verification error" : "Verification update"}
            description={statusMessage.text}
            variant={statusMessage.kind === "error" ? "danger" : "success"}
          />
        ) : null}
      </div>

      {/* Split pane — takes all remaining vertical space */}
      <div className="flex min-h-0 flex-1 gap-4 xl:grid xl:grid-cols-[1.25fr_0.95fr]">
        {/* Left pane: queue table + pagination — scrolls independently */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
        <ResponsiveDataTable
          title="Payment Queue"
          description={loading ? "Loading submitted payment references..." : `${totalCount} record${totalCount === 1 ? "" : "s"} in the selected section.`}
          switchAt="xl"
          table={
            loading ? (
              <div className={bploEmptyStateClass}>
                <LoadingState message="Loading payment references for BPLO review…" compact />
              </div>
            ) : rows.length === 0 ? (
              <div className={bploEmptyStateClass}>No records available yet in this section. Submitted payment references will appear here when available.</div>
            ) : (
            <table className={bploTableClass}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Application Number</th>
                  <th>Official Receipt Number</th>
                  <th>Remark</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.paymentReferenceId}>
                    <td>
                      <span className={paymentStatusBadgeClass(row.paymentStatus)}>
                        {row.paymentStatus}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</td>
                    <td className="text-[var(--ink-muted)]">{row.transactionNumber}</td>
                    <td className="text-[var(--ink-muted)]">{passFailLabel(row.paymentStatus)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          void loadDetail(row.paymentReferenceId);
                        }}
                        className={actionButtonStyles("secondary", "sm")}
                      >
                        Verify
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )
          }
          mobile={
            loading ? (
              <div className="p-4">
                <LoadingState message="Loading payment references for BPLO review…" compact />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4 text-sm text-[var(--ink-muted)]">No records available yet in this section.</div>
            ) : (
              <div className="space-y-3 p-4">
                {rows.map((row) => (
                  <article key={row.paymentReferenceId} className={bploMobileRecordCardClass}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">OR: {row.transactionNumber}</p>
                      </div>
                      <span className={paymentStatusBadgeClass(row.paymentStatus)}>
                        {row.paymentStatus}
                      </span>
                    </div>
                    <p className="mt-2 ui-caption">Remark: {passFailLabel(row.paymentStatus)}</p>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          void loadDetail(row.paymentReferenceId);
                        }}
                        className={actionButtonStyles("secondary", "sm")}
                      >
                        Verify
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          }
        />
        </div>

        <PaginationControls
          basePath="/bplo/payment-verification"
          queryParams={{}}
          mode="client"
          isLoading={loading}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          recordLabel="payment references"
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
        />
        </div>

        {/* Right pane: detail — scrolls independently */}
        <SectionCard
          title="Payment Detail"
          description="Review payment reference details and apply BPLO verification actions using existing workflow rules."
          fill
          contentClassName="overflow-y-auto"
        >
          {!selectedRefId ? (
            <div className="text-sm text-[var(--ink-muted)]">Select a payment reference from the queue to review the TOP, applicant details, and BPLO action area.</div>
          ) : detailLoading ? (
            <LoadingState message="Loading payment reference details…" compact />
          ) : !detail ? (
            <div className="text-sm text-[var(--ink-muted)]">Unable to load the selected payment reference details.</div>
          ) : (
            <div className="space-y-4">
              <DetailHeader
                title="Selected Payment Reference"
                subtitle={`${detail.row.applicationNumber} • ${detail.row.transactionNumber}`}
                badge={
                  <span className={paymentStatusBadgeClass(detail.row.paymentStatus)}>
                    {detail.row.paymentStatus === "REJECTED"
                      ? "RETURNED FOR CORRECTION"
                      : detail.row.paymentStatus}
                  </span>
                }
              />

              {detail.row.paymentStatus === "REJECTED" ? (
                <InfoBanner
                  title="Returned for correction"
                  description={
                    detail.row.reviewerRemarks
                      ? `Previous BPLO remarks: ${detail.row.reviewerRemarks}`
                      : "This payment reference was returned for correction. The applicant may submit a corrected OR and proof."
                  }
                  variant="warning"
                />
              ) : null}

              {detail.row.paymentStatus === "PENDING" && isUnderpaid ? (
                <InfoBanner
                  title="Underpaid amount detected"
                  description={`Submitted payment is ${money(detail.row.amountPaid)} while required payment amount is ${money(detail.top.totalAmount)}.`}
                  variant="warning"
                />
              ) : null}

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                <SummaryTile
                  label="Applicant Name"
                  value={detail.applicant.name}
                  helper={detail.applicant.email}
                />
                <SummaryTile
                  label="Business Name"
                  value={detail.business.businessName}
                  helper={`${detail.row.applicationType} application`}
                />
                <SummaryTile
                  label="Application Number"
                  value={detail.row.applicationNumber}
                  helper="Linked application record"
                />
                <SummaryTile
                  label="OR Number / eGov Transaction Number"
                  value={detail.row.transactionNumber}
                  helper="Submitted payment reference identifier"
                />
                <SummaryTile
                  label="Verification Result"
                  value={passFailLabel(detail.row.paymentStatus)}
                  helper="Pass for verified, Returned for correction, Pending when under review"
                />
                <SummaryTile
                  label="Amount Paid"
                  value={money(detail.row.amountPaid)}
                  helper="Submitted by applicant"
                />
                <SummaryTile
                  label="Required Payment Amount"
                  value={money(detail.top.totalAmount)}
                  helper="Total amount due for payment"
                />
                <SummaryTile
                  label="Payment Date"
                  value={formatDateTime(detail.row.paymentDate)}
                  helper="Applicant-submitted payment date"
                />
                <SummaryTile
                  label="Payment Status"
                  value={detail.top.paymentStatus}
                  helper="Assessment settlement status"
                />
                <SummaryTile
                  label="Annual Assessed Amount"
                  value={money(detail.top.annualAssessedAmount)}
                  helper="Full annual assessment basis"
                />
                <SummaryTile
                  label="Remaining Balance"
                  value={money(detail.top.remainingBalance)}
                  helper="Balance after verified payments"
                />
                <SummaryTile
                  label="Mode of Payment"
                  value={detail.top.paymentFrequency ? detail.top.paymentFrequency.replace("_", "-") : "-"}
                  helper="Current TOP release schedule"
                />
                <SummaryTile
                  label="Proof File"
                  value={detail.row.proofFileName}
                  helper="Available for review and download"
                />
              </div>

              {/* CLOSURE-specific fee breakdown */}
              {detail.row.applicationType === "CLOSURE" ? (
                <div className={`${bploHighlightPanelClass} border-[var(--info)] bg-[var(--info-soft)]`}>
                  <p className="mb-3 text-sm font-semibold text-[var(--foreground)]">Closure Application Fees</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SummaryTile
                      label="Closure Certificate Fee"
                      value={money(detail.top.closureCertificateFee ?? 0)}
                      helper="Fixed fee for closure certificate issuance"
                    />
                    <SummaryTile
                      label="Closure Payment Dues / Settlement Amount"
                      value={money(detail.top.closurePaymentDues ?? 0)}
                      helper="Outstanding dues before closure is approved"
                    />
                  </div>
                </div>
              ) : null}

              <div className={bploPanelClass}>
                <p className="text-sm font-semibold text-[var(--foreground)]">Payment Proof</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Submitted file: <span className="font-medium text-[var(--foreground)]">{detail.row.proofFileName}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void openProofModal(detail.row);
                    }}
                    className={actionButtonStyles("secondary", "sm")}
                  >
                    Open Payment Proof
                  </button>
                  <a
                    href={`/api/bplo/payment-verification/${detail.row.paymentReferenceId}/proof`}
                    download
                    className={actionButtonStyles("secondary", "sm")}
                  >
                    Download Payment Proof
                  </a>
                </div>
              </div>

              <div className={`${bploSurfacePanelClass} space-y-3`}>
                <p className="text-sm font-semibold text-[var(--foreground)]">BPLO Review Action</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Add remarks for verification notes. Remarks are required when returning a payment for correction.
                </p>
                <FormField
                  label="BPLO Remarks"
                  hint="Required when returning for correction; optional for approval notes."
                >
                  <textarea
                    aria-label="BPLO Remarks"
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    rows={3}
                    className={bploFormControlClass}
                    placeholder="Add verification notes or return-for-correction reason"
                    readOnly={detail.row.paymentStatus !== "PENDING" || actionBusy}
                  />
                </FormField>

                {detail.row.paymentStatus === "PENDING" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void verifySelected();
                      }}
                      disabled={actionBusy}
                      className={actionButtonStyles("primary", "md")}
                    >
                      Approve / Verify Payment
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void returnForCorrectionSelected();
                      }}
                      disabled={actionBusy}
                      className={actionButtonStyles("warning", "md")}
                    >
                      Return for Correction
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[var(--ink-muted)]">
                    This payment reference is already{" "}
                    {detail.row.paymentStatus === "REJECTED"
                      ? "returned for correction"
                      : detail.row.paymentStatus.toLowerCase()}{" "}
                    and is now read-only.
                  </p>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <Modal
        open={proofModal.open}
        title={proofModal.title}
        description={proofModal.paymentReferenceId ? `OR Number: ${proofModal.orNumber}` : undefined}
        onClose={() => {
          if (proofModal.previewUrl) {
            URL.revokeObjectURL(proofModal.previewUrl);
          }
          closeProofModal();
        }}
        size="lg"
      >
        <div className="space-y-4">
          <div className={bploPanelClass}>
            <p className="text-sm font-semibold text-[var(--foreground)]">Submitted file</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{proofModal.proofFileName || "Not available"}</p>
          </div>

          {proofModal.error ? (
            <InfoBanner title="Preview unavailable" description={proofModal.error} variant="warning" />
          ) : null}

          {proofModal.previewUrl && proofModal.previewKind === "image" ? (
            <img src={proofModal.previewUrl} alt="Payment proof preview" className="max-h-[calc(100dvh-18rem)] w-full rounded-[var(--radius-card)] border border-[var(--border-color)] object-contain" />
          ) : null}

          {proofModal.previewUrl && proofModal.previewKind === "pdf" ? (
            <iframe src={proofModal.previewUrl} title="Payment proof PDF preview" sandbox="allow-same-origin" className="h-[calc(100dvh-18rem)] min-h-[320px] w-full rounded-[var(--radius-card)] border border-[var(--border-color)]" />
          ) : null}

          {!proofModal.previewUrl && !proofModal.error ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--border-color)] p-6 text-sm text-[var(--ink-muted)]">
              Loading payment proof preview…
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <a
              href={proofDownloadHref()}
              download
              className={actionButtonStyles("secondary", "sm")}
            >
              Download Payment Proof
            </a>
            <button type="button" onClick={closeProofModal} className={actionButtonStyles("secondary", "sm")}>Close</button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
