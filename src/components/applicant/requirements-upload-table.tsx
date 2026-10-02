"use client";

import {
  mapDocumentValidationStatusToUi,
  validationStatusBadgeClass,
} from "@/lib/document-validation";
import { actionButtonStyles } from "@/components/ui/action-button";
import { DocumentDownloadButton } from "@/components/ui/document-download-button";
import {
  applicantListCardClass,
  applicantMetaLabelClass,
  applicantTableClass,
} from "@/components/applicant/applicant-ui-styles";

export interface RequirementUploadRowData {
  documentName: string;
  description: string;
  required: boolean;
  isClearance?: boolean;
  uploadedDocumentName?: string;
  fileName?: string;
  uploadedAt?: Date | string;
  previewUrl?: string;
  error?: string;
  remarks?: string;
  validationStatus?: string;
  disabled?: boolean;
}

interface RequirementsUploadTableProps {
  rows: RequirementUploadRowData[];
  accept?: string;
  onFileChange: (documentName: string, file: File | null) => void;
  onRemove: (documentName: string) => void;
}

function formatUploadTimestamp(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    }).format(new Date(date));
  } catch {
    return "";
  }
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function RequirementBadge({ required }: { required: boolean }) {
  return (
    <span
      className={`ui-badge ${
        required
          ? "bg-[var(--danger-soft)] text-[var(--danger)]"
          : "bg-[var(--muted-surface)] text-[var(--ink-muted)]"
      }`}
    >
      {required ? "Required" : "Optional"}
    </span>
  );
}

function UploadStatusBadge({ fileName, uploadedAt }: { fileName?: string; uploadedAt?: Date | string }) {
  if (!fileName) {
    return (
      <span className="ui-badge bg-[var(--surface)] text-[var(--ink-muted)]">
        Pending
      </span>
    );
  }

  if (uploadedAt) {
    return (
      <span className="ui-badge bg-[var(--success-soft)] text-[var(--success)]">
        Uploaded
      </span>
    );
  }

  return (
    <span className="ui-badge bg-[var(--warning-soft)] text-[var(--warning)]">
      Selected
    </span>
  );
}

export function ValidationStatusBadge({ status }: { status?: string }) {
  if (!status) {
    return <span className="text-sm text-[var(--ink-muted)]">—</span>;
  }

  const uiStatus = mapDocumentValidationStatusToUi(status);
  return (
    <span className={`ui-badge ${validationStatusBadgeClass(uiStatus)}`}>
      {uiStatus}
    </span>
  );
}

function RequirementActions({
  documentName,
  fileName,
  previewUrl,
  accept,
  disabled,
  inputId,
  actionLabel,
  onFileChange,
  onRemove,
}: {
  documentName: string;
  fileName?: string;
  previewUrl?: string;
  accept?: string;
  disabled?: boolean;
  inputId: string;
  actionLabel?: string;
  onFileChange: (documentName: string, file: File | null) => void;
  onRemove: () => void;
}) {
  const label = fileName ? "Replace" : actionLabel || "Upload";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor={inputId}
        className={
          disabled
            ? `${actionButtonStyles("secondary", "sm")} cursor-not-allowed opacity-60`
            : `${actionButtonStyles("primary", "sm")} cursor-pointer`
        }
      >
        {label}
      </label>
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        aria-label={`${label} ${documentName}`}
        onChange={(event) => {
          onFileChange(documentName, event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      {fileName && previewUrl ? (
        <DocumentDownloadButton url={previewUrl} fileName={fileName} />
      ) : null}
      {fileName ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className={`${actionButtonStyles("danger", "sm")} disabled:opacity-60`}
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

function UploadedFileCell({
  fileName,
  uploadedAt,
}: {
  fileName?: string;
  uploadedAt?: Date | string;
  uploadedDocumentName?: string;
  isAffidavit?: boolean;
}) {
  if (!fileName) {
    return <span className="text-sm italic text-[var(--ink-muted)]">No file uploaded yet.</span>;
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-[var(--foreground)] break-all">{fileName}</p>
      {uploadedAt ? (
        <p className="ui-caption">Uploaded {formatUploadTimestamp(uploadedAt)}</p>
      ) : (
        <p className="ui-caption">Ready to submit on final application submission</p>
      )}
    </div>
  );
}

function RemarksCell({ error, remarks }: { error?: string; remarks?: string }) {
  const text = remarks?.trim() || error?.trim();
  if (!text) {
    return <span className="text-sm text-[var(--ink-muted)]">—</span>;
  }

  return (
    <p className={`text-sm ${error ? "font-medium text-[var(--danger)]" : "text-[var(--ink-muted)]"}`}>{text}</p>
  );
}

export function RequirementsUploadTable({
  rows,
  accept,
  onFileChange,
  onRemove,
}: RequirementsUploadTableProps) {
  return (
    <div className="space-y-4">
      <div className="hidden overflow-x-auto md:block">
        <table className={applicantTableClass}>
          <caption className="sr-only">Required documents upload table</caption>
          <thead>
            <tr>
              <th scope="col">Requirement / Document Name</th>
              <th scope="col">Description / Purpose</th>
              <th scope="col" className="whitespace-nowrap">Required / Optional</th>
              <th scope="col">Uploaded File</th>
              <th scope="col">Action</th>
              <th scope="col" className="whitespace-nowrap">Validation Status</th>
              <th scope="col">Remarks / Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const activeUploadDocName = row.documentName;
              const removeDocName = row.uploadedDocumentName || row.documentName;
              const inputId = `req-upload-${slugify(activeUploadDocName)}`;
              const hasError = Boolean(row.error && !row.fileName);

              return (
                <tr
                  key={row.documentName}
                  className={hasError ? "bg-[var(--danger-soft)]/40" : undefined}
                >
                  <td className="font-medium text-[var(--foreground)]">
                    <div className="font-semibold">{row.documentName}</div>
                  </td>
                  <td className="text-[var(--ink-muted)]">
                    {row.description}
                  </td>
                  <td>
                    <RequirementBadge required={row.required} />
                  </td>
                  <td>
                    <UploadedFileCell
                      fileName={row.fileName}
                      uploadedAt={row.uploadedAt}
                    />
                  </td>
                  <td>
                    <RequirementActions
                      documentName={activeUploadDocName}
                      fileName={row.fileName}
                      previewUrl={row.previewUrl}
                      accept={accept}
                      disabled={row.disabled}
                      inputId={inputId}
                      actionLabel="Upload"
                      onFileChange={onFileChange}
                      onRemove={() => onRemove(removeDocName)}
                    />
                  </td>
                  <td>
                    <ValidationStatusBadge status={row.fileName ? row.validationStatus ?? "Pending Review" : undefined} />
                  </td>
                  <td>
                    <RemarksCell error={row.error} remarks={row.remarks} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => {
          const activeUploadDocName = row.documentName;
          const removeDocName = row.uploadedDocumentName || row.documentName;
          const inputId = `req-upload-mobile-${slugify(activeUploadDocName)}`;
          const hasError = Boolean(row.error && !row.fileName);

          return (
            <article
              key={row.documentName}
              className={`${applicantListCardClass} ${
                hasError ? "border-[var(--danger)] bg-[var(--danger-soft)]/40" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{row.documentName}</h3>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <RequirementBadge required={row.required} />
                  <UploadStatusBadge fileName={row.fileName} uploadedAt={row.uploadedAt} />
                </div>
              </div>

              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className={applicantMetaLabelClass}>Description / Purpose</dt>
                  <dd className="mt-0.5 text-[var(--ink-muted)]">
                    {row.description}
                  </dd>
                </div>
                <div>
                  <dt className={applicantMetaLabelClass}>Uploaded File</dt>
                  <dd className="mt-0.5">
                    <UploadedFileCell
                      fileName={row.fileName}
                      uploadedAt={row.uploadedAt}
                    />
                  </dd>
                </div>
                <div>
                  <dt className={applicantMetaLabelClass}>Action</dt>
                  <dd className="mt-1">
                    <RequirementActions
                      documentName={activeUploadDocName}
                      fileName={row.fileName}
                      previewUrl={row.previewUrl}
                      accept={accept}
                      disabled={row.disabled}
                      inputId={inputId}
                      actionLabel="Upload"
                      onFileChange={onFileChange}
                      onRemove={() => onRemove(removeDocName)}
                    />
                  </dd>
                </div>
                <div>
                  <dt className={applicantMetaLabelClass}>Validation Status</dt>
                  <dd className="mt-1">
                    <ValidationStatusBadge status={row.fileName ? row.validationStatus ?? "Pending Review" : undefined} />
                  </dd>
                </div>
                {(row.remarks || row.error) && (
                  <div>
                    <dt className={applicantMetaLabelClass}>Remarks / Notes</dt>
                    <dd className="mt-0.5">
                      <RemarksCell error={row.error} remarks={row.remarks} />
                    </dd>
                  </div>
                )}
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}
