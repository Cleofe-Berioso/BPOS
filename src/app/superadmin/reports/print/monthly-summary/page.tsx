import { notFound } from "next/navigation";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import {
  buildMonthlyReportMetadata,
  formatReportCurrency,
  labelApplicationType,
  reportPercentOf,
  resolveReportMonthYear,
} from "@/lib/printable-reports";
import { buildMonthlySummaryNarrative, REPORT_PURPOSES } from "@/lib/report-narrative-builders";
import { getMonthlySummaryReport } from "@/lib/superadmin-data";
import { ReportPageHeader } from "@/components/print/reports/report-page-header";
import { ReportMonthYearFilter } from "@/components/print/reports/report-month-year-filter";
import { ReportNarrative, ReportSection } from "@/components/print/reports/report-section";
import { ReportSummaryCard } from "@/components/print/reports/report-summary-card";
import { ReportTable } from "@/components/print/reports/report-table";

interface PageProps {
  searchParams: Promise<{ month?: string; year?: string }>;
}

export default async function MonthlySummaryReportPage({ searchParams }: PageProps) {
  const session = await requireSuperAdminSession();
  if (!session) notFound();

  const params = await searchParams;
  const { month, year } = resolveReportMonthYear(params);
  const summary = await getMonthlySummaryReport(month, year);

  const meta = buildMonthlyReportMetadata({
    title: "Monthly Executive Summary Report",
    generatedBy: session.user.name ?? "IT Administrator",
    month,
    year,
  });

  const narrative = buildMonthlySummaryNarrative({
    periodLabel: summary.periodLabel,
    applicationsSubmitted: summary.applicationsSubmitted,
    permitsReleased: summary.permitsReleased,
    closureCertificatesReleased: summary.closureCertificatesReleased,
    inspectionsConducted: summary.inspectionsConducted,
    verifiedPayments: summary.verifiedPayments,
    paymentAmount: summary.verifiedPaymentAmount,
    bploActions: summary.bploActions,
    newUsers: summary.newUsers,
    releasedApplications: summary.releasedApplications,
    returnedForCorrection: summary.returnedForCorrection,
  });

  const typeRows = summary.applicationsByType.map((row) => ({
    category: labelApplicationType(row.type),
    count: row.count,
    share: reportPercentOf(row.count, summary.applicationsSubmitted),
    meaning:
      row.type === "NEW"
        ? "First-time registrations and full document validation load"
        : row.type === "RENEWAL"
          ? "Recurring assessment and renewal notice workload"
          : "Business exit filings and closure certificate processing",
  }));

  const statusRows = summary.applicationsByStatus
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((row) => ({
      status: row.status,
      count: row.count,
      share: reportPercentOf(row.count, summary.applicationsSubmitted),
    }));

  const csvExportUrl = `/api/superadmin/reports/export?reportType=monthly-summary&month=${month}&year=${year}`;

  return (
    <div className="report-print-container mx-auto max-w-[1200px] space-y-6 p-4 sm:p-8">
      <ReportPageHeader meta={meta} backHref="/superadmin/reports" csvExportUrl={csvExportUrl} />

      <ReportMonthYearFilter
        action="/superadmin/reports/print/monthly-summary"
        month={month}
        year={year}
        resetHref="/superadmin/reports/print/monthly-summary"
      />

      <ReportSection
        number={1}
        title="Report Purpose"
        description="Why this monthly summary exists and how to read it."
      >
        <ReportNarrative paragraphs={[REPORT_PURPOSES.monthlySummary]} />
      </ReportSection>

      <ReportSection
        number={2}
        title="Executive Summary"
        description="Management reading of the selected month — filing volume, releases, compliance, and operational activity."
      >
        <ReportNarrative paragraphs={narrative.paragraphs} bullets={narrative.bullets} />
      </ReportSection>

      <ReportSection
        number={3}
        title="Key Performance Indicators"
        description="Headline counts that answer whether the municipality processed filings, released documents, and maintained oversight."
      >
        <ReportSummaryCard
          items={[
            {
              label: "Applications Submitted",
              value: summary.applicationsSubmitted,
              hint: "Filings recorded in the month",
            },
            {
              label: "Released Applications",
              value: summary.releasedApplications,
              hint: "Applications that reached Released",
            },
            {
              label: "Permits Released",
              value: summary.permitsReleased,
              hint: "Business permits marked RELEASED",
            },
            {
              label: "Closure Certificates",
              value: summary.closureCertificatesReleased,
              hint: "Closure certificates released",
            },
            {
              label: "JIT Inspections",
              value: summary.inspectionsConducted,
              hint: "Field inspections logged",
            },
            {
              label: "Verified Payments",
              value: summary.verifiedPayments,
              hint: "Payment proofs verified by BPLO",
            },
            {
              label: "Payment Amount",
              value: formatReportCurrency(summary.verifiedPaymentAmount),
              hint: "Total verified payment value",
            },
            {
              label: "BPLO Actions",
              value: summary.bploActions,
              hint: "Workflow history entries",
            },
          ]}
        />
      </ReportSection>

      <ReportSection
        number={4}
        title="Filing Mix by Application Type"
        description="What kind of municipal workload entered the pipeline during the month."
      >
        {typeRows.length === 0 ? (
          <ReportNarrative paragraphs={["No applications were submitted during this month."]} />
        ) : (
          <ReportTable
            caption={`${summary.applicationsSubmitted.toLocaleString("en-PH")} total submission${summary.applicationsSubmitted === 1 ? "" : "s"}`}
            columns={[
              { key: "category", label: "Application Type" },
              { key: "count", label: "Count", className: "tabular-nums" },
              { key: "share", label: "Share", className: "whitespace-nowrap" },
              { key: "meaning", label: "What It Means" },
            ]}
            rows={typeRows as unknown as Record<string, unknown>[]}
          />
        )}
      </ReportSection>

      <ReportSection
        number={5}
        title="Pipeline Status at Submission"
        description="Where submitted applications stood at the time of filing — useful for backlog and correction pressure."
      >
        {statusRows.length === 0 ? (
          <ReportNarrative paragraphs={["No status breakdown is available because no applications were submitted."]} />
        ) : (
          <ReportTable
            caption="Status distribution for submissions in the selected month"
            columns={[
              { key: "status", label: "Status" },
              { key: "count", label: "Count", className: "tabular-nums" },
              { key: "share", label: "Share of Submissions", className: "whitespace-nowrap" },
            ]}
            rows={statusRows as unknown as Record<string, unknown>[]}
          />
        )}
      </ReportSection>

      <ReportSection
        number={6}
        title="Compliance, Notifications & Accounts"
        description="Supporting signals for field enforcement, applicant communication, and portal adoption."
      >
        <ReportSummaryCard
          description="These indicators explain whether inspections, SMS alerts, and account registrations kept pace with filing activity."
          items={[
            {
              label: "Compliant Inspections",
              value: summary.compliantInspections,
              hint: `${reportPercentOf(summary.compliantInspections, Math.max(summary.inspectionsConducted, 1))} of inspections`,
            },
            {
              label: "Non-Compliant",
              value: summary.nonCompliantInspections,
              hint: "May require DH verification or follow-up",
            },
            {
              label: "Pending Review",
              value: summary.pendingInspectionReview,
              hint: "Awaiting BPLO compliance review",
            },
            {
              label: "Closure Filings",
              value: summary.closuresSubmitted,
              hint: "Submitted closure applications",
            },
            {
              label: "Returned for Correction",
              value: summary.returnedForCorrection,
              hint: "Applicant action still required",
            },
            {
              label: "Rejected",
              value: summary.rejectedApplications,
              hint: "Closed without release",
            },
            {
              label: "SMS Sent",
              value: summary.smsSent,
              hint: "Successful notification deliveries",
            },
            {
              label: "SMS Failed",
              value: summary.smsFailed,
              hint: "Delivery failures to investigate",
            },
            {
              label: "Audit Events",
              value: summary.auditEvents,
              hint: "Accountability log entries",
            },
            {
              label: "New User Accounts",
              value: summary.newUsers,
              hint: "Portal registrations created",
            },
          ]}
        />
      </ReportSection>

      <ReportSection
        number={7}
        title="Management Notes"
        description="Suggested reading before archiving or presenting this monthly report."
      >
        <ReportNarrative
          paragraphs={[
            "Use Section 3 for executive dashboards, Sections 4–5 for BPLO workload reviews, and Section 6 for compliance and communication health.",
            "For line-level evidence, open the specialized printable reports (applications, registry, inspections, audit trail, SMS) with filters matching this month.",
          ]}
          note="Figures are based on system timestamps in UTC and reflect records stored in the Business Permit Online System at generation time."
        />
      </ReportSection>
    </div>
  );
}
