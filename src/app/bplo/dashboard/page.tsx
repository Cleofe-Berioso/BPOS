import Link from "next/link";
import { CheckCircle2, ClipboardCheck, FileWarning, PackageCheck, Wallet } from "lucide-react";
import {
  getBploApplicationTypeSummary,
  getBploDashboardSummary,
  listRecentBploSubmissions,
} from "@/lib/bplo-applications";
import { getBploDashboardMetrics } from "@/lib/bplo-dashboard";
import { DashboardSummaryCard } from "@/components/applicant/dashboard-summary-card";
import { StatusBadge } from "@/components/applicant/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { actionButtonStyles } from "@/components/ui/action-button";
import { RoleBadge } from "@/components/ui/role-badge";
import { DashboardQueueCard } from "@/components/ui/dashboard-queue-card";
import { DashboardPieChart } from "@/components/ui/dashboard-pie-chart";
import { DashboardLineChart } from "@/components/ui/dashboard-line-chart";
import { DashboardBarChart } from "@/components/ui/dashboard-bar-chart";
import { DashboardStackedBarChart } from "@/components/ui/dashboard-stacked-bar-chart";
import { DASHBOARD_CHART_COLORS } from "@/components/ui/dashboard-chart-card";

export default async function BploDashboard() {
  const [summary, typeSummary, recentSubmissions, metrics] = await Promise.all([
    getBploDashboardSummary(),
    getBploApplicationTypeSummary(),
    listRecentBploSubmissions(),
    getBploDashboardMetrics(),
  ]);

  const actionRequiredQueues = [
    {
      title: "Returned for Correction",
      description: "Review applicant resubmissions and remarks.",
      count: summary.returnedForCorrection,
      href: "/bplo/applications",
      tone: "danger" as const,
      icon: <FileWarning className="h-4 w-4" />,
    },
    {
      title: "Submitted Queue",
      description: "New applications waiting for BPLO review.",
      count: summary.submittedApplications,
      href: "/bplo/applications",
      tone: "info" as const,
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      title: "Payment Verification",
      description: "Payments waiting for verification or confirmation.",
      count: summary.pendingPaymentVerification,
      href: "/bplo/payment-verification",
      tone: "warning" as const,
      icon: <Wallet className="h-4 w-4" />,
    },
    {
      title: "For Release",
      description: "Approved documents ready for release preparation.",
      count: summary.forRelease,
      href: "/bplo/permit-issuance",
      tone: "success" as const,
      icon: <PackageCheck className="h-4 w-4" />,
    },
  ];

  const pipelineRows = [
    { status: "Draft" as const, value: "N/A" },
    { status: "Submitted" as const, value: summary.submittedApplications },
    { status: "Under Review" as const, value: summary.underReview },
    { status: "Assessed" as const, value: summary.assessedApplications },
    { status: "Approved for Payment" as const, value: summary.approvedForPayment },
    { status: "Paid" as const, value: summary.paidApplications },
    { status: "For Release" as const, value: summary.forRelease },
    { status: "Released" as const, value: summary.releasedPermits },
  ];

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="BPLO"
        title="BPLO Dashboard"
        description="Quick overview of applications that need BPLO attention."
        badge={<RoleBadge roleType="BPLO" />}
        showHeroWatermark
      />

      <SectionCard title="Action Required Now" description="Priority queues needing immediate attention.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actionRequiredQueues.map((queue) => (
            <DashboardQueueCard key={queue.title} {...queue} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Key Metrics" description="Application totals and workload indicators.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardSummaryCard
            title="New Applications"
            value={String(typeSummary.totalNew)}
            subtitle="New business permit applications"
            tone="blue"
          />
          <DashboardSummaryCard
            title="Renewal Applications"
            value={String(typeSummary.totalRenewal)}
            subtitle="Renewal applications"
            tone="amber"
          />
          <DashboardSummaryCard
            title="Closure Applications"
            value={String(typeSummary.totalClosure)}
            subtitle="Closure requests"
            tone="blue"
          />
          <DashboardSummaryCard
            title="Action Required"
            value={String(
              summary.returnedForCorrection +
                summary.submittedApplications +
                summary.approvedForPayment +
                summary.forRelease
            )}
            subtitle="Returned, submitted, payment, and release queues"
            tone="red"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Workflow Overview"
        description="Application counts across each workflow stage."
      >
        <p className="ui-caption mb-2">
          Returned for Correction is tracked separately in Action Required Now.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {pipelineRows.map((row) => (
            <div
              key={row.status}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-2"
            >
              <StatusBadge status={row.status as any} />
              <p className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
                {typeof row.value === "number" ? row.value.toLocaleString("en-PH") : row.value}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardPieChart
          title="Application Status Distribution"
          description="Current application counts by workflow stage (all statuses)."
          data={metrics.applicationStatusDistribution}
        />
        <DashboardLineChart
          title="Applications Completed Per Day"
          description="Daily count of first RELEASED or REJECTED completions (last 14 days)."
          data={metrics.applicationsProcessedPerDay}
          lineLabel="Completed Applications"
        />
        <DashboardBarChart
          title="Processing Time per Application"
          description="Average hours from submittedAt to first RELEASED/REJECTED completion."
          data={metrics.processingTimeByApplicationType}
          barLabel="Average Hours"
        />
        <DashboardStackedBarChart
          title="Pending Queue by Status"
          description="Active BPLO workloads: review, assessment, payment verification, and release."
          data={metrics.pendingQueueByStatus}
          categoryKey="queue"
          series={[
            { key: "bploReview", label: "BPLO Review", color: DASHBOARD_CHART_COLORS[2] },
            { key: "assessment", label: "Assessment", color: DASHBOARD_CHART_COLORS[0] },
            { key: "paymentVerification", label: "Payment Verification", color: DASHBOARD_CHART_COLORS[3] },
            { key: "permitRelease", label: "Permit Release", color: DASHBOARD_CHART_COLORS[1] },
          ]}
        />
      </div>

      <SectionCard title="Recent Activity" description="Most recently filed applications.">
        <div className="space-y-2">
          {recentSubmissions.length > 0 ? (
            recentSubmissions.map((row) => (
              <article
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-2.5"
              >
                <div className="min-w-0 flex-grow">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{row.applicationNumber}</p>
                    <StatusBadge status={row.status as any} />
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--ink-muted)]">{row.businessName}</p>
                  <p className="ui-caption">
                    {row.applicantName} · {row.dateSubmitted}
                  </p>
                </div>
                <Link href="/bplo/applications" className={actionButtonStyles("secondary", "sm")}>
                  View
                </Link>
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--muted-surface)] px-4 py-4 text-center">
              <CheckCircle2 className="mx-auto mb-1.5 h-6 w-6 text-[var(--ink-muted)]" />
              <p className="text-sm font-medium text-[var(--foreground)]">No recent submissions</p>
              <p className="ui-caption">Newly filed applications will appear here.</p>
            </div>
          )}
        </div>
      </SectionCard>
    </section>
  );
}
