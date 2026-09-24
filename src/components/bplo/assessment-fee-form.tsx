"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AssessmentDetail, AssessmentLineItem, SavedAssessment } from "@/lib/bplo-assessment";
import {
  bploFormControlClass,
  bploHighlightPanelClass,
  bploPanelClass,
  bploSummaryLabelClass,
  bploSummaryTileClass,
  bploSummaryValueClass,
  bploWarningPanelClass,
} from "@/components/bplo/bplo-ui-styles";
import { actionButtonStyles } from "@/components/ui/action-button";
import { FormField } from "@/components/ui/form-field";
import { InfoBanner } from "@/components/ui/info-banner";
import { SectionCard } from "@/components/ui/section-card";

interface Props {
  detail: AssessmentDetail;
}

type PaymentFrequency = "ANNUAL" | "BI_ANNUAL" | "QUARTERLY";

const PAYMENT_FREQ_LABELS: Record<PaymentFrequency, string> = {
  ANNUAL: "Annual",
  BI_ANNUAL: "Bi-Annual",
  QUARTERLY: "Quarterly",
};

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

function emptyLineItem(index: number): AssessmentLineItem {
  return {
    id: `draft-${index}`,
    description: "",
    amount: 0,
    sortOrder: index,
    isSystemGenerated: false,
  };
}
function normalizeLineItems(lineItems: AssessmentLineItem[]) {
  return lineItems.map((item, index) => ({ ...item, sortOrder: index }));
}

export function AssessmentFeeForm({ detail }: Props) {
  const router = useRouter();
  const existing = detail.assessment;
  const initialLineItems = existing?.lineItems.length
    ? existing.lineItems
    : detail.suggestedLineItems.length
      ? detail.suggestedLineItems
      : [emptyLineItem(0)];

  const [lineItems, setLineItems] = useState<AssessmentLineItem[]>(normalizeLineItems(initialLineItems));
  const [closurePaymentDues, setClosurePaymentDues] = useState(existing?.closurePaymentDues ?? 0);
  const [remarks, setRemarks] = useState(existing?.remarks ?? "");
  const [savedAssessment, setSavedAssessment] = useState<SavedAssessment | null>(existing);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const editableLineItems = lineItems.filter((item) => !item.isSystemGenerated);
  const systemLineItems = lineItems.filter((item) => item.isSystemGenerated);
  const lineItemSubtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const totalAmount = lineItemSubtotal + closurePaymentDues;
  const amountPaid = savedAssessment?.amountPaid ?? 0;
  const remainingBalance = Math.max(0, totalAmount - amountPaid);
  const isTopGenerated = savedAssessment?.status === "GENERATED";
  const isReassessmentPending = Boolean(existing?.reassessmentRequestedAt);
  const isEditable = !isTopGenerated || isReassessmentPending;

  function syncSavedAssessment(saved: SavedAssessment | null) {
    setSavedAssessment(saved);
    if (!saved) {
      return;
    }

    setLineItems(normalizeLineItems(saved.lineItems.length ? saved.lineItems : lineItems));
    setClosurePaymentDues(saved.closurePaymentDues);
    setRemarks(saved.remarks ?? "");
  }

  function addLineItem() {
    setLineItems((current) => normalizeLineItems([...current, emptyLineItem(current.length)]));
  }

  function updateLineItem(index: number, next: Partial<AssessmentLineItem>) {
    setLineItems((current) =>
      normalizeLineItems(
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...next,
              }
            : item
        )
      )
    );
  }

  function removeLineItem(index: number) {
    setLineItems((current) => normalizeLineItems(current.filter((_, itemIndex) => itemIndex !== index)));
  }

  function buildPayload() {
    return {
      lineItems,
      closurePaymentDues,
      remarks: remarks.trim() || undefined,
    };
  }

  const displayPaymentFrequency = savedAssessment?.paymentFrequency ?? detail.applicantPaymentFrequency;

  async function submit(url: string, key: "saved" | "generated") {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });

    const data = (await response.json()) as {
      saved?: SavedAssessment;
      generated?: SavedAssessment;
      error?: string;
    };

    if (!response.ok) {
      setStatusMessage({ kind: "error", text: data.error ?? "Unable to save assessment." });
      return;
    }

    const nextAssessment = data[key] ?? null;
    syncSavedAssessment(nextAssessment);
    setStatusMessage({
      kind: "success",
      text:
        key === "generated"
          ? `Tax Order of Payment generated. TOP No.: ${nextAssessment?.assessmentNumber ?? ""}.`
          : "Assessment draft saved successfully.",
    });
    router.refresh();
  }

  async function handleSaveDraft() {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await submit(`/api/bplo/assessment-fees/${detail.id}/draft`, "saved");
    } catch {
      setStatusMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateTop() {
    const confirmMsg = isReassessmentPending
      ? "Generate Revised Tax Order of Payment?\n\nThis will update the assessment with new fees and replace the previous TOP."
      : "Generate Tax Order of Payment?\n\nThis will lock the assessment, create the TOP number, and move the application to Approved for Payment.";
    
    if (!confirm(confirmMsg)) {
      return;
    }

    setIsGenerating(true);
    setStatusMessage(null);
    try {
      await submit(`/api/bplo/assessment-fees/${detail.id}/generate-top`, "generated");
      // Application moves to APPROVED_FOR_PAYMENT — take BPLO to the payment verification queue.
      setTimeout(() => {
        router.push("/bplo/payment-verification");
      }, 1500);
    } catch {
      setStatusMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="ui-page-stack">
      <InfoBanner
        title="Assessment workspace"
        description="Build the Tax Order of Payment using auditable fee line items. System-generated penalties and closure fees stay locked."
        variant="info"
      />

      {statusMessage ? (
        <InfoBanner
          title={statusMessage.kind === "success" ? "Assessment update" : "Assessment issue"}
          description={statusMessage.text}
          variant={statusMessage.kind === "success" ? "success" : "danger"}
        />
      ) : null}

      <SectionCard title="Application Summary" description="Current assessment target and applicant record.">
        <div className="grid gap-3 text-sm text-[var(--ink-muted)] md:grid-cols-2 xl:grid-cols-4">
          <div>
            <span className={bploSummaryLabelClass}>Application No.</span>
            <p className="font-mono font-medium text-[var(--foreground)]">{detail.applicationNumber}</p>
          </div>
          <div>
            <span className={bploSummaryLabelClass}>Type</span>
            <p className="font-medium capitalize text-[var(--foreground)]">{detail.applicationType.toLowerCase()}</p>
          </div>
          <div>
            <span className={bploSummaryLabelClass}>Status</span>
            <p className="font-medium text-[var(--foreground)]">{detail.status}</p>
          </div>
          <div>
            <span className={bploSummaryLabelClass}>Applicant</span>
            <p className="font-medium text-[var(--foreground)]">{detail.applicant.name}</p>
            <p className="ui-caption">{detail.applicant.email}</p>
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <span className={bploSummaryLabelClass}>Business Name</span>
            <p className="font-medium text-[var(--foreground)]">{detail.businessName}</p>
          </div>
        </div>
      </SectionCard>

      {detail.hasTaxIncentives ? (
        <InfoBanner
          title="Applicant has a declared tax incentive"
          description="This applicant declared a government-granted tax incentive during application. Verify the uploaded Tax Incentive Certificate/Proof before finalizing the assessment."
          variant="warning"
        />
      ) : null}

      <SectionCard title="System Guidance" description="Assessment basis from the current application and automatic penalty rules.">
        {detail.applicationType === "CLOSURE" ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <SummaryTile label="Line of Business" value={detail.lineOfBusiness} />
              <SummaryTile
                label="Closure Certificate Fee"
                value={`₱ ${detail.suggestedFees.closureCertificateFee.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
                helper="Fixed system fee for closure certificate issuance."
              />
              <SummaryTile
                label="Mayor's Permit Fee"
                value="₱ 0.00"
                helper="Not assessed on closure applications."
              />
            </div>
            <div className={`mt-4 ${bploPanelClass}`}>
              Closure rule: Mayor&apos;s Permit Fee is not charged. Enter any outstanding settlement amount below (use ₱0 when none). The ₱100 Closure Certificate Fee is added automatically.
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SummaryTile label="Line of Business" value={detail.lineOfBusiness} />
              <SummaryTile label="Detected Category" value={detail.suggestedFees.detectedCategory} />
              <SummaryTile label="Suggested Mayor's Fee" value={`₱ ${detail.suggestedFees.selectedMayorPermitFee.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`} />
              <SummaryTile
                label="Late Renewal Rule"
                value={
                  detail.applicationType === "RENEWAL" && detail.suggestedFees.overdueMonths > 12
                    ? `${detail.suggestedFees.overdueMonths} months overdue`
                    : "Not triggered"
                }
                helper="Automatic surcharge and interest apply only beyond 1 year overdue."
              />
            </div>

            {detail.applicationType === "RENEWAL" && detail.suggestedFees.renewalComplianceSeverity ? (
              <div className="mt-4">
                <InfoBanner
                  title={`Renewal Compliance Penalty — ${detail.suggestedFees.renewalComplianceSeverity} violation`}
                  description={
                    detail.suggestedFees.renewalCompliancePenalty > 0
                      ? `This business has an unsettled RENEWAL_RELATED non-compliance case (${detail.suggestedFees.renewalComplianceSeverity}). A system-generated penalty of ₱\u00a0${detail.suggestedFees.renewalCompliancePenalty.toLocaleString("en-PH", { minimumFractionDigits: 2 })} will be added to the fee line items.`
                      : `This business has an unsettled RENEWAL_RELATED non-compliance case (${detail.suggestedFees.renewalComplianceSeverity}). No penalty amount is configured — contact the IT Administrator to set the compliance penalty amounts.`
                  }
                  variant="warning"
                />
              </div>
            ) : null}

            <div className={`mt-4 ${bploPanelClass}`}>
              {detail.suggestedFees.computation}
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Fee Line Items"
        description="Add BPLO fee items, then review the system-generated items below."
        action={
          isEditable ? (
            <button type="button" onClick={addLineItem} className={actionButtonStyles("secondary", "md")}>
              Add Item
            </button>
          ) : undefined
        }
      >
        {isTopGenerated && !isReassessmentPending ? (
          <div className="mb-4">
            <InfoBanner
              title="TOP already generated"
              description="Fee items are locked because the Tax Order of Payment has already been generated."
              variant="success"
            />
          </div>
        ) : isReassessmentPending ? (
          <div className="mb-4">
            <InfoBanner
              title="Reassessment requested"
              description="Applicant requested TOP revision. Update fees and generate a revised Tax Order of Payment below."
              variant="warning"
            />
          </div>
        ) : null}

        <div className="space-y-3">
          {editableLineItems.map((item) => {
            const actualIndex = lineItems.findIndex((candidate) => candidate.id === item.id);
            return (
              <div key={item.id} className={`grid gap-3 ${bploHighlightPanelClass} md:grid-cols-[1fr_180px_auto]`}>
                <input
                  aria-label="Fee description"
                  value={item.description}
                  disabled={!isEditable}
                  onChange={(event) => updateLineItem(actualIndex, { description: event.target.value })}
                  placeholder="Fee description"
                  className={bploFormControlClass}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label="Fee amount"
                  value={item.amount}
                  disabled={!isEditable}
                  onChange={(event) => updateLineItem(actualIndex, { amount: Number(event.target.value) || 0 })}
                  className={`${bploFormControlClass} text-right`}
                />
                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => removeLineItem(actualIndex)}
                  className={actionButtonStyles("ghost", "md")}
                >
                  Remove
                </button>
              </div>
            );
          })}

          {editableLineItems.length === 0 ? (
            <div className={`rounded-[var(--radius-card)] border border-dashed border-[var(--border-color)] bg-[var(--muted-surface)] p-4 text-sm text-[var(--ink-muted)]`}>
              No BPLO-entered fee items yet.
            </div>
          ) : null}

          {systemLineItems.length > 0 ? (
            <div className="space-y-3 pt-2">
              <p className={bploSummaryLabelClass}>System-generated items</p>
              {systemLineItems.map((item) => (
                <div key={item.id} className={`grid gap-3 ${bploWarningPanelClass} md:grid-cols-[1fr_180px]`}>
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{item.description}</p>
                    <p className="ui-caption">Automatically computed and not editable.</p>
                  </div>
                  <div className="rounded-[var(--radius-control)] border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-right text-sm font-medium text-[var(--foreground)]">
                    ₱ {item.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </SectionCard>

      {detail.applicationType === "CLOSURE" ? (
        <SectionCard
          title="Closure Charges"
          description="Payment dues are BPLO-entered. The fixed closure certificate fee of ₱100 is added automatically."
        >
          <FormField label="Settlement / Outstanding Amount" hint="Enter outstanding dues if any. Use 0 when the business has no settlement balance — the ₱100 certificate fee still applies.">
            <input
              type="number"
              min="0"
              step="0.01"
              aria-label="Settlement / Outstanding Amount"
              value={closurePaymentDues}
              disabled={!isEditable}
              onChange={(event) => setClosurePaymentDues(Number(event.target.value) || 0)}
              className={`${bploFormControlClass} text-right`}
            />
          </FormField>
        </SectionCard>
      ) : null}

      <SectionCard title="TOP Summary" description="Assessment totals are recalculated on the server during draft save and TOP generation.">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-3">
          <SummaryTile
            label="Mode of Payment"
            value={displayPaymentFrequency ? PAYMENT_FREQ_LABELS[displayPaymentFrequency] : "Not selected"}
            helper="Applicant-selected frequency (read-only for BPLO)."
          />
          <SummaryTile label="Total Amount" value={`₱ ${totalAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`} />
          <SummaryTile label="Remaining Balance" value={`₱ ${remainingBalance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`} />
        </div>

        <div className="mt-4">
          <FormField label="Remarks" hint="Explain manual adjustments or special cases for audit review.">
            <textarea
              rows={4}
              aria-label="Remarks"
              value={remarks}
              disabled={!isEditable}
              onChange={(event) => setRemarks(event.target.value)}
              className={bploFormControlClass}
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard
        title="Actions"
        description="Save the draft to continue later, or generate the Tax Order of Payment to move the application forward."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/bplo/assessment-fees" className={actionButtonStyles("ghost", "md")}>
              Back to Queue
            </Link>
            {isEditable ? (
              <button
                type="button"
                disabled={isSaving || isGenerating}
                onClick={() => {
                  void handleSaveDraft();
                }}
                className={actionButtonStyles("secondary", "md")}
              >
                Save Draft
              </button>
            ) : null}
            <button
              type="button"
              disabled={!isEditable || isSaving || isGenerating}
              onClick={() => {
                void handleGenerateTop();
              }}
              className={actionButtonStyles("primary", "md")}
            >
              {isReassessmentPending ? "Generate Revised TOP" : "Generate TOP"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-[var(--ink-muted)]">
          Applicant payment submission becomes available only after TOP generation. Payment verification and permit issuance continue in their own modules.
        </p>
      </SectionCard>
    </div>
  );
}
