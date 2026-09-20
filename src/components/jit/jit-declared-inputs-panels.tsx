"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  mapDocumentValidationStatusToUi,
  validationStatusBadgeClass,
} from "@/lib/document-validation";
import type { JitDeclaredInputsPayload } from "@/lib/jit-declared-inputs";
import {
  jitSummaryLabelClass,
  jitSummaryTileClass,
  jitSummaryValueClass,
  jitTableClass,
} from "@/components/jit/jit-ui-styles";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionCard } from "@/components/ui/section-card";
import { DocumentPreviewButton } from "@/components/ui/document-preview-button";

function ReadOnlyField({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display =
    value == null || value === ""
      ? "Not available"
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value);

  return (
    <div className={jitSummaryTileClass}>
      <p className={jitSummaryLabelClass}>{label}</p>
      <p className={jitSummaryValueClass}>{display}</p>
    </div>
  );
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function ValidationBadge({ status }: { status: string }) {
  const uiStatus = mapDocumentValidationStatusToUi(status);
  return (
    <span className={`ui-badge ${validationStatusBadgeClass(uiStatus)}`}>
      {uiStatus}
    </span>
  );
}

function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          {description && (
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{description}</p>
          )}
        </div>
        <span className="shrink-0 text-[var(--ink-muted)]">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {isOpen && <div className="border-t border-[var(--border-color)] px-4 py-3">{children}</div>}
    </div>
  );
}

export function JitDeclaredInputsPanels({
  declaredInputs,
  isLoading,
}: {
  declaredInputs: JitDeclaredInputsPayload | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <SectionCard title="Declared Inputs" description="Loading declared application data for validation.">
        <LoadingState message="Loading declared business information…" compact />
      </SectionCard>
    );
  }

  if (!declaredInputs) {
    return null;
  }

  const previewBase = `/api/jit/applications/${declaredInputs.applicationId}/documents`;

  return (
    <SectionCard
      title="Declared Inputs (Expand to Review)"
      description="Read-only declared data from the latest released application. Expand each section to review."
    >
      <div className="space-y-2">
        <CollapsibleSection
          title="Business Information"
          description="Declared identity and registration details."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(declaredInputs.businessInformation).map(([key, value]) => (
              <ReadOnlyField key={key} label={formatLabel(key)} value={value} />
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Business Operation Details"
          description="Declared operation, workforce, and financial operation fields."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(declaredInputs.operationDetails).map(([key, value]) => (
              <ReadOnlyField key={key} label={formatLabel(key)} value={value} />
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Uploaded Documents"
          description="Documents submitted with the released application."
        >
          {declaredInputs.documents.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No uploaded documents found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={jitTableClass}>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>File</th>
                    <th>Uploaded</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {declaredInputs.documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="font-medium text-[var(--foreground)]">{doc.documentName}</td>
                      <td className="text-[var(--ink-muted)]">{doc.fileName}</td>
                      <td className="text-[var(--ink-muted)]">{new Date(doc.uploadedAt).toLocaleString("en-PH")}</td>
                      <td>
                        <DocumentPreviewButton url={`${previewBase}/${doc.id}/preview`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Document Validation / Approved Clearances"
          description="Validation statuses for required clearance documents."
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReadOnlyField label="Assessment Number" value={declaredInputs.treasurerSummary.assessmentNumber} />
            <ReadOnlyField
              label="Annual Assessed Amount"
              value={
                declaredInputs.treasurerSummary.annualAssessedAmount != null
                  ? `₱ ${declaredInputs.treasurerSummary.annualAssessedAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                  : null
              }
            />
            <ReadOnlyField
              label="Amount Paid"
              value={
                declaredInputs.treasurerSummary.amountPaid != null
                  ? `₱ ${declaredInputs.treasurerSummary.amountPaid.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                  : null
              }
            />
            <ReadOnlyField
              label="Verified Payments"
              value={declaredInputs.treasurerSummary.verifiedPaymentCount}
            />
          </div>

          {declaredInputs.clearances.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No mapped clearance documents for this application type.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={jitTableClass}>
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Clearance</th>
                    <th>Status</th>
                    <th>Remarks</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {declaredInputs.clearances.map((row) => (
                    <tr key={`${row.departmentKey}-${row.clearanceLabel}`}>
                      <td className="text-[var(--ink-muted)]">{row.departmentLabel}</td>
                      <td className="font-medium text-[var(--foreground)]">{row.clearanceLabel}</td>
                      <td>
                        <ValidationBadge status={row.validationStatus} />
                      </td>
                      <td className="text-[var(--ink-muted)]">{row.validationRemarks ?? "-"}</td>
                      <td>
                        {row.documentId ? (
                          <DocumentPreviewButton url={`${previewBase}/${row.documentId}/preview`} />
                        ) : (
                          <span className="text-[var(--ink-muted)]">Not uploaded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </SectionCard>
  );
}
