import { notFound } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import { buildReportMetadata, BUSINESS_STATUS_OPTIONS } from "@/lib/printable-reports";
import {
  getBusinessRegistryReport,
  type BusinessRegistryReportFilters,
} from "@/lib/superadmin-data";
import { buildRegistryReportNarrative, REPORT_PURPOSES } from "@/lib/report-narrative-builders";
import { ReportPageHeader } from "@/components/print/reports/report-page-header";
import { ReportNarrative, ReportSection } from "@/components/print/reports/report-section";
import { ReportSummaryCard } from "@/components/print/reports/report-summary-card";
import { ReportTable } from "@/components/print/reports/report-table";
import { ReportEmptyState } from "@/components/print/reports/report-empty-state";

interface PageProps {
  searchParams: Promise<{
    barangay?: string;
    businessType?: string;
    status?: string;
  }>;
}

const COLUMNS = [
  { key: "businessName", label: "Business Name", className: "print:text-[9.5px] print:break-words" },
  { key: "tradeName", label: "Trade Name", className: "print:text-[9.5px] print:break-words" },
  { key: "owner", label: "Owner", className: "print:text-[9.5px] print:break-words" },
  { key: "businessType", label: "Business Type", className: "print:text-[9.5px] print:break-words" },
  { key: "lineOfBusiness", label: "Line of Business", className: "print:text-[9.5px] print:break-words" },
  { key: "address", label: "Barangay / Address", className: "print:text-[9.5px] print:break-words" },
  { key: "permitNumber", label: "Permit No.", className: "font-mono text-xs whitespace-nowrap print:text-[9px] print:whitespace-nowrap" },
  { key: "permitValidity", label: "Permit Validity", className: "whitespace-nowrap print:text-[9.5px] print:whitespace-normal" },
  { key: "businessStatus", label: "Status", className: "whitespace-nowrap print:text-[9.5px] print:whitespace-normal" },
];

export default async function BusinessRegistryReportPage({ searchParams }: PageProps) {
  const session = await requireSuperAdminSession();
  if (!session) notFound();

  const params = await searchParams;
  const filters: BusinessRegistryReportFilters = {
    barangay: params.barangay,
    businessType: params.businessType,
    status: params.status,
  };

  const rows = await getBusinessRegistryReport(filters);

  const meta = buildReportMetadata({
    title: "Business Registry Report",
    generatedBy: session.user.name ?? "IT Administrator",
  });

  const activeCount = rows.filter((r) => r.businessStatus === "Active").length;
  const inactiveCount = rows.filter((r) => r.businessStatus === "Inactive").length;
  const closedCount = rows.filter((r) => r.businessStatus === "Closed").length;
  const withPermit = rows.filter((r) => r.permitNumber !== "-").length;
  const narrative = buildRegistryReportNarrative({
    total: rows.length,
    activeCount,
    inactiveCount,
    closedCount,
    withPermit,
  });

  const currentQuery = new URLSearchParams();
  if (params.barangay) currentQuery.set("barangay", params.barangay);
  if (params.businessType) currentQuery.set("businessType", params.businessType);
  if (params.status) currentQuery.set("status", params.status);
  const csvExportUrl = `/api/superadmin/reports/export?reportType=business-registry${currentQuery.toString() ? `&${currentQuery.toString()}` : ""}`;

  const resetHref = "/superadmin/reports/print/business-registry";

  return (
    <div className="report-print-container mx-auto max-w-[1300px] space-y-6 p-4 sm:p-8">
      <ReportPageHeader
        meta={meta}
        backHref="/superadmin/reports"
        csvExportUrl={csvExportUrl}
        orientation="landscape"
      />

      {/* ── Filter form (screen only) ──────────────────────────────── */}
      <div className="no-print rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Filter Records
        </p>
        <form method="GET" className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="barangay" className="text-xs font-medium text-slate-600">
              Barangay
            </label>
            <input
              id="barangay"
              type="text"
              name="barangay"
              defaultValue={params.barangay ?? ""}
              placeholder="e.g. Tagumpay"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="businessType" className="text-xs font-medium text-slate-600">
              Business Type
            </label>
            <input
              id="businessType"
              type="text"
              name="businessType"
              defaultValue={params.businessType ?? ""}
              placeholder="e.g. Single Proprietorship"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="status" className="text-xs font-medium text-slate-600">
              Business Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={params.status ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {BUSINESS_STATUS_OPTIONS.map((opt) => (
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

      <ReportSection number={1} title="Report Purpose" description="What this masterlist report explains.">
        <ReportNarrative paragraphs={[REPORT_PURPOSES.registry]} />
      </ReportSection>

      <ReportSection number={2} title="Findings & Interpretation" description="Reading the registry as operational information.">
        <ReportNarrative paragraphs={narrative.paragraphs} bullets={narrative.bullets} />
      </ReportSection>

      <ReportSection number={3} title="Summary Statistics" description="Headline counts for the filtered registry view.">
        <ReportSummaryCard
          items={[
            { label: "Total Records", value: rows.length, hint: "Business records in scope" },
            { label: "Active", value: activeCount, hint: "Operating businesses" },
            { label: "Inactive", value: inactiveCount, hint: "Not currently active" },
            { label: "Closed", value: closedCount, hint: "Marked closed in registry" },
            { label: "With Permit", value: withPermit, hint: "Linked to a released permit no." },
          ]}
        />
      </ReportSection>

      <ReportSection number={4} title="Detailed Registry Records" description="Line-level masterlist evidence.">
      {rows.length === 0 ? (
        <ReportEmptyState description="No business registry records match the selected filters." />
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
