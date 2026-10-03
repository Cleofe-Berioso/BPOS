/** Shared BPLO portal presentational classes (Batch 8D). */

export const bploFormControlClass = "w-full text-sm";

export const bploSummaryTileClass =
  "rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--muted-surface)] p-3.5 sm:p-4";

export const bploSummaryLabelClass = "ui-caption font-semibold uppercase tracking-wide";

export const bploSummaryValueClass = "mt-1 text-sm font-semibold text-[var(--foreground)]";

export const bploPanelClass =
  "rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--muted-surface)] p-3.5 sm:p-4 text-sm text-[var(--ink-muted)]";

export const bploSurfacePanelClass =
  "rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--surface)] p-3.5 sm:p-4";

export const bploHighlightPanelClass =
  "rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--surface)] p-3.5 sm:p-4";

export const bploListCardClass =
  "rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--muted-surface)] p-3.5 sm:p-4";

export const bploMobileRecordCardClass =
  "rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--muted-surface)] p-3.5 sm:p-4";

export const bploWarningPanelClass =
  "rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--warning-soft)] p-3.5 sm:p-4";

export const bploMetaLabelClass = "ui-caption font-semibold uppercase tracking-wide";

export const bploTableClass = "ui-table min-w-full text-sm";

export const bploEmptyStateClass = "px-6 py-8 text-sm text-[var(--ink-muted)]";

export const bploTypeBadgeClass = "ui-badge border-[var(--border-color)] bg-[var(--info-soft)] text-[var(--info)]";

export function paymentStatusBadgeClass(status: "PENDING" | "VERIFIED" | "RETURNED" | "REJECTED" | string): string {
  switch (status) {
    case "PENDING":
      return "ui-badge bg-[var(--warning-soft)] text-[var(--warning)]";
    case "VERIFIED":
      return "ui-badge bg-[var(--success-soft)] text-[var(--success)]";
    case "RETURNED":
      return "ui-badge bg-[var(--warning-soft)] text-[var(--warning)]";
    case "REJECTED":
      return "ui-badge bg-[var(--danger-soft)] text-[var(--danger)]";
    default:
      return "ui-badge bg-[var(--surface-muted)] text-[var(--ink-muted)]";
  }
}
