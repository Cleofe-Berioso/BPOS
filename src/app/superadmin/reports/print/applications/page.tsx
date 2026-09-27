import { notFound } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import {
  buildReportMetadata,
  APPLICATION_STATUS_OPTIONS,
  APPLICATION_TYPE_OPTIONS,
  labelApplicationType,
} from "@/lib/printable-reports";
import {
  getApplicationSummaryReport,
  type AppSummaryReportFilters,
} from "@/lib/superadmin-data";
import { buildApplicationReportNarrative, REPORT_PURPOSES } from "@/lib/report-narrative-builders";
import { ReportPageHeader } from "@/components/print/reports/report-page-header";
import { ReportNarrative, ReportSection } from "@/components/print/reports/report-section";
import { ReportSummaryCard } from "@/components/print/reports/report-summary-card";
import { ReportTable } from "@/components/print/reports/report-table";
import { ReportEmptyState } from "@/components/print/reports/report-empty-state";

interface PageProps {
  searchParams: Promise<{
    from?: string;
    to?: string;
    status?: string;
    applicationType?: string;
  }>;
}

const COLUMNS = [
  { key: "applicationNumber", label: "Application No.", className: "font-mono text-xs whitespace-nowrap" },
  { key: "applicationType", label: "Type", className: "whitespace-nowrap" },
  { key: "businessName", label: "Business Name" },
  { key: "ownerName", label: "Owner / Applicant" },
  { key: "status", label: "Status", className: "whitespace-nowrap" },
  { key: "submittedDate", label: "Submitted", className: "whitespace-nowrap" },
  { key: "lastUpdated", label: "Last Updated", className: "whitespace-nowrap" },
];

export default async function ApplicationSummaryReportPage({ searchParams }: PageProps) {
  const session = await requireSuperAdminSession();
  if (!session) notFound();

  const params = await searchParams;
  const filters: AppSummaryReportFilters = {
    from: params.from,
    to: params.to,
    status: params.status,
    applicationType: params.applicationType,
  };

  const rows = await getApplicationSummaryReport(filters);

  const meta = buildReportMetadata({
    title: "Application Summary Report",
    generatedBy: session.user.name ?? "IT Administrator",
    dateFrom: params.from,
    dateTo: params.to,
  });

  const totalNew = rows.filter((r) => r.applicationType === "NEW").length;
  const totalRenewal = rows.filter((r) => r.applicationType === "RENEWAL").length;
  const totalClosure = rows.filter((r) => r.applicationType === "CLOSURE").length;
  const totalReleased = rows.filter((r) => r.status === "Released").length;
  const narrative = buildApplicationReportNarrative({
    total: rows.length,
    totalNew,
    totalRenewal,
    totalClosure,
    totalReleased,
    dateRange: meta.dateRange,
  });

  const tableRows = rows.map((r) => ({
    ...r,
    applicationType: labelApplicationType(r.applicationType),
  }));

  // Build filter query string for form reset
  const resetHref = "/superadmin/reports/print/applications";
  const currentQuery = new URLSearchParams();
  if (params.from) currentQuery.set("from", params.from);
  if (params.to) currentQuery.set("to", params.to);
  if (params.status) currentQuery.set("status", params.status);
  if (params.applicationType) currentQuery.set("applicationType", params.applicationType);
  const csvExportUrl = `/api/superadmin/reports/export?reportType=applications${currentQuery.toString() ? `&${currentQuery.toString()}` : ""}`;

  return (
    <div className="report-print-container mx-auto max-w-[1200px] space-y-6 p-4 sm:p-8">
      <ReportPageHeader meta={meta} backHref="/superadmin/reports" csvExportUrl={csvExportUrl} />

      {/* ── Filter form (screen only) ──────────────────────────────── */}
      <div className="no-print rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Filter Records
        </p>
        <form method="GET" className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="from" className="text-xs font-medium text-slate-600">
              Date From
            </label>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={params.from ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="to" className="text-xs font-medium text-slate-600">
              Date To
            </label>
            <input
              id="to"
              type="date"
              name="to"
              defaultValue={params.to ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="status" className="text-xs font-medium text-slate-600">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={params.status ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {APPLICATION_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="applicationType" className="text-xs font-medium text-slate-600">
              Application Type
            </label>
            <select
              id="applicationType"
              name="applicationType"
              defaultValue={params.applicationType ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {APPLICATION_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-lg border border-indigo-500 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Apply Filters
            </button>
            <a
              href={resetHref}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset
            </a>
          </div>
        </form>
      </div>

      <ReportSection number={1} title="Report Purpose" description="What this report explains and when to use it.">
        <ReportNarrative paragraphs={[REPORT_PURPOSES.applications]} />
      </ReportSection>

      <ReportSection
        number={2}
        title="Findings & Interpretation"
        description="Turning the filtered record set into actionable information."
      >
        <ReportNarrative paragraphs={narrative.paragraphs} bullets={narrative.bullets} />
      </ReportSection>

      <ReportSection
        number={3}
        title="Summary Statistics"
        description="Headline counts for the filtered application population."
      >
        <ReportSummaryCard
          items={[
            { label: "Total Records", value: rows.length, hint: "Applications in scope" },
            { label: "New", value: totalNew, hint: "First-time business filings" },
            { label: "Renewal", value: totalRenewal, hint: "Continuing business filings" },
            { label: "Closure", value: totalClosure, hint: "Exit / retirement filings" },
            { label: "Released", value: totalReleased, hint: "Completed through release" },
          ]}
        />
      </ReportSection>

      <ReportSection
        number={4}
        title="Detailed Application Records"
        description="Line-level evidence for audit sampling, backlog review, and applicant follow-up."
      >
      {rows.length === 0 ? (
        <ReportEmptyState description="No applications match the selected filters. Adjust the date range, status, or application type and try again." />
      ) : (
        <ReportTable
          caption={`${rows.length.toLocaleString("en-PH")} record${rows.length !== 1 ? "s" : ""}`}
          columns={COLUMNS}
          rows={(tableRows as unknown) as Record<string, unknown>[]}
        />
      )}
      </ReportSection>
    </div>
  );
}
