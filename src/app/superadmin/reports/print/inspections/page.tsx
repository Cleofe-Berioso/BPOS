import { notFound } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import {
  buildReportMetadata,
  INSPECTION_COMPLIANCE_OPTIONS,
  INSPECTION_STATUS_OPTIONS,
} from "@/lib/printable-reports";
import {
  getInspectionComplianceReport,
  type InspectionComplianceReportFilters,
} from "@/lib/superadmin-data";
import { buildInspectionReportNarrative, REPORT_PURPOSES } from "@/lib/report-narrative-builders";
import { ReportPageHeader } from "@/components/print/reports/report-page-header";
import { ReportNarrative, ReportSection } from "@/components/print/reports/report-section";
import { ReportSummaryCard } from "@/components/print/reports/report-summary-card";
import { ReportTable } from "@/components/print/reports/report-table";
import { ReportEmptyState } from "@/components/print/reports/report-empty-state";

interface PageProps {
  searchParams: Promise<{
    from?: string;
    to?: string;
    complianceStatus?: string;
    inspectionStatus?: string;
  }>;
}

const COLUMNS = [
  { key: "date", label: "Date", className: "whitespace-nowrap" },
  { key: "businessName", label: "Business Name" },
  { key: "applicationNumber", label: "Application No.", className: "font-mono text-xs whitespace-nowrap" },
  { key: "inspector", label: "Inspector" },
  { key: "complianceStatus", label: "Compliance", className: "whitespace-nowrap" },
  { key: "inspectionStatus", label: "Inspection Status", className: "whitespace-nowrap" },
  { key: "decidedBy", label: "Decided By" },
  { key: "decidedAt", label: "Decided At", className: "whitespace-nowrap" },
];

export default async function InspectionComplianceReportPage({ searchParams }: PageProps) {
  const session = await requireSuperAdminSession();
  if (!session) notFound();

  const params = await searchParams;
  const filters: InspectionComplianceReportFilters = {
    from: params.from,
    to: params.to,
    complianceStatus: params.complianceStatus,
    inspectionStatus: params.inspectionStatus,
  };

  const rows = await getInspectionComplianceReport(filters);

  const meta = buildReportMetadata({
    title: "Inspection Compliance Report",
    generatedBy: session.user.name ?? "IT Administrator",
    dateFrom: params.from,
    dateTo: params.to,
  });

  const totalInspections = rows.length;
  const totalCompliant = rows.filter((r) =>
    r.complianceStatus === "Compliant"
  ).length;
  const totalNonCompliant = rows.filter((r) =>
    r.complianceStatus === "Non-Compliant"
  ).length;
  const totalPendingReview = rows.filter((r) =>
    r.complianceStatus === "Pending Review"
  ).length;
  const pendingVerification = rows.filter((r) =>
    r.inspectionStatus === "Pending Verification"
  ).length;
  const narrative = buildInspectionReportNarrative({
    total: totalInspections,
    totalCompliant,
    totalNonCompliant,
    totalPendingReview,
    pendingVerification,
    dateRange: meta.dateRange,
  });

  const currentQuery = new URLSearchParams();
  if (params.from) currentQuery.set("from", params.from);
  if (params.to) currentQuery.set("to", params.to);
  if (params.complianceStatus) currentQuery.set("complianceStatus", params.complianceStatus);
  if (params.inspectionStatus) currentQuery.set("inspectionStatus", params.inspectionStatus);
  const csvExportUrl = `/api/superadmin/reports/export?reportType=inspections${currentQuery.toString() ? `&${currentQuery.toString()}` : ""}`;

  const resetHref = "/superadmin/reports/print/inspections";

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
            <label htmlFor="complianceStatus" className="text-xs font-medium text-slate-600">
              Compliance
            </label>
            <select
              id="complianceStatus"
              name="complianceStatus"
              defaultValue={params.complianceStatus ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {INSPECTION_COMPLIANCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="inspectionStatus" className="text-xs font-medium text-slate-600">
              Inspection Status
            </label>
            <select
              id="inspectionStatus"
              name="inspectionStatus"
              defaultValue={params.inspectionStatus ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {INSPECTION_STATUS_OPTIONS.map((opt) => (
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

      <ReportSection number={1} title="Report Purpose" description="How to read JIT inspection compliance information.">
        <ReportNarrative paragraphs={[REPORT_PURPOSES.inspections]} />
      </ReportSection>

      <ReportSection number={2} title="Findings & Interpretation" description="Compliance signals from the filtered inspection set.">
        <ReportNarrative paragraphs={narrative.paragraphs} bullets={narrative.bullets} />
      </ReportSection>

      <ReportSection number={3} title="Summary Statistics" description="Headline inspection and verification counts.">
      <ReportSummaryCard
        items={[
          { label: "Total Inspections", value: totalInspections, hint: "Records in scope" },
          { label: "Compliant", value: totalCompliant, hint: "Marked compliant" },
          { label: "Non-Compliant", value: totalNonCompliant, hint: "Marked non-compliant" },
          { label: "Pending BPLO Review", value: totalPendingReview, hint: "Awaiting BPLO review" },
          { label: "Pending Verification", value: pendingVerification, hint: "Awaiting Department Head" },
        ]}
      />
      </ReportSection>

      {pendingVerification > 0 && (
        <div className="no-print rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Note:</strong> {pendingVerification} inspection
          {pendingVerification !== 1 ? "s" : ""} show status{" "}
          <em>Pending Verification</em>. JIT compliance results are not considered
          final until the Department Head has verified them.
        </div>
      )}

      <ReportSection number={4} title="Detailed Inspection Records" description="Line-level field inspection evidence.">
      {rows.length === 0 ? (
        <ReportEmptyState
          description="No inspection records found for the selected filters."
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
