import { notFound } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import {
  buildReportMetadata,
  AUDIT_MODULE_OPTIONS,
  ACTOR_ROLE_OPTIONS,
} from "@/lib/printable-reports";
import {
  getAuditTrailReport,
  type AuditTrailReportFilters,
} from "@/lib/superadmin-data";
import { buildAuditTrailReportNarrative, REPORT_PURPOSES } from "@/lib/report-narrative-builders";
import { ReportPageHeader } from "@/components/print/reports/report-page-header";
import { ReportNarrative, ReportSection } from "@/components/print/reports/report-section";
import { ReportSummaryCard } from "@/components/print/reports/report-summary-card";
import { ReportTable } from "@/components/print/reports/report-table";
import { ReportEmptyState } from "@/components/print/reports/report-empty-state";

interface PageProps {
  searchParams: Promise<{
    from?: string;
    to?: string;
    actorRole?: string;
    module?: string;
  }>;
}

const COLUMNS = [
  { key: "date", label: "Date", className: "whitespace-nowrap" },
  { key: "actorName", label: "Actor" },
  { key: "actorRole", label: "Role", className: "whitespace-nowrap" },
  { key: "action", label: "Action", className: "whitespace-nowrap font-mono text-xs" },
  { key: "module", label: "Module", className: "whitespace-nowrap" },
  { key: "entityType", label: "Entity", className: "whitespace-nowrap" },
  { key: "description", label: "Description" },
  { key: "beforeStatus", label: "Before", className: "whitespace-nowrap" },
  { key: "afterStatus", label: "After", className: "whitespace-nowrap" },
];

export default async function AuditTrailReportPage({ searchParams }: PageProps) {
  const session = await requireSuperAdminSession();
  if (!session) notFound();

  const params = await searchParams;
  const filters: AuditTrailReportFilters = {
    from: params.from,
    to: params.to,
    actorRole: params.actorRole,
    module: params.module,
  };

  const rows = await getAuditTrailReport(filters);

  const meta = buildReportMetadata({
    title: "Audit Trail Report",
    generatedBy: session.user.name ?? "IT Administrator",
    dateFrom: params.from,
    dateTo: params.to,
  });

  const totalEntries = rows.length;
  const uniqueActors = new Set(rows.map((r) => r.actorName).filter((n) => n !== "-")).size;
  const uniqueModules = new Set(rows.map((r) => r.module)).size;
  const uniqueActions = new Set(rows.map((r) => r.action)).size;
  const narrative = buildAuditTrailReportNarrative({
    total: totalEntries,
    dateRange: meta.dateRange,
  });

  const currentQuery = new URLSearchParams();
  if (params.from) currentQuery.set("from", params.from);
  if (params.to) currentQuery.set("to", params.to);
  if (params.actorRole) currentQuery.set("actorRole", params.actorRole);
  if (params.module) currentQuery.set("module", params.module);
  const csvExportUrl = `/api/superadmin/reports/export?reportType=audit-trail${currentQuery.toString() ? `&${currentQuery.toString()}` : ""}`;

  const resetHref = "/superadmin/reports/print/audit-trail";

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
              From Date
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
              To Date
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
            <label htmlFor="actorRole" className="text-xs font-medium text-slate-600">
              Actor Role
            </label>
            <select
              id="actorRole"
              name="actorRole"
              defaultValue={params.actorRole ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {ACTOR_ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="module" className="text-xs font-medium text-slate-600">
              Module
            </label>
            <select
              id="module"
              name="module"
              defaultValue={params.module ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {AUDIT_MODULE_OPTIONS.map((opt) => (
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
        {totalEntries >= 1000 && (
          <p className="mt-3 text-xs text-amber-700">
            Results are capped at 1,000 entries. Apply date or role filters to narrow the range.
          </p>
        )}
      </div>

      <ReportSection number={1} title="Report Purpose" description="How to use audit evidence for accountability reviews.">
        <ReportNarrative paragraphs={[REPORT_PURPOSES.auditTrail]} />
      </ReportSection>

      <ReportSection number={2} title="Findings & Interpretation" description="Reading audit volume as an oversight signal.">
        <ReportNarrative paragraphs={narrative.paragraphs} bullets={narrative.bullets} />
      </ReportSection>

      <ReportSection number={3} title="Summary Statistics" description="Coverage of actors, modules, and actions in this extract.">
      <ReportSummaryCard
        items={[
          { label: "Total Entries", value: totalEntries, hint: "Audit events listed" },
          { label: "Unique Actors", value: uniqueActors, hint: "Distinct user names" },
          { label: "Modules Covered", value: uniqueModules, hint: "System areas touched" },
          { label: "Distinct Actions", value: uniqueActions, hint: "Different action types" },
        ]}
      />
      </ReportSection>

      <ReportSection number={4} title="Detailed Audit Records" description="Chronological accountability evidence.">
      {rows.length === 0 ? (
        <ReportEmptyState
          description="No audit log entries found for the selected filters."
        />
      ) : (
        <ReportTable
          columns={COLUMNS}
          rows={(rows as unknown) as Record<string, unknown>[]}
        />
      )}
      </ReportSection>
    </div>
  );
}
