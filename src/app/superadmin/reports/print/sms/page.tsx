import { notFound } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import { buildReportMetadata, SMS_STATUS_OPTIONS } from "@/lib/printable-reports";
import {
  getSmsDeliveryReport,
  type SmsDeliveryReportFilters,
} from "@/lib/superadmin-data";
import { buildSmsReportNarrative, REPORT_PURPOSES } from "@/lib/report-narrative-builders";
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
  { key: "date", label: "Date", className: "whitespace-nowrap" },
  { key: "applicationNumber", label: "Application No.", className: "font-mono text-xs whitespace-nowrap" },
  { key: "maskedPhone", label: "Phone (Masked)", className: "font-mono text-xs whitespace-nowrap" },
  { key: "provider", label: "Provider", className: "whitespace-nowrap" },
  { key: "status", label: "Status", className: "whitespace-nowrap" },
  { key: "messageBody", label: "Message" },
];

export default async function SmsDeliveryReportPage({ searchParams }: PageProps) {
  const session = await requireSuperAdminSession();
  if (!session) notFound();

  const params = await searchParams;
  const filters: SmsDeliveryReportFilters = {
    from: params.from,
    to: params.to,
    status: params.status,
  };

  const rows = await getSmsDeliveryReport(filters);

  const meta = buildReportMetadata({
    title: "SMS Delivery Report",
    generatedBy: session.user.name ?? "IT Administrator",
    dateFrom: params.from,
    dateTo: params.to,
  });

  const totalSent = rows.filter((r) => r.status === "SENT").length;
  const totalFailed = rows.filter((r) => r.status === "FAILED").length;
  const totalSkipped = rows.filter((r) => r.status === "SKIPPED").length;
  const narrative = buildSmsReportNarrative({
    total: rows.length,
    sent: totalSent,
    failed: totalFailed,
    skipped: totalSkipped,
    dateRange: meta.dateRange,
  });

  const currentQuery = new URLSearchParams();
  if (params.from) currentQuery.set("from", params.from);
  if (params.to) currentQuery.set("to", params.to);
  if (params.status) currentQuery.set("status", params.status);
  const csvExportUrl = `/api/superadmin/reports/export?reportType=sms${currentQuery.toString() ? `&${currentQuery.toString()}` : ""}`;

  const resetHref = "/superadmin/reports/print/sms";

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
            <label htmlFor="status" className="text-xs font-medium text-slate-600">
              Delivery Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={params.status ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {SMS_STATUS_OPTIONS.map((opt) => (
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

      <ReportSection number={1} title="Report Purpose" description="Why SMS delivery reporting matters for applicant communication.">
        <ReportNarrative paragraphs={[REPORT_PURPOSES.sms]} />
      </ReportSection>

      <ReportSection number={2} title="Findings & Interpretation" description="Delivery health for the filtered notification log.">
        <ReportNarrative paragraphs={narrative.paragraphs} bullets={narrative.bullets} />
      </ReportSection>

      <ReportSection number={3} title="Summary Statistics" description="Headline SMS delivery outcomes.">
      <ReportSummaryCard
        items={[
          { label: "Total Records", value: rows.length, hint: "SMS attempts logged" },
          { label: "Sent", value: totalSent, hint: "Successful deliveries" },
          { label: "Failed", value: totalFailed, hint: "Delivery failures" },
          { label: "Skipped", value: totalSkipped, hint: "Not sent (disabled / no contact)" },
        ]}
      />
      </ReportSection>

      <ReportSection number={4} title="Detailed SMS Records" description="Line-level notification evidence with masked phone numbers.">
      {rows.length === 0 ? (
        <ReportEmptyState
          description="No SMS delivery records found for the selected filters."
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
