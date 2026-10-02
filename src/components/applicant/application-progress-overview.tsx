import Link from "next/link";
import { applicantSummaryLabelClass, applicantSummaryTileClass } from "@/components/applicant/applicant-ui-styles";
import { AlertCircle, Check, Clock3, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoBanner } from "@/components/ui/info-banner";
import { StatusBadge, getStatusBanner } from "@/components/ui/status-badge";
import { actionButtonStyles } from "@/components/ui/action-button";
import type { ApplicantLatestApplicationRow } from "@/lib/applicant-dashboard";
import type { ApplicationStatus } from "@/lib/applicant-types";

const WORKFLOW_STEPS = [
  "Submitted",
  "BPLO Review",
  "Department Head Approval",
  "Assessment",
  "Payment",
  "For Release",
  "Released",
] as const;

type StepState = "completed" | "current" | "pending" | "returned" | "rejected" | "released";

function getCurrentStepIndex(status: ApplicationStatus): number {
  switch (status) {
    case "Draft":
      return -1;
    case "Submitted":
      return 0;
    case "Under Review":
      return 1;
    case "Department Head Review":
    case "Department Head Approved":
      return 2;
    case "Assessed":
      return 3;
    case "Approved for Payment":
      return 4;
    case "Paid":
    case "For Release":
      return 5;
    case "Released":
      return 6;
    case "Returned for Correction":
    case "Rejected":
      return 1;
    default:
      return 1;
  }
}

function getStepState(status: ApplicationStatus, currentIndex: number, index: number): StepState {
  if (status === "Returned for Correction" && index === currentIndex) return "returned";
  if (status === "Rejected" && index === currentIndex) return "rejected";
  if (status === "Released" && index === currentIndex) return "released";
  if (index < currentIndex) return "completed";
  if (index === currentIndex) return "current";
  return "pending";
}

function formatDateLabel(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T12:00:00Z`)
    : new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) return null;

  const hasTime = !/^\d{4}-\d{2}-\d{2}$/.test(trimmed);

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: hasTime ? "short" : undefined,
    timeZone: "Asia/Manila",
  }).format(parsed);
}

function getStateMeta(state: StepState) {
  switch (state) {
    case "completed":
      return {
        pill: "Completed",
        pillClassName: "bg-[var(--success-soft)] text-[var(--success)]",
        containerClassName: "border-[var(--border-color)] bg-[var(--surface)]",
        labelClassName: "text-[var(--foreground)]",
        circleClassName: "border-[var(--success)] bg-[var(--success)] text-white",
        icon: Check,
      };
    case "current":
      return {
        pill: "Current stage",
        pillClassName: "bg-[var(--primary-soft)] text-[var(--primary-strong)]",
        containerClassName: "border-[var(--border-color)] bg-[var(--surface)]",
        labelClassName: "text-[var(--foreground)]",
        circleClassName: "border-[var(--primary)] bg-[var(--surface)] text-[var(--primary-strong)] ring-2 ring-[var(--primary-soft)]",
        icon: null,
      };
    case "released":
      return {
        pill: "Released",
        pillClassName: "bg-[var(--success-soft)] text-[var(--success)]",
        containerClassName: "border-[var(--border-color)] bg-[var(--surface)]",
        labelClassName: "text-[var(--foreground)]",
        circleClassName: "border-[var(--success)] bg-[var(--success)] text-white ring-2 ring-[var(--success-soft)]",
        icon: Check,
      };
    case "returned":
      return {
        pill: "Returned",
        pillClassName: "bg-[var(--warning-soft)] text-[var(--warning)]",
        containerClassName: "border-[var(--border-color)] bg-[var(--surface)]",
        labelClassName: "text-[var(--foreground)]",
        circleClassName: "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)] ring-2 ring-[var(--warning-soft)]",
        icon: AlertCircle,
      };
    case "rejected":
      return {
        pill: "Rejected",
        pillClassName: "bg-[var(--danger-soft)] text-[var(--danger)]",
        containerClassName: "border-[var(--border-color)] bg-[var(--surface)]",
        labelClassName: "text-[var(--foreground)]",
        circleClassName: "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)] ring-2 ring-[var(--danger-soft)]",
        icon: X,
      };
    case "pending":
      return {
        pill: "Pending",
        pillClassName: "bg-[var(--muted-surface)] text-[var(--ink-muted)]",
        containerClassName: "border-[var(--border-color)] bg-[var(--surface)]",
        labelClassName: "text-[var(--ink-muted)]",
        circleClassName: "border-[var(--border-color)] bg-[var(--surface)] text-[var(--ink-muted)]",
        icon: Clock3,
      };
  }
}

function StepCircle({
  index,
  state,
}: {
  index: number;
  state: StepState;
}) {
  const meta = getStateMeta(state);
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border-2 ${meta.circleClassName}`}
      aria-hidden="true"
    >
      {Icon ? <Icon className="h-4 w-4" /> : <span className="text-sm font-semibold">{index + 1}</span>}
    </span>
  );
}

function StepCard({
  label,
  index,
  state,
  dateLabel,
}: {
  label: string;
  index: number;
  state: StepState;
  dateLabel?: string | null;
}) {
  const meta = getStateMeta(state);

  return (
    <li className={`relative flex gap-4 rounded-[var(--radius-card)] border p-4 shadow-sm before:absolute before:left-5 before:top-10 before:bottom-[-0.5rem] before:border-l before:border-dashed before:border-[var(--border-color)] before:content-[''] last:before:hidden ${meta.containerClassName}`}>
      <div className="relative flex flex-col items-center pt-0.5">
        <StepCircle index={index} state={state} />
      </div>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-6 ${meta.labelClassName}`}>{label}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`ui-badge ${meta.pillClassName}`}>
            {meta.pill}
          </span>
          {dateLabel ? <span className="ui-caption">{dateLabel}</span> : null}
        </div>
      </div>
    </li>
  );
}

function DesktopStep({
  label,
  index,
  state,
  dateLabel,
}: {
  label: string;
  index: number;
  state: StepState;
  dateLabel?: string | null;
}) {
  const meta = getStateMeta(state);
  const footerLabel = state === "current" ? "In progress" : state === "released" ? "Complete" : null;

  return (
    <li className="relative flex flex-col items-center px-2 text-center">
      <StepCircle index={index} state={state} />
      <div className={`mt-3 flex min-h-[7.25rem] w-full flex-col items-center rounded-xl border px-3 py-3.5 shadow-sm transition-colors duration-200 ${meta.containerClassName}`}>
        <p className={`max-w-full text-sm font-semibold leading-6 ${meta.labelClassName}`}>{label}</p>
        <div className="mt-2 flex flex-col items-center gap-2">
          <span className={`ui-badge ${meta.pillClassName}`}>
            {meta.pill}
          </span>
          {dateLabel ? <span className="ui-caption leading-5">{dateLabel}</span> : null}
        </div>
        {footerLabel ? <span className="mt-auto pt-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--success)]">{footerLabel}</span> : null}
      </div>
    </li>
  );
}

export function ApplicationProgressOverview({
  application,
}: {
  application: ApplicantLatestApplicationRow | null;
}) {
  if (!application) {
    return (
      <EmptyState
        title="No application progress available yet."
        description="Submit your first application to see the progress tracker here."
        action={
          <Link href="/applicant/application" className={actionButtonStyles("primary", "sm")}>
            Start application
          </Link>
        }
      />
    );
  }

  const currentIndex = getCurrentStepIndex(application.status);
  const banner = getStatusBanner(application.status);
  const lastUpdated = formatDateLabel(application.updatedAt ?? application.dateSubmitted);
  const submittedAt = formatDateLabel(application.dateSubmitted);
  const detailsHref = `/applicant/my-applications/${application.id}`;

  return (
    <div className="space-y-5" aria-label={`Application progress for ${application.applicationNumber}`}>
      <div className={`grid gap-3 ${applicantSummaryTileClass} sm:grid-cols-3 bg-[var(--surface)]`}>
        <div>
          <p className={applicantSummaryLabelClass}>Current Status</p>
          <div className="mt-2">
            <StatusBadge status={application.status} />
          </div>
        </div>
        <div>
          <p className={applicantSummaryLabelClass}>Application No</p>
          <p className="mt-2 font-mono text-sm font-semibold text-[var(--foreground)]">{application.applicationNumber}</p>
        </div>
        <div>
          <p className={applicantSummaryLabelClass}>Last Updated</p>
          <p className="mt-2 text-sm font-medium text-[var(--foreground)]">{lastUpdated ?? submittedAt ?? "-"}</p>
        </div>
      </div>

      {banner ? <InfoBanner title={banner.title} description={banner.description} variant={banner.variant} /> : null}

      <div>
        <ol className="space-y-3 xl:hidden">
          {WORKFLOW_STEPS.map((stepLabel, index) => {
            const state = getStepState(application.status, currentIndex, index);
            const dateLabel = index === 0 ? submittedAt : index === currentIndex ? lastUpdated : null;

            return (
              <StepCard
                key={stepLabel}
                label={stepLabel}
                index={index}
                state={state}
                dateLabel={dateLabel}
              />
            );
          })}
        </ol>

        <div className="hidden xl:block">
          <div className="relative">
            <span className="absolute left-6 right-6 top-5 h-px bg-[var(--border-color)]" aria-hidden="true" />
            <ol className="relative grid grid-cols-7 gap-2">
              {WORKFLOW_STEPS.map((stepLabel, index) => {
                const state = getStepState(application.status, currentIndex, index);
                const dateLabel = index === 0 ? submittedAt : index === currentIndex ? lastUpdated : null;

                return (
                  <DesktopStep
                    key={stepLabel}
                    label={stepLabel}
                    index={index}
                    state={state}
                    dateLabel={dateLabel}
                  />
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-[var(--border-color)] pt-4 text-sm text-[var(--ink-muted)]">
        <div className="flex flex-wrap items-center gap-3">
          {[
            { label: "Completed", state: "completed" as const },
            { label: "Current Stage", state: "current" as const },
            { label: "Pending", state: "pending" as const },
            { label: "Returned", state: "returned" as const },
            { label: "Rejected", state: "rejected" as const },
          ].map((item) => {
            const meta = getStateMeta(item.state);
            const LegendIcon = meta.icon;

            return (
              <span key={item.label} className="inline-flex items-center gap-2">
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${meta.circleClassName}`} aria-hidden="true">
                  {LegendIcon ? <LegendIcon className="h-2.5 w-2.5" /> : null}
                </span>
                <span>{item.label}</span>
              </span>
            );
          })}
        </div>

        <div className="w-full sm:w-auto">
          <Link href={detailsHref} className={`${actionButtonStyles("secondary", "sm")} w-full sm:w-auto justify-center`}>
            View Application Details
          </Link>
        </div>
      </div>
    </div>
  );
}