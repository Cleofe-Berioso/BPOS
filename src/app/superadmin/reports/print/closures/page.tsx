import { notFound } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import { buildReportMetadata, APPLICATION_STATUS_OPTIONS } from "@/lib/printable-reports";
import {
  getBusinessClosureReport,
  type BusinessClosureReportFilters,
} from "@/lib/superadmin-data";
import { buildClosureReportNarrative, REPORT_PURPOSES } from "@/lib/report-narrative-builders";
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
  }>;
}

const COLUMNS = [
  { key: "applicationNumber", label: "Application No.", className: "font-mono text-xs whitespace-nowrap" },
  { key: "businessName", label: "Business Name" },
  { key: "owner", label: "Owner" },
  { key: "closureStatus", label: "Closure Status", className: "whitespace-nowrap" },
  { key: "closureCertStatus", label: "Closure Certificate", className: "whitespace-nowrap" },
  { key: "submittedDate", label: "Submitted", className: "whitespace-nowrap" },
  { key: "releasedDate", label: "Released Date", className: "whitespace-nowrap" },
];

export default async function BusinessClosureReportPage({ searchParams }: PageProps) {
  const session = await requireSuperAdminSession();
  if (!session) notFound();

  const params = await searchParams;
  const filters: BusinessClosureReportFilters = {
    from: params.from,
    to: params.to,
    status: params.status,
  };

  const rows = await getBusinessClosureReport(filters);

  const meta = buildReportMetadata({
    title: "Business Closure Report",
    generatedBy: session.user.name ?? "IT Administrator",
    dateFrom: params.from,
    dateTo: params.to,
  });

  const releasedCerts = rows.filter((r) => r.closureCertStatus === "Released").length;
  const pendingClosures = rows.filter((r) =>
    !["Released", "Rejected"].includes(r.closureStatus)
  ).length;
  const withCert = rows.filter((r) => r.closureCertStatus !== "Not Issued").length;
  const narrative = buildClosureReportNarrative({
    total: rows.length,
    releasedCount: releasedCerts,
    pendingCount: pendingClosures,
    dateRange: meta.dateRange,
  });

  const currentQuery = new URLSearchParams();
  if (params.from) currentQuery.set("from", params.from);
  if (params.to) currentQuery.set("to", params.to);
  if (params.status) currentQuery.set("status", params.status);
  const csvExportUrl = `/api/superadmin/reports/export?reportType=closures${currentQuery.toString() ? `&${currentQuery.toString()}` : ""}`;

  const resetHref = "/superadmin/reports/print/closures";

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
              Submitted From
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
              Submitted To
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
              Closure Status
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

      <ReportSection number={1} title="Report Purpose" description="Why closure reporting matters for inventory control.">
        <ReportNarrative paragraphs={[REPORT_PURPOSES.closures]} />
      </ReportSection>

      <ReportSection number={2} title="Findings & Interpretation" description="What the closure cohort indicates.">
        <ReportNarrative paragraphs={narrative.paragraphs} bullets={narrative.bullets} />
      </ReportSection>

      <ReportSection number={3} title="Summary Statistics" description="Headline closure and certificate counts.">
        <ReportSummaryCard
          items={[
            { label: "Total Closures", value: rows.length, hint: "Closure applications in scope" },
            { label: "Pending", value: pendingClosures, hint: "Not yet released or rejected" },
            { label: "With Certificate", value: withCert, hint: "Certificate record exists" },
            { label: "Certificate Released", value: releasedCerts, hint: "Exit document completed" },
          ]}
        />
      </ReportSection>

      <ReportSection number={4} title="Detailed Closure Records" description="Line-level closure evidence.">
      {rows.length === 0 ? (
        <ReportEmptyState description="No closure applications found for the selected filters." />
      ) : (
        <ReportTable
          caption={`${rows.length.toLocaleString("en-PH")} record${rows.length !== 1 ? "s" : ""}`}
          columns={COLUMNS}
          rows={(rows as unknown) as Record<string, unknown>[]}
        />
      )}
      </ReportSection>
    </div>
  );
}
