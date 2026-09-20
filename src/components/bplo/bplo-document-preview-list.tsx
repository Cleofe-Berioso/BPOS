"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentValidationStatus } from "@prisma/client";
import {
  bploFormControlClass,
  bploHighlightPanelClass,
  bploListCardClass,
  bploMetaLabelClass,
  bploPanelClass,
  bploSummaryLabelClass,
} from "@/components/bplo/bplo-ui-styles";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { actionButtonStyles } from "@/components/ui/action-button";
import {
  DOCUMENT_VALIDATION_UI_STATUSES,
  mapDocumentValidationStatusToUi,
  remarksRequiredForValidationStatus,
  validationStatusBadgeClass,
  type DocumentValidationUiStatus,
} from "@/lib/document-validation";

export type BploDocumentListItem = {
  id: string;
  documentName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  validationStatus?: string;
  validationRemarks?: string | null;
  validatedAt?: string | null;
};

type BploDocumentPreviewListProps = {
  applicationId: string;
  documents: BploDocumentListItem[];
  onDocumentsChange?: (documents: BploDocumentListItem[]) => void;
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

const UI_TO_DB_OPTION: Record<DocumentValidationUiStatus, DocumentValidationStatus> = {
  "Pending Review": "PENDING_REVIEW",
  Valid: "VALID",
  Invalid: "INVALID",
  Incomplete: "INCOMPLETE",
  "Requires Resubmission": "REQUIRES_RESUBMISSION",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension ? extension.toLowerCase() : "";
}

function resolvePreviewType(document: BploDocumentListItem | null) {
  if (!document) return "unsupported" as const;
  if (document.mimeType === "application/pdf" || getFileExtension(document.fileName) === "pdf") {
    return "pdf" as const;
  }
  if (document.mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(getFileExtension(document.fileName))) {
    return "image" as const;
  }
  return "unsupported" as const;
}

function ValidationStatusBadge({ status }: { status?: string }) {
  const uiStatus = mapDocumentValidationStatusToUi(status);
  return (
    <span className={`ui-badge ${validationStatusBadgeClass(uiStatus)}`}>
      {uiStatus}
    </span>
  );
}

function DocumentValidationEditor({
  applicationId,
  document,
  onSaved,
}: {
  applicationId: string;
  document: BploDocumentListItem;
  onSaved: (updated: BploDocumentListItem) => void;
}) {
  const router = useRouter();
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

    const response = await fetch(
      `/api/bplo/applications/${applicationId}/documents/${document.id}/validation`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          status: UI_TO_DB_OPTION[status],
          remarks: remarks.trim() || undefined,
        }),
      }
    );

    const data = (await response.json()) as {
      error?: string;
      document?: BploDocumentListItem;
    };

    setSaving(false);

    if (!response.ok || !data.document) {
      setError(data.error ?? "Unable to save validation status.");
      return;
    }

    onSaved(data.document);
    router.refresh();
  }

  return (
    <div className={`mt-3 space-y-2 ${bploHighlightPanelClass} p-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`validation-status-${document.id}`} className={bploMetaLabelClass}>
          Validation Status
        </label>
        <ValidationStatusBadge status={status} />
      </div>
      <select
        id={`validation-status-${document.id}`}
        value={status}
        onChange={(event) => setStatus(event.target.value as DocumentValidationUiStatus)}
        className={bploFormControlClass}
      >
        {DOCUMENT_VALIDATION_UI_STATUSES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <div>
        <label htmlFor={`validation-remarks-${document.id}`} className={bploMetaLabelClass}>
          Validation Remarks {remarksRequired ? "(required)" : "(optional)"}
        </label>
        <textarea
          id={`validation-remarks-${document.id}`}
          rows={2}
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          className={`mt-1 ${bploFormControlClass}`}
          placeholder={remarksRequired ? "Explain why this document needs correction." : "Optional reviewer notes."}
        />
      </div>
      {error ? <p className="ui-inline-error text-xs">{error}</p> : null}
      <button
        type="button"
        disabled={saving}
        onClick={() => void saveValidation()}
        className={actionButtonStyles("primary", "sm")}
      >
        {saving ? "Saving..." : "Save Validation"}
      </button>
    </div>
  );
}

export function BploDocumentPreviewList({
  applicationId,
  documents: initialDocuments,
  onDocumentsChange,
}: BploDocumentPreviewListProps) {
  const [documents, setDocuments] = useState(initialDocuments);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  function updateDocuments(next: BploDocumentListItem[] | ((current: BploDocumentListItem[]) => BploDocumentListItem[])) {
    setDocuments((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      onDocumentsChange?.(resolved);
      return resolved;
    });
  }
  const [selectedDocument, setSelectedDocument] = useState<BploDocumentListItem | null>(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const previewType = useMemo(() => resolvePreviewType(selectedDocument), [selectedDocument]);
  const previewUrl = useMemo(() => {
    if (!applicationId || !selectedDocument?.id) {
      return null;
    }

    return `/api/bplo/applications/${applicationId}/documents/${selectedDocument.id}/preview`;
  }, [applicationId, selectedDocument]);

  const unavailablePreviewError =
    isDocumentModalOpen && selectedDocument && !previewUrl ? "Document preview URL is unavailable." : null;
  const displayPreviewError = previewError ?? unavailablePreviewError;

  function openDocument(document: BploDocumentListItem) {
    const type = resolvePreviewType(document);
    setSelectedDocument(document);
    setIsDocumentModalOpen(true);
    setPreviewError(null);
    setDownloadError(null);
    setIsPreviewLoading(type === "image" || type === "pdf");
  }

  function closeDocumentModal() {
    setIsDocumentModalOpen(false);
    setSelectedDocument(null);
    setIsPreviewLoading(false);
    setPreviewError(null);
  }

  function handleValidationSaved(updated: BploDocumentListItem) {
    updateDocuments((current) =>
      current.map((doc) => (doc.id === updated.id ? { ...doc, ...updated } : doc))
    );
    setSelectedDocument((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
  }

  async function downloadDocument(document: BploDocumentListItem) {
    if (!applicationId || !document.id || isDownloading) return;

    setIsDownloading(true);
    setDownloadingDocumentId(document.id);
    setDownloadError(null);
    if (isDocumentModalOpen) {
      setPreviewError(null);
    }

    try {
      const response = await fetch(
        `/api/bplo/applications/${applicationId}/documents/${document.id}/download`,
        {
          method: "GET",
          credentials: "same-origin",
          headers: {
            "ngrok-skip-browser-warning": "true",
          },
        }
      );

      if (!response.ok) {
        let message = `Unable to download document (HTTP ${response.status}).`;
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // Keep status-based message when body is not JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = document.fileName || document.documentName || "document";
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to download document.";
      setDownloadError(message);
      if (isDocumentModalOpen) {
        setPreviewError(message);
      }
    } finally {
      setIsDownloading(false);
      setDownloadingDocumentId(null);
    }
  }

  const footer = selectedDocument ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {previewUrl ? (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={actionButtonStyles("secondary", "sm")}
        >
          Open in New Tab
        </a>
      ) : (
        <button type="button" className={actionButtonStyles("readOnly", "sm")} disabled>
          Open in New Tab
        </button>
      )}
      <button
        type="button"
        onClick={() => void downloadDocument(selectedDocument)}
        disabled={isDownloading}
        className={actionButtonStyles("secondary", "sm")}
      >
        {isDownloading && downloadingDocumentId === selectedDocument.id ? "Downloading…" : "Download"}
      </button>
      <button type="button" onClick={closeDocumentModal} className={actionButtonStyles("primary", "sm")}>
        Close
      </button>
    </div>
  ) : undefined;

  return (
    <>
      <ul className="space-y-2 text-sm text-[var(--ink-muted)]">
        {documents.map((document) => (
          <li
            key={document.id}
            className={`${bploListCardClass} px-3 py-3`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[var(--foreground)]">
                  <strong>{document.documentName}</strong>: {document.fileName}
                </p>
                <p className="ui-caption">Uploaded: {formatDateTime(document.uploadedAt)}</p>
                <div className="mt-1">
                  <ValidationStatusBadge status={document.validationStatus} />
                </div>
                {document.validationRemarks ? (
                  <p className="mt-2 ui-caption">
                    <span className="font-semibold text-[var(--foreground)]">Remarks:</span> {document.validationRemarks}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openDocument(document)}
                  className={actionButtonStyles("secondary", "sm")}
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => void downloadDocument(document)}
                  disabled={isDownloading}
                  className={actionButtonStyles("secondary", "sm")}
                >
                  {isDownloading && downloadingDocumentId === document.id ? "Downloading…" : "Download"}
                </button>
              </div>
            </div>
            <DocumentValidationEditor
              applicationId={applicationId}
              document={document}
              onSaved={handleValidationSaved}
            />
          </li>
        ))}
        {documents.length === 0 ? (
          <li>
            <EmptyState title="No uploaded documents" description="No records available yet for this application." />
          </li>
        ) : null}
      </ul>

      {!isDocumentModalOpen && downloadError ? (
        <div className="mt-3 rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {downloadError}
        </div>
      ) : null}

      <Modal
        open={isDocumentModalOpen}
        title={selectedDocument?.documentName ?? "Document Preview"}
        description="Preview uploaded requirements without leaving the application review page."
        onClose={closeDocumentModal}
        footer={footer}
        size="lg"
      >
        {selectedDocument ? (
          <div className="space-y-4">
            <div className={`grid gap-3 ${bploPanelClass} md:grid-cols-3`}>
              <div>
                <p className={bploSummaryLabelClass}>Requirement</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{selectedDocument.documentName}</p>
              </div>
              <div>
                <p className={bploSummaryLabelClass}>Uploaded Filename</p>
                <p className="mt-1 break-all font-medium text-[var(--foreground)]">{selectedDocument.fileName}</p>
              </div>
              <div>
                <p className={bploSummaryLabelClass}>Uploaded</p>
                <p className="mt-1 font-medium text-[var(--foreground)]">{formatDateTime(selectedDocument.uploadedAt)}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--muted-surface)]">
              {!previewUrl ? (
                <div className="flex min-h-[22rem] items-center justify-center px-6 py-10 text-center text-sm text-[var(--danger)] sm:min-h-[28rem]">
                  Document preview URL is unavailable.
                </div>
              ) : previewType === "unsupported" ? (
                <div className="flex min-h-[22rem] items-center justify-center px-6 py-10 text-center text-sm text-[var(--ink-muted)] sm:min-h-[28rem]">
                  Preview is not available for this file type.
                </div>
              ) : previewType === "image" ? (
                <div className="relative flex min-h-[22rem] items-center justify-center bg-[var(--surface)] p-4 sm:min-h-[28rem]">
                  {isPreviewLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]/80 text-sm text-[var(--ink-muted)]">
                      Loading preview...
                    </div>
                  ) : null}
                  <img
                    src={previewUrl}
                    alt={selectedDocument.fileName}
                    className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain"
                    onLoad={() => setIsPreviewLoading(false)}
                    onError={() => {
                      setIsPreviewLoading(false);
                      setPreviewError("Unable to load this image preview.");
                    }}
                  />
                </div>
              ) : (
                <div className="relative bg-[var(--surface)]">
                  {isPreviewLoading ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface)]/85 text-sm text-[var(--ink-muted)]">
                      Loading preview...
                    </div>
                  ) : null}
                  <iframe
                    title={selectedDocument.fileName}
                    src={previewUrl}
                    className="h-[70vh] w-full bg-white"
                    onLoad={() => setIsPreviewLoading(false)}
                  />
                </div>
              )}
            </div>

            {displayPreviewError ? (
              <div className="rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
                {displayPreviewError}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
